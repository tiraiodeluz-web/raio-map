-- Carrega os 5.570 municípios (IBGE) com coordenadas, direto do repositório público kelvins/municipios-brasileiros.
-- Rodar uma vez no SQL Editor do Supabase (precisa da extensão http).
with raw as (select content from extensions.http_get('https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv')),
linhas as (select l from raw, regexp_split_to_table(content, E'\n') with ordinality t(l, n) where n > 1 and l <> ''),
c as (select string_to_array(l, ',') a from linhas),
ufs(cod, uf) as (values (11,'RO'),(12,'AC'),(13,'AM'),(14,'RR'),(15,'PA'),(16,'AP'),(17,'TO'),(21,'MA'),(22,'PI'),(23,'CE'),(24,'RN'),(25,'PB'),(26,'PE'),(27,'AL'),(28,'SE'),(29,'BA'),(31,'MG'),(32,'ES'),(33,'RJ'),(35,'SP'),(41,'PR'),(42,'SC'),(43,'RS'),(50,'MS'),(51,'MT'),(52,'GO'),(53,'DF'))
insert into public.municipios (ibge, nome, uf, lat, lng, capital)
select a[1]::int, a[2], ufs.uf, a[3]::float8, a[4]::float8, a[5] = '1'
from c join ufs on ufs.cod = a[6]::int
on conflict (ibge) do nothing;
