"""Ingestão mensal da base aberta de CNPJ (Receita Federal) para a camada pública do Clyvo Map.

Separa os estabelecimentos ATIVOS do segmento de artigos religiosos (lojas, livrarias, distribuidoras),
localiza cada um pelo município e grava em `public.estabelecimentos` (upsert por CNPJ).

Variáveis de ambiente:
  MODO=teste | gravar          teste: só gera o resumo em saida/; gravar: também envia ao Supabase
  SUPABASE_URL, SUPABASE_SERVICE_KEY   obrigatórias no modo gravar (chave secreta, nunca no app)
  ANTHROPIC_API_KEY            opcional: classifica com IA os achados de confiabilidade média/baixa
  IA_MAX=3000                  limite de estabelecimentos avaliados pela IA por execução
  ARQUIVOS=10                  quantos arquivos Estabelecimentos/Empresas ler (0..9); use menos para testar
"""
import csv, gzip, io, json, os, re, sys, time, unicodedata, urllib.error, urllib.request, zipfile
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from fonte import baixar, mes_mais_recente  # noqa: E402

csv.field_size_limit(10_000_000)
SAIDA = 'saida'
os.makedirs(SAIDA, exist_ok=True)
TMP = os.environ.get('RUNNER_TEMP', '/tmp')
MODO = os.environ.get('MODO', 'teste')
NARQ = int(os.environ.get('ARQUIVOS', '10'))


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().upper()
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]', ' ', s)).strip()


# ---------- regras do segmento ----------
FORTES = ['ARTIGOS RELIGIOSOS', 'ART RELIGIOSOS', 'ARTS RELIGIOSOS', 'ARTIGO RELIGIOSO', 'ARTIGOS CATOLICOS', 'ARTIGOS SACROS',
          'ARTE SACRA', 'ARTES SACRAS', 'ARTIGOS LITURGICOS', 'PARAMENTOS', 'LIVRARIA CATOLICA', 'LIVRARIA RELIGIOSA',
          'LIVRARIA EVANGELICA', 'ARTIGOS EVANGELICOS', 'ARTIGOS GOSPEL', 'IMAGENS SACRAS', 'IMAGENS RELIGIOSAS',
          'PRESENTES RELIGIOSOS', 'LOJA CATOLICA', 'LOJA RELIGIOSA']
FRACOS = re.compile(r'\b(RELIGIOS[OA]S?|CATOLIC[OA]S?|SACR[OA]S?|LITURGIC[OA]S?|GOSPEL|EVANGELIC[OA]S?|TERCOS?|DEVOCIONAIS?)\b')
EXCLUIR = re.compile(r'\b(IGREJA|PAROQUIA|DIOCESE|ARQUIDIOCESE|MITRA|CONGREGACAO|ASSEMBLEIA|MINISTERIO|TEMPLO|COLEGIO|ESCOLA|'
                     r'FACULDADE|HOSPITAL|CEMITERIO|FUNERARIA|RADIO|TELEVISAO|SEMINARIO|CONVENTO|MOSTEIRO|ASSOCIACAO|FUNDACAO|INSTITUTO)\b')
# CNAEs onde artigos religiosos costumam estar (varejo e atacado)
CNAES_SEGMENTO = {'4789099', '4789001', '4761001', '4649499', '4693100', '4647801'}
CNAE_INSTITUICAO = '9491000'
PORTE = {'01': 'Microempresa', '03': 'Empresa de pequeno porte', '05': 'Demais'}


def avaliar(nome_fantasia, razao, cnae_p, cnaes_s):
    """Devolve (incluir, confiabilidade, criterio) a partir do nome e dos CNAEs."""
    nf, rs = norm(nome_fantasia), norm(razao)
    texto = nf + ' | ' + rs
    cnaes = {cnae_p, *cnaes_s}
    seg = bool(cnaes & CNAES_SEGMENTO)
    forte = next((f for f in FORTES if f in texto), None)
    if forte:
        return True, ('alta' if seg else 'media'), f'Nome contém "{forte.lower()}"' + (' e CNAE do comércio' if seg else '')
    m = FRACOS.search(texto)
    if m and not EXCLUIR.search(texto):
        if seg:
            return True, 'media', f'Nome contém "{m.group(0).lower()}" e CNAE do comércio ({cnae_p})'
        if cnae_p == CNAE_INSTITUICAO and re.search(r'\b(LOJA|LIVRARIA|ARTIGOS)\b', texto):
            return True, 'baixa', f'Instituição religiosa com "loja/livraria" no nome'
    return False, None, None


def categoria(nf, rs, cnae_p):
    t = norm(nf) + ' ' + norm(rs)
    if cnae_p == CNAE_INSTITUICAO:
        return 'instituicao_religiosa'
    if 'LIVRARIA' in t or 'LIVROS' in t or cnae_p == '4761001':
        return 'livraria_religiosa'
    if cnae_p.startswith('46') or re.search(r'\b(DISTRIBUIDORA|ATACADO|ATACADISTA|IMPORTADORA)\b', t):
        return 'atacado_religioso'
    if re.search(r'\b(PRESENTES?|ARTESANATO|SOUVENIR)\b', t) or cnae_p == '4789001':
        return 'presentes_religiosos'
    return 'loja_religiosa'


def sem_cpf(razao):
    """Empresário individual e MEI trazem o CPF no fim da razão social: removemos (LGPD)."""
    return re.sub(r'\s*\d{11}\s*$', '', razao or '').strip()


def ler_zip(caminho):
    z = zipfile.ZipFile(caminho)
    with z.open(z.namelist()[0]) as f:
        yield from csv.reader(io.TextIOWrapper(f, encoding='latin-1', newline=''), delimiter=';', quotechar='"')


def fmt_cep(c):
    c = re.sub(r'\D', '', c or '')
    return f'{c[:5]}-{c[5:]}' if len(c) == 8 else None


def fone(ddd, num):
    ddd, num = re.sub(r'\D', '', ddd or ''), re.sub(r'\D', '', num or '')
    if not num or set(num) == {'0'}:
        return None
    num = num[:-4] + '-' + num[-4:] if len(num) >= 8 else num
    return f'{ddd} {num}'.strip()


def data_iso(d):
    return f'{d[:4]}-{d[4:6]}-{d[6:8]}' if d and len(d) == 8 and d != '00000000' else None


# ---------- municípios: código da Receita → IBGE ----------
def carregar_municipios(origem, mes):
    url = 'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv'
    ufs = {'11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN',
           '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC',
           '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'}
    ibge = {}
    with urllib.request.urlopen(url, timeout=120) as r:
        for row in csv.DictReader(io.StringIO(r.read().decode('utf-8'))):
            ibge[(norm(row['nome']).replace(' ', ''), ufs[row['codigo_uf']])] = (int(row['codigo_ibge']), float(row['latitude']), float(row['longitude']), row['nome'])
    p = baixar(origem, mes, 'Municipios.zip', os.path.join(TMP, 'Municipios.zip'))
    rfb = {cod: norm(nome).replace(' ', '') for cod, nome in ler_zip(p)}
    apelidos = {'BRASILIA': 'BRASILIA', 'PARATI': 'PARATY', 'EMBU': 'EMBUDASARTES', 'MOJIMIRIM': 'MOGIMIRIM', 'SAOLUIZDOPARAITINGA': 'SAOLUISDOPARAITINGA'}
    return ibge, rfb, apelidos


def localizar(ibge, rfb, apelidos, cod_mun, uf):
    nome = rfb.get(cod_mun)
    if not nome:
        return None
    nome = apelidos.get(nome, nome)
    if uf == 'DF':
        nome = 'BRASILIA'
    return ibge.get((nome, uf))


# ---------- envio ao Supabase ----------
def supa(metodo, caminho, corpo=None, prefer='return=minimal'):
    url, key = os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_SERVICE_KEY']
    h = {'apikey': key, 'Content-Type': 'application/json', 'Prefer': prefer}
    if key.startswith('eyJ'):
        h['Authorization'] = 'Bearer ' + key
    data = json.dumps(corpo).encode() if corpo is not None else None
    for tentativa in range(5):
        try:
            req = urllib.request.Request(url + caminho, data=data, method=metodo, headers=h)
            with urllib.request.urlopen(req, timeout=180) as r:
                txt = r.read()
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')[:500]
            if e.code >= 500 and tentativa < 4:
                time.sleep(3 * (tentativa + 1)); continue
            raise RuntimeError(f'Supabase {e.code}: {msg}') from None


def enviar(linhas):
    for i in range(0, len(linhas), 1000):
        supa('POST', '/rest/v1/estabelecimentos?on_conflict=cnpj', linhas[i:i + 1000], 'resolution=merge-duplicates,return=minimal')
        print(f'  enviados {min(i + 1000, len(linhas))}/{len(linhas)}', flush=True)


# ---------- classificação com IA (Claude) ----------
PROMPT_IA = """Você ajuda uma distribuidora de artigos religiosos a encontrar compradores (lojas, livrarias e distribuidoras que revendem artigos religiosos: imagens, terços, bíblias, paramentos, presentes religiosos).
Abaixo há estabelecimentos tirados da base pública de CNPJ. Para cada um, avalie SÓ com o que está escrito (nome fantasia, razão social, CNAE) se ele provavelmente revende artigos religiosos.
Não invente informações. Se não der para saber, diga isso com confiança baixa.
Responda APENAS com um array JSON, um objeto por estabelecimento, nesta forma:
[{"cnpj": "...", "e_do_segmento": true|false, "confianca": 0.0-1.0, "categoria": "loja_religiosa|livraria_religiosa|atacado_religioso|presentes_religiosos|instituicao_religiosa|outro", "motivo": "uma frase curta em português"}]

Estabelecimentos:
"""


def classificar_ia(linhas):
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key or not linhas:
        return {}
    out = {}
    for i in range(0, len(linhas), 40):
        lote = linhas[i:i + 40]
        texto = '\n'.join(f'- cnpj {l["cnpj"]} | fantasia: {l["nome_fantasia"] or "-"} | razão: {l["razao_social"] or "-"} | CNAE: {l["cnae_principal"]}' for l in lote)
        corpo = {'model': 'claude-haiku-5-5', 'max_tokens': 6000, 'messages': [{'role': 'user', 'content': PROMPT_IA + texto}]}
        for tentativa in range(5):
            try:
                req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=json.dumps(corpo).encode(), method='POST',
                                             headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
                with urllib.request.urlopen(req, timeout=180) as r:
                    resp = json.loads(r.read())
                txt = ''.join(b.get('text', '') for b in resp.get('content', []))
                arr = json.loads(txt[txt.index('['): txt.rindex(']') + 1])
                for a in arr:
                    if a.get('cnpj'):
                        out[str(a['cnpj'])] = a
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 529) and tentativa < 4:
                    time.sleep(10 * (tentativa + 1)); continue
                print('  IA: erro', e.code, e.read()[:300]); break
            except Exception as e:  # noqa: BLE001
                print('  IA: resposta inválida no lote', i, repr(e)[:200]); break
        print(f'  IA avaliou {min(i + 40, len(linhas))}/{len(linhas)}', flush=True)
    return out


def main():
    os.makedirs(SAIDA, exist_ok=True)
    t0 = time.time()
    origem, mes, arquivos = mes_mais_recente()
    nomes = {n for n, _, _ in arquivos}
    print(f'Fonte: {origem} · mês {mes} · {len(arquivos)} arquivos', flush=True)
    ibge, rfb, apelidos = carregar_municipios(origem, mes)

    # Passo 1: estabelecimentos ativos que podem ser do segmento
    cand = {}  # cnpj -> dict
    lidos = ativos = 0
    for i in range(NARQ):
        nome = f'Estabelecimentos{i}.zip'
        if nome not in nomes:
            continue
        p = baixar(origem, mes, nome, os.path.join(TMP, nome))
        for r in ler_zip(p):
            lidos += 1
            if len(r) < 28 or r[5] != '02':
                continue
            ativos += 1
            cnae_p, cnaes_s = r[11], [c for c in r[12].split(',') if c]
            nf = r[4]
            nfn = norm(nf)
            pode = bool({cnae_p, *cnaes_s} & CNAES_SEGMENTO) or cnae_p == CNAE_INSTITUICAO or any(f in nfn for f in FORTES) or FRACOS.search(nfn)
            if not pode:
                continue
            cnpj = r[0] + r[1] + r[2]
            cand[cnpj] = {'b': r[0], 'nf': nf.strip(), 'mf': r[3], 'ini': r[10], 'cp': cnae_p, 'cs': cnaes_s,
                          'end': (' '.join(x for x in (r[13], r[14]) if x).strip(), r[15], r[16], r[17]), 'cep': r[18], 'uf': r[19], 'mun': r[20],
                          'tel': fone(r[21], r[22]) or fone(r[23], r[24]), 'email': (r[27] or '').strip().lower() or None}
        os.remove(p)
        print(f'{nome}: {lidos:,} lidos, {ativos:,} ativos, {len(cand):,} candidatos · {time.time() - t0:.0f}s', flush=True)

    # Passo 2: razão social e porte (tabela Empresas)
    basicos = {}
    for cnpj, c in cand.items():
        basicos.setdefault(c['b'], []).append(cnpj)
    razao = {}
    for i in range(NARQ):
        nome = f'Empresas{i}.zip'
        if nome not in nomes:
            continue
        p = baixar(origem, mes, nome, os.path.join(TMP, nome))
        for r in ler_zip(p):
            if r and r[0] in basicos:
                razao[r[0]] = (sem_cpf(r[1]), r[2], PORTE.get(r[5]))
        os.remove(p)
        print(f'{nome}: razão social de {len(razao):,} empresas · {time.time() - t0:.0f}s', flush=True)

    # Passo 3: regras do segmento, categoria e localização
    linhas, sem_local = [], 0
    for cnpj, c in cand.items():
        rs, natureza, porte = razao.get(c['b'], ('', '', None))
        ok, conf, crit = avaliar(c['nf'], rs, c['cp'], c['cs'])
        if not ok:
            continue
        loc = localizar(ibge, rfb, apelidos, c['mun'], c['uf'])
        if not loc:
            sem_local += 1
        logradouro, numero, compl, bairro = c['end']
        linhas.append({
            'cnpj': cnpj, 'razao_social': rs or None, 'nome_fantasia': c['nf'] or None,
            'cnae_principal': c['cp'], 'cnaes_secundarios': c['cs'] or None,
            'logradouro': logradouro or None, 'numero': numero or None, 'complemento': compl or None, 'bairro': bairro or None,
            'cep': fmt_cep(c['cep']), 'municipio_ibge': loc[0] if loc else None, 'uf': c['uf'] or None,
            'lat': loc[1] if loc else None, 'lng': loc[2] if loc else None, 'precisao_geo': 'municipio' if loc else None,
            'telefone': c['tel'], 'email': c['email'], 'situacao_cadastral': '02', 'data_abertura': data_iso(c['ini']),
            'categoria': categoria(c['nf'], rs, c['cp']), 'confiabilidade': conf, 'criterio_inclusao': crit,
            'fonte_principal': origem, 'mes_referencia': mes, 'porte': porte, 'matriz': c['mf'] == '1',
            'atualizado_em': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        })
    print(f'Selecionados: {len(linhas):,} (sem município reconhecido: {sem_local})', flush=True)

    # Passo 4: IA nos casos duvidosos (só os que ainda não foram avaliados)
    ja_avaliados = set()
    if MODO == 'gravar' and os.environ.get('ANTHROPIC_API_KEY'):
        de = 0
        while True:
            lote = supa('GET', f'/rest/v1/estabelecimentos?select=cnpj&ia_avaliado_em=not.is.null&offset={de}&limit=1000', prefer='')
            ja_avaliados |= {x['cnpj'] for x in lote or []}
            if not lote or len(lote) < 1000:
                break
            de += 1000
    duvidosos = [l for l in linhas if l['confiabilidade'] != 'alta' and l['cnpj'] not in ja_avaliados][: int(os.environ.get('IA_MAX', '3000'))]
    ia = classificar_ia(duvidosos)
    for l in linhas:
        a = ia.get(l['cnpj'])
        if not a:
            continue
        l['ia_avaliacao'] = {k: a.get(k) for k in ('e_do_segmento', 'confianca', 'categoria', 'motivo')}
        l['ia_avaliado_em'] = l['atualizado_em']
        if a.get('e_do_segmento') is False and (a.get('confianca') or 0) >= 0.7:
            l['confiabilidade'] = 'baixa'
        elif a.get('e_do_segmento') and (a.get('confianca') or 0) >= 0.85 and l['cnae_principal'] in CNAES_SEGMENTO:
            l['confiabilidade'] = 'alta'
        if a.get('categoria') in ('loja_religiosa', 'livraria_religiosa', 'atacado_religioso', 'presentes_religiosos', 'instituicao_religiosa'):
            l['categoria'] = a['categoria']

    # Resumo (fica como artefato da execução)
    resumo = {
        'fonte': origem, 'mes': mes, 'lidos': lidos, 'ativos': ativos, 'candidatos': len(cand), 'selecionados': len(linhas),
        'sem_municipio': sem_local, 'avaliados_ia': len(ia), 'duracao_s': round(time.time() - t0),
        'por_confiabilidade': Counter(l['confiabilidade'] for l in linhas), 'por_categoria': Counter(l['categoria'] for l in linhas),
        'por_uf': dict(Counter(l['uf'] for l in linhas).most_common()),
        'amostra': [{k: l[k] for k in ('cnpj', 'nome_fantasia', 'razao_social', 'uf', 'cnae_principal', 'categoria', 'confiabilidade', 'criterio_inclusao')}
                    | ({'ia': l['ia_avaliacao']} if l.get('ia_avaliacao') else {}) for l in linhas[:: max(1, len(linhas) // 120)]],
    }
    with open(os.path.join(SAIDA, 'resumo.json'), 'w', encoding='utf-8') as f:
        json.dump(resumo, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in resumo.items() if k != 'amostra'}, ensure_ascii=False, indent=1))

    if MODO == 'gravar':
        if not os.environ.get('SUPABASE_SERVICE_KEY'):
            sys.exit('Falta o segredo SUPABASE_SERVICE_KEY no GitHub para gravar.')
        # grupos com as mesmas colunas (o upsert exige o mesmo formato em todo o lote)
        com_ia = [l for l in linhas if 'ia_avaliacao' in l]
        sem_ia = [l for l in linhas if 'ia_avaliacao' not in l]
        enviar(sem_ia); enviar(com_ia)
        print('Gravação concluída.')


if __name__ == '__main__':
    main()
