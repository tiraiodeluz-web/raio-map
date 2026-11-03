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


def baixar(origem, mes, nome, destino):
    """Baixa para disco em blocos (os maiores arquivos têm centenas de MB)."""
    with urllib.request.urlopen(_req(url_arquivo(origem, mes, nome)), timeout=600) as r, open(destino, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    return destino
