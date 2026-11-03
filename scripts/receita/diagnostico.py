"""Diagnóstico: descobre o mês mais recente da base de CNPJ, lista os arquivos e mostra o formato
das primeiras linhas das tabelas. Não grava nada."""
import io, os, sys, tempfile, zipfile
sys.path.insert(0, os.path.dirname(__file__))
from fonte import baixar, mes_mais_recente  # noqa: E402

origem, mes, arquivos = mes_mais_recente()
print('origem:', origem, '· mês:', mes)
for nome, tam, pasta in arquivos:
    print(f'  {nome:32s} {tam/1e6:9.1f} MB')
nomes = {n for n, _, _ in arquivos}
tmp = tempfile.mkdtemp()
for nome in ['Municipios.zip', 'Cnaes.zip', 'Estabelecimentos0.zip', 'Empresas0.zip']:
    if nome not in nomes:
        print('  (sem', nome, ')'); continue
    p = baixar(origem, mes, nome, os.path.join(tmp, nome))
    z = zipfile.ZipFile(p)
    print(f'\n{nome} → {z.namelist()}')
    with z.open(z.namelist()[0]) as f:
        for i, l in enumerate(io.TextIOWrapper(f, encoding='latin-1')):
            if i >= 3: break
            print('   ', l.rstrip()[:400])
    os.remove(p)
