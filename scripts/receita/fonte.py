"""Acesso à base aberta de CNPJ da Receita Federal.

Fonte oficial (2026): pasta compartilhada no Nextcloud da Receita
  https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9
lida via WebDAV público (usuário = token do compartilhamento, sem senha).
Espelho de reserva: https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos (cópia mensal da mesma base).
"""
import base64, re, urllib.request, xml.etree.ElementTree as ET

TOKEN = 'YggdBLfdninEJX9'
DAV = 'https://arquivos.receitafederal.gov.br/public.php/webdav/'
ESPELHO = 'https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/'
UA = 'clyvo-map-ingestao/1.0 (+https://www.clyvotecnologia.online)'
AUTH = 'Basic ' + base64.b64encode(f'{TOKEN}:'.encode()).decode()


def _req(url, method='GET', headers=None, data=None, dav=True):
    h = {'User-Agent': UA, **(headers or {})}
    if dav and url.startswith(DAV):
        h['Authorization'] = AUTH
    return urllib.request.Request(url, method=method, headers=h, data=data)


def listar_dav(caminho=''):
    """Lista (nome, tamanho, é_pasta) de uma pasta do compartilhamento oficial."""
    body = b'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>'
    req = _req(DAV + caminho, 'PROPFIND', {'Depth': '1', 'Content-Type': 'application/xml'}, body)
    with urllib.request.urlopen(req, timeout=120) as r:
        xml = r.read()
    ns = {'d': 'DAV:'}
    out = []
    for resp in ET.fromstring(xml).findall('d:response', ns):
        href = urllib.request.unquote(resp.find('d:href', ns).text)
        nome = href.rstrip('/').split('/')[-1]
        pasta = resp.find('.//d:resourcetype/d:collection', ns) is not None
        tam = resp.find('.//d:getcontentlength', ns)
        out.append((nome, int(tam.text) if tam is not None and tam.text else 0, pasta))
    return out[1:]  # o primeiro item é a própria pasta


def listar_espelho(caminho=''):
    with urllib.request.urlopen(_req(ESPELHO + caminho, dav=False), timeout=120) as r:
        html = r.read().decode('utf-8', 'replace')
    nomes = re.findall(r'href="([^"?#]+)"', html)
    return [(n.rstrip('/').split('/')[-1], 0, n.endswith('/')) for n in nomes if not n.startswith(('http', '/', '..'))]


def mes_mais_recente():
    """Devolve (origem, mês 'AAAA-MM', lista de arquivos) usando a fonte oficial e, se falhar, o espelho."""
    erros = []
    for origem, listar in (('receita', listar_dav), ('espelho', listar_espelho)):
        try:
            meses = sorted(n for n, _, p in listar('') if p and re.fullmatch(r'\d{4}-\d{2}', n))
            if not meses:
                raise RuntimeError('nenhuma pasta AAAA-MM')
            mes = meses[-1]
            return origem, mes, listar(mes + '/')
        except Exception as e:  # noqa: BLE001
            erros.append(f'{origem}: {e!r}')
    raise RuntimeError('Nenhuma fonte respondeu: ' + ' | '.join(erros))


def url_arquivo(origem, mes, nome):
    return (DAV if origem == 'receita' else ESPELHO) + f'{mes}/{nome}'


def baixar(origem, mes, nome, destino, tamanho=0, tentativas=8):
    """Baixa para disco em blocos, retomando de onde parou se a conexão cair (o servidor da Receita é lento)."""
    import os, time
    for t in range(tentativas):
        feito = os.path.getsize(destino) if os.path.exists(destino) else 0
        if tamanho and feito >= tamanho:
            return destino
        h = {'Range': f'bytes={feito}-'} if feito else {}
        try:
            with urllib.request.urlopen(_req(url_arquivo(origem, mes, nome), headers=h), timeout=120) as r, open(destino, 'ab' if feito else 'wb') as f:
                if feito and r.status != 206:  # servidor ignorou o Range: recomeça
                    f.seek(0); f.truncate()
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            if not tamanho or os.path.getsize(destino) >= tamanho:
                return destino
        except Exception as e:  # noqa: BLE001
            print(f'  {nome}: conexão caiu ({e!r}), retomando ({t + 1}/{tentativas})', flush=True)
            time.sleep(5 * (t + 1))
    raise RuntimeError(f'Não foi possível baixar {nome}')


def baixar_varios(origem, mes, arquivos, pasta, paralelos=4):
    """Baixa vários arquivos ao mesmo tempo. arquivos = [(nome, tamanho)]. Devolve {nome: caminho}."""
    import os, time
    from concurrent.futures import ThreadPoolExecutor
    t0 = time.time(); total = sum(t for _, t in arquivos)
    def um(item):
        nome, tam = item
        caminho = baixar(origem, mes, nome, os.path.join(pasta, nome), tam)
        print(f'  baixado {nome} ({tam / 1e6:.0f} MB) · {time.time() - t0:.0f}s', flush=True)
        return nome, caminho
    with ThreadPoolExecutor(paralelos) as ex:
        out = dict(ex.map(um, sorted(arquivos, key=lambda x: -x[1])))
    print(f'Download: {total / 1e9:.1f} GB em {(time.time() - t0) / 60:.0f} min', flush=True)
    return out
