"""Ingestão mensal da base aberta de CNPJ (Receita Federal) para a camada pública do Clyvo Map.

Separa os estabelecimentos ATIVOS do segmento configurado em public/config/segmento.json,
localiza cada um pelo município e grava em `public.estabelecimentos` (upsert por CNPJ).

Variáveis de ambiente:
  MODO=teste | gravar          teste: só gera o resumo em saida/; gravar: também envia ao Supabase
  SUPABASE_URL, SUPABASE_SERVICE_KEY   obrigatórias no modo gravar (chave secreta, nunca no app)
  ANTHROPIC_API_KEY            opcional: classifica com IA os achados de confiabilidade média/baixa
  IA_MAX=8000                  limite de estabelecimentos avaliados pela IA por execução
  ARQUIVOS=10                  quantos arquivos Estabelecimentos/Empresas ler (0..9); use menos para testar
"""
import csv, gzip, io, json, os, re, sys, time, unicodedata, urllib.error, urllib.request, zipfile
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from fonte import baixar, baixar_varios, mes_mais_recente  # noqa: E402

csv.field_size_limit(10_000_000)
SAIDA = 'saida'
os.makedirs(SAIDA, exist_ok=True)
TMP = os.environ.get('RUNNER_TEMP', '/tmp')
MODO = os.environ.get('MODO', 'teste')
NARQ = int(os.environ.get('ARQUIVOS', '10'))


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().upper()
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]', ' ', s)).strip()


# ---------- regras do segmento (vêm de public/config/segmento.json) ----------
CONFIG = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'config', 'segmento.json'), encoding='utf-8'))


def _rx(lista):
    """Lista de termos/expressões → uma regex de palavra inteira (ou None se vazia)."""
    return re.compile(r'\b(' + '|'.join(lista) + r')\b') if lista else None


FORTES = [norm(x) for x in CONFIG.get('palavras_fortes', [])]
FRACOS = _rx(CONFIG.get('palavras_fracas', []))
EXCLUIR = _rx(CONFIG.get('excluir', []))
CNAES_SEGMENTO = set(CONFIG.get('cnaes_comercio', []))
AMBIGUOS = _rx(CONFIG.get('nomes_ambiguos', []))
INST = CONFIG.get('instituicoes') or {}
INST_ATIVO = bool(INST.get('ativo'))
CNAES_INST = set(INST.get('cnaes', [])) if INST_ATIVO else set()
INST_FORTE, INST_FRACA, INST_EXCLUIR = _rx(INST.get('fortes', [])), _rx(INST.get('fracas', [])), _rx(INST.get('excluir', []))
CATEGORIAS = CONFIG.get('categorias', [])
IDS_CATEGORIA = {c['id'] for c in CATEGORIAS}
PORTE = {'01': 'Microempresa', '03': 'Empresa de pequeno porte', '05': 'Demais'}


def _tem(rx, texto):
    return rx.search(texto) if rx else None


def avaliar(nome_fantasia, razao, cnae_p, cnaes_s):
    """Devolve (incluir, confiabilidade, criterio) a partir do nome e dos CNAEs.
    incluir = 'ia' quando o estabelecimento só entra se a IA confirmar."""
    nf, rs = norm(nome_fantasia), norm(razao)
    texto = nf + ' | ' + rs
    cnaes = {cnae_p, *cnaes_s}
    seg = bool(cnaes & CNAES_SEGMENTO)
    if cnae_p in CNAES_INST and not _tem(INST_EXCLUIR, texto):
        m = _tem(INST_FORTE, texto)
        if m:
            return True, 'alta', f'Instituição do segmento ("{m.group(0).lower()}")'
        m = _tem(INST_FRACA, texto)
        if m:
            return True, 'media', f'Instituição provável do segmento ("{m.group(0).lower()}")'
    forte = next((f for f in FORTES if f in texto), None)
    if forte:
        return True, ('alta' if seg else 'media'), f'Nome contém "{forte.lower()}"' + (' e CNAE do comércio' if seg else '')
    m = _tem(FRACOS, texto)
    if m and not _tem(EXCLUIR, texto):
        if seg:
            return True, 'media', f'Nome contém "{m.group(0).lower()}" e CNAE do comércio ({cnae_p})'
        if cnae_p in CNAES_INST and re.search(r'\b(LOJA|LIVRARIA|ARTIGOS)\b', texto):
            return True, 'baixa', 'Instituição com "loja/livraria" no nome'
    if seg and not _tem(EXCLUIR, texto):
        m = _tem(AMBIGUOS, texto)
        if m:
            return 'ia', 'baixa', f'Nome ambíguo ("{m.group(0).lower()}") e CNAE do comércio, confirmado pela IA'
    return False, None, None


def categoria(nf, rs, cnae_p):
    """Primeira categoria da configuração que bater (por CNAE, prefixo de CNAE ou palavra no nome)."""
    t = norm(nf) + ' ' + norm(rs)
    padrao = None
    for c in CATEGORIAS:
        if c.get('padrao'):
            padrao = c['id']
            continue
        if cnae_p in c.get('cnaes', []) or any(cnae_p.startswith(px) for px in c.get('cnae_prefixos', [])) \
                or any(re.search(r'\b' + w + r'\b', t) for w in c.get('palavras', [])):
            return c['id']
    return padrao or 'outro'


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
PROMPT_IA = CONFIG.get('descricao_ia', 'Você ajuda uma empresa B2B a encontrar compradores.') + """
Abaixo há estabelecimentos tirados da base pública de CNPJ. Para cada um, avalie SÓ com o que está escrito (nome fantasia, razão social, CNAE) se ele provavelmente é um comprador desse segmento.
Não invente informações. Se não der para saber, diga isso com confiança baixa.
Responda APENAS com um array JSON, um objeto por estabelecimento, nesta forma:
[{"cnpj": "...", "e_do_segmento": true|false, "confianca": 0.0-1.0, "categoria": "CATEGORIAS|outro", "motivo": "uma frase curta em português"}]

Estabelecimentos:
""".replace('CATEGORIAS', '|'.join(c['id'] for c in CATEGORIAS))


USO_IA = {'chamadas': 0, 'entrada': 0, 'saida': 0, 'parou_por_erro': False}
MODELO_IA = 'claude-haiku-5-5'


def classificar_ia(linhas):
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key or not linhas:
        return {}
    out = {}
    for i in range(0, len(linhas), 40):
        lote = linhas[i:i + 40]
        texto = '\n'.join(f'- cnpj {l["cnpj"]} | fantasia: {l["nome_fantasia"] or "-"} | razão: {l["razao_social"] or "-"} | CNAE: {l["cnae_principal"]}' for l in lote)
        corpo = {'model': MODELO_IA, 'max_tokens': 6000, 'messages': [{'role': 'user', 'content': PROMPT_IA + texto}]}
        for tentativa in range(5):
            try:
                req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=json.dumps(corpo).encode(), method='POST',
                                             headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
                with urllib.request.urlopen(req, timeout=180) as r:
                    resp = json.loads(r.read())
                u = resp.get('usage') or {}
                USO_IA['chamadas'] += 1
                USO_IA['entrada'] += u.get('input_tokens', 0)
                USO_IA['saida'] += u.get('output_tokens', 0)
                txt = ''.join(b.get('text', '') for b in resp.get('content', []))
                arr = json.loads(txt[txt.index('['): txt.rindex(']') + 1])
                for a in arr:
                    if a.get('cnpj'):
                        out[str(a['cnpj'])] = a
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 529) and tentativa < 4:
                    time.sleep(10 * (tentativa + 1)); continue
                corpo_erro = e.read()[:300]
                print('  IA: erro', e.code, corpo_erro)
                if e.code in (400, 401, 403) and (b'credit' in corpo_erro or b'authentication' in corpo_erro or b'permission' in corpo_erro):
                    print('  IA desligada nesta execução: confira a chave e o crédito em console.anthropic.com', flush=True)
                    USO_IA['parou_por_erro'] = True
                    return out
                break
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
    alvo = [(n, t) for n, t, _ in arquivos if re.fullmatch(rf'(Estabelecimentos|Empresas)[0-{NARQ - 1}]\.zip', n)]
    locais = baixar_varios(origem, mes, alvo, TMP, int(os.environ.get('PARALELOS', '4')))

    # Passo 1: estabelecimentos ativos que podem ser do segmento
    cand = {}  # cnpj -> dict
    lidos = ativos = 0
    for i in range(NARQ):
        nome = f'Estabelecimentos{i}.zip'
        if nome not in nomes:
            continue
        p = locais[nome]
        for r in ler_zip(p):
            lidos += 1
            if len(r) < 28 or r[5] != '02':
                continue
            ativos += 1
            cnae_p, cnaes_s = r[11], [c for c in r[12].split(',') if c]
            nf = r[4]
            nfn = norm(nf)
            pode = bool({cnae_p, *cnaes_s} & CNAES_SEGMENTO) or cnae_p in CNAES_INST or any(f in nfn for f in FORTES) or bool(_tem(FRACOS, nfn))
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
        p = locais[nome]
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
        precisa_ia = ok == 'ia'
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
            '_ia': precisa_ia,
        })
    print(f'Selecionados: {len(linhas):,} (sem município reconhecido: {sem_local})', flush=True)

    # Passo 4: IA. Casos duvidosos (média/baixa) ganham uma avaliação; nomes de devoção só entram se a IA confirmar.
    ja_avaliados, descartados = set(), set()
    usar_ia = MODO == 'gravar' and bool(os.environ.get('ANTHROPIC_API_KEY'))
    if usar_ia:
        for tabela, destino in (('estabelecimentos?select=cnpj&ia_avaliado_em=not.is.null', ja_avaliados), ('estabelecimentos_descartados?select=cnpj', descartados)):
            de = 0
            while True:
                lote = supa('GET', f'/rest/v1/{tabela}&offset={de}&limit=1000' if '?' in tabela else f'/rest/v1/{tabela}?offset={de}&limit=1000', prefer='')
                destino |= {x['cnpj'] for x in lote or []}
                if not lote or len(lote) < 1000:
                    break
                de += 1000
    devocao = [l for l in linhas if l['_ia']]  # nomes ambíguos
    linhas = [l for l in linhas if not l['_ia']] + [l for l in devocao if l['cnpj'] in ja_avaliados]
    fila_devocao = [l for l in devocao if l['cnpj'] not in ja_avaliados and l['cnpj'] not in descartados]
    duvidosos = [l for l in linhas if l['confiabilidade'] != 'alta' and l['cnpj'] not in ja_avaliados and l['categoria'] != INST.get('categoria')]
    limite = int(os.environ.get('IA_MAX', '8000'))
    fila = (duvidosos + sorted(fila_devocao, key=lambda l: l['cnae_principal'] not in ('4789099', '4789001')))[:limite]
    print(f'IA: {len(duvidosos)} duvidosos + {len(fila_devocao)} nomes ambíguos para avaliar; nesta execução: {len(fila) if usar_ia else 0}', flush=True)
    ia = classificar_ia(fila) if usar_ia else {}
    novos_descartes = []
    for l in fila:
        a = ia.get(l['cnpj'])
        if not a:
            continue
        sim, conf_ia = a.get('e_do_segmento'), (a.get('confianca') or 0)
        l['ia_avaliacao'] = {k: a.get(k) for k in ('e_do_segmento', 'confianca', 'categoria', 'motivo')}
        l['ia_avaliado_em'] = l['atualizado_em']
        if l['_ia']:
            if sim and conf_ia >= 0.6:
                l['confiabilidade'] = 'media' if conf_ia >= 0.8 else 'baixa'
                linhas.append(l)
            else:
                novos_descartes.append({'cnpj': l['cnpj'], 'motivo': (a.get('motivo') or '')[:300]})
            continue
        if sim is False and conf_ia >= 0.7:
            l['confiabilidade'] = 'baixa'
        elif sim and conf_ia >= 0.85 and l['cnae_principal'] in CNAES_SEGMENTO:
            l['confiabilidade'] = 'alta'
        if a.get('categoria') in IDS_CATEGORIA:
            l['categoria'] = a['categoria']
    for l in linhas:
        l.pop('_ia', None)

    # Resumo (fica como artefato da execução)
    resumo = {
        'fonte': origem, 'mes': mes, 'lidos': lidos, 'ativos': ativos, 'candidatos': len(cand), 'selecionados': len(linhas),
        'sem_municipio': sem_local, 'avaliados_ia': len(ia), 'nomes_ambiguos_na_fila': len(fila_devocao),
        'confirmados_por_ia': sum(1 for l in linhas if 'ia_avaliacao' in l and 'ambíguo' in (l['criterio_inclusao'] or '')),
        'descartados_ia': len(novos_descartes), 'duracao_s': round(time.time() - t0),
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
        for i in range(0, len(novos_descartes), 1000):
            supa('POST', '/rest/v1/estabelecimentos_descartados?on_conflict=cnpj', novos_descartes[i:i + 1000], 'resolution=merge-duplicates,return=minimal')
        # registro de uso (aba Uso do app); falha aqui não deve derrubar a carga
        try:
            supa('POST', '/rest/v1/execucoes_robo', [{
                'modo': MODO, 'mes_referencia': mes, 'selecionados': len(linhas), 'ia_avaliados': len(ia), 'ia_chamadas': USO_IA['chamadas'],
                'tokens_entrada': USO_IA['entrada'], 'tokens_saida': USO_IA['saida'], 'modelo': MODELO_IA if USO_IA['chamadas'] else None,
                'ia_parou_por_erro': USO_IA['parou_por_erro'], 'duracao_s': round(time.time() - t0)}], 'return=minimal')
        except Exception as e:  # noqa: BLE001
            print('Aviso: não consegui registrar o uso da execução:', repr(e)[:200], flush=True)
        print('Gravação concluída.')


if __name__ == '__main__':
    main()
