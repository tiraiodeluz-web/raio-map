"""Diagnóstico da base aberta de CNPJ: descobre o mês mais recente, lista os arquivos e mostra o
formato das primeiras linhas. Não grava nada em lugar nenhum."""
import io, re, sys, urllib.request, zipfile

BASES = [
    'https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/',
    'https://dadosabertos.rfb.gov.br/CNPJ/dados_abertos_cnpj/',
    'https://arquivos.receitafederal.gov.br/dados/cnpj/',
]
UA = {'User-Agent': 'clyvo-map-ingestao/1.0'}

def get(url, n=None):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, dict(r.headers), (r.read(n) if n else r.read())

for base in BASES:
    print('\n=== BASE', base)
    try:
        st, hd, body = get(base)
    except Exception as e:
        print('  falhou:', repr(e)); continue
    html = body.decode('utf-8', 'replace')
    print('  status', st, 'tipo', hd.get('Content-Type'), 'tamanho', len(html))
    print('  início:', re.sub(r'\s+', ' ', html[:600]))
    meses = sorted(set(re.findall(r'href="(\d{4}-\d{2})/?"', html)))
    print('  meses:', meses[-6:])
    if not meses:
        continue
    mes = meses[-1]
    st, hd, body = get(base + mes + '/')
    html = body.decode('utf-8', 'replace')
    arqs = re.findall(r'href="([^"?/][^"]*\.zip)"', html)
    print('  arquivos em', mes, ':', arqs)
    # tabelas pequenas
    for nome in ['Municipios.zip', 'Cnaes.zip']:
        if nome in arqs:
            st, hd, body = get(base + mes + '/' + nome)
            z = zipfile.ZipFile(io.BytesIO(body))
            inner = z.namelist()[0]
            linhas = z.read(inner).decode('latin-1').splitlines()
            print(f'  {nome}: {len(linhas)} linhas, ex.:', linhas[:3])
    # primeiras linhas de Estabelecimentos0 e Empresas0
    for nome in ['Estabelecimentos0.zip', 'Empresas0.zip']:
        if nome in arqs:
            st, hd, body = get(base + mes + '/' + nome)
            print(f'  {nome}: {len(body)/1e6:.0f} MB')
            z = zipfile.ZipFile(io.BytesIO(body))
            with z.open(z.namelist()[0]) as f:
                for i, l in enumerate(io.TextIOWrapper(f, encoding='latin-1')):
                    if i >= 3: break
                    print('   ', l.rstrip()[:400])
    break
else:
    print('\nNenhuma base respondeu com a lista de meses.')
    sys.exit(1)
