

## Fallback para t_aereo_api quando t_aereo_ws tem dados incompletos

### Objetivo
AWBs que existem na `t_aereo_ws` mas cujo rastreio falhou (sem status, ou status de erro) devem buscar dados na `t_aereo_api` como fallback. Se o AWB existir na `t_aereo_api` com dados validos, esses dados serao usados no lugar.

### Criterio de "dados incompletos" no t_aereo_ws
Um registro da `t_aereo_ws` sera considerado "sem dados" se:
- `last_status_code` for NULL, vazio, `"N/A"`, `"NOT_FOUND"` ou `"ERRO"`
- E `timeline_json` for NULL ou vazio

### Logica no Backend

#### Arquivo: `supabase/functions/fetch-status-aereo/index.ts`

Apos o PASSO 1 (buscar snapshots de `t_aereo_ws`), adicionar um novo passo intermediario:

1. Identificar quais AWBs da lista `wsList` estao com dados incompletos
2. Para esses AWBs, fazer uma query na `t_aereo_api` buscando pelo campo `mawb`
3. Se encontrar dados na `t_aereo_api` com status valido (`ultimo_status` diferente de NULL/N/A), substituir os campos do registro `t_aereo_ws` pelos da `t_aereo_api`:
   - `ultimo_status` -> `last_status_code`
   - `origem` -> `origin`
   - `destino` -> `destination`
   - `historico_status` -> `timeline_json`
   - Tambem ja trazer `hawb`, `destinatario`, `nome_analista`, `email_analista`, `emaill_cliente` (com typo), `tipo_servico` diretamente, evitando a necessidade de buscar no `t_master_dados`

4. No PASSO 3 (merge), os AWBs que foram enriquecidos pela `t_aereo_api` ja terao os dados completos e serao tratados normalmente

### Fluxo resumido

```text
t_aereo_ws (500 AWBs)
    |
    +-- AWBs com status valido -> seguem fluxo normal (enriquecer via t_master_dados)
    |
    +-- AWBs sem dados (status NULL/N/A/ERRO/NOT_FOUND) 
            |
            +-- Buscar na t_aereo_api
            |       |
            |       +-- Encontrou com dados validos -> substituir campos do ws
            |       +-- Nao encontrou -> manter como esta (sem dados)
            |
            +-- Seguir fluxo normal de enriquecimento
```

### Secao Tecnica

**Query na t_aereo_api (fallback):**
```sql
SELECT mawb, hawb, destinatario, nome_analista, email_analista,
       emaill_cliente, tipo_servico, ultimo_status, origem, destino,
       historico_status
FROM t_aereo_api
WHERE mawb IN (<awbs_sem_dados>)
  AND ultimo_status IS NOT NULL
  AND ultimo_status != 'N/A'
```

**Substituicao no objeto ws:**
- Para cada AWB sem dados que tem fallback na `t_aereo_api`, sobrescrever os campos `last_status_code`, `last_status_description`, `origin`, `destination`, `timeline_json` com os valores da API
- Marcar o registro com um flag `source: 'api'` para diferenciar dos `source: 'ws'` no frontend (opcional, para debug)

**Arquivos modificados:**
1. `supabase/functions/fetch-status-aereo/index.ts` - adicionar PASSO 1.5 de fallback via t_aereo_api

**Frontend:**
- Nenhuma alteracao necessaria no `src/pages/Index.tsx`, pois os dados ja chegarao normalizados no mesmo formato
