"""Diagnóstico: mês mais recente, arquivos e velocidade de download na fonte oficial e no espelho.
Não grava nada."""
import os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from fonte import listar_dav, listar_espelho, url_arquivo, _req  # noqa: E402

def velocidade(origem, mes, nome, mb=40):
    t = time.time(); n = 0
    try:
        req = _req(url_arquivo(origem, mes, nome), headers={'Range': f'bytes=0-{mb * 1024 * 1024 - 1}'})
        with urllib.request.urlopen(req, timeout=60) as r:
            while n < mb * 1024 * 1024:
                b = r.read(1 << 20)
                if not b: break
                n += len(b)
                if time.time() - t > 90: break
        dt = time.time() - t
        return f'{n / 1e6:.0f} MB em {dt:.0f}s = {n / 1e6 / dt:.1f} MB/s'
    except Exception as e:  # noqa: BLE001
        return f'falhou: {e!r}'

for origem, listar in (('receita', listar_dav), ('espelho', listar_espelho)):
    print('\n===', origem)
    try:
        raiz = listar('')
        meses = sorted(n for n, _, p in raiz if p and len(n) == 7 and n[4] == '-')
        print('  meses:', meses[-4:], '| outros itens:', [n for n, _, p in raiz if n not in meses][:10])
        if not meses: continue
        mes = meses[-1]
        arqs = listar(mes + '/')
        print('  arquivos em', mes, ':', ', '.join(f'{n} ({t / 1e6:.0f} MB)' if t else n for n, t, _ in arqs))
        print('  velocidade Estabelecimentos0.zip:', velocidade(origem, mes, 'Estabelecimentos0.zip'))
    except Exception as e:  # noqa: BLE001
        print('  falhou:', repr(e))
