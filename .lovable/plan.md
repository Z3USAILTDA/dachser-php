

## Migrar Rastreio Aereo: t_aereo_ws como Fonte Primaria

### Mudanca de Abordagem

A `t_aereo_ws` passa a ser a **fonte primaria**. Somente AWBs presentes nessa tabela aparecem na tela. A `t_master_dados` serve apenas para enriquecer com dados do processo (cliente, analista, tipo).

```text
t_aereo_ws (PRIMARIA)                t_master_dados (ENRIQUECIMENTO)
+------------------------+           +------------------+
| awb (chave)            |--LOOKUP-->| mawb             |
| last_status_code       |           | hawb             |
| last_status_description|           | cliente          |
| origin                 |           | nome_analista    |
| destination            |           | email_analista   |
| last_flight            |           | emails_cliente   |
| scraped_at             |           | tipo_processo    |
| timeline_json          |           | tipo_servico     |
| sidebar_days_in_transit|           +------------------+
+------------------------+
```

### Alteracoes

#### 1. `supabase/functions/fetch-status-aereo/index.ts` - Reescrever

**Passo 1**: Buscar os snapshots mais recentes de `t_aereo_ws` (1 por AWB, usando `MAX(id)`). Aplicar filtro de busca se houver search term.

**Passo 2**: Coletar os AWBs retornados e buscar dados complementares de `t_master_dados` (cliente, analista, tipo_processo, tipo_servico, hawb) usando `WHERE mawb IN (...)`.

**Passo 3**: Merge em memoria - combinar os dados de ambas as tabelas. AWBs sem correspondencia em `t_master_dados` aparecem normalmente, apenas com campos de enriquecimento vazios.

Mapeamento de campos para o frontend:
- `awb` <- t_aereo_ws.awb
- `origem` <- t_aereo_ws.origin
- `destino` <- t_aereo_ws.destination
- `ultimo_status` <- t_aereo_ws.last_status_code
- `status_info` <- t_aereo_ws.last_status_description
- `ultima_atualizacao` <- t_aereo_ws.scraped_at
- `destinatario` <- t_master_dados.cliente (via lookup)
- `hawb` <- t_master_dados.hawb (via lookup)
- `nome_analista` <- t_master_dados.nome_analista (via lookup)
- `email_analista` <- t_master_dados.email_analista (via lookup)
- `email_cliente` <- t_master_dados.emails_cliente (via lookup)
- `tipo_servico` <- t_master_dados.tipo_servico (via lookup)
- `tipo_processo` <- t_master_dados.tipo_processo (via lookup)

#### 2. `supabase/functions/mariadb-proxy/index.ts` - `get_awb_tracking_events`

Alterar de `t_status_historico` para `t_aereo_ws.timeline_json`:

- Buscar o registro mais recente do AWB em `t_aereo_ws`
- Parsear `timeline_json` (formato: `[{Timestamp, Description, Location, Carrier}, ...]`)
- Converter cada entrada para o formato do frontend:
  - `Timestamp` -> `data_hora_evento`
  - `Description` -> `descricao_evento` (extrair codigo como DEP, ARR, NFD do texto)
  - `Location` -> `aeroporto`
  - `Carrier` -> `fonte`

#### 3. `src/pages/Index.tsx` - Ajustar mapeamento

Atualizar `fetchStatusAereoData` para os novos nomes de campo. Remover referencias a `data_atraso`, `alert_status`, `arr_check_count` que nao existem em `t_aereo_ws`. O campo `last_check` passa a usar `scraped_at`.

### Campos Removidos (nao existem em t_aereo_ws)

- `data_atraso` - removido
- `alert_status` - removido
- `arr_check_count` / `arr_datetime` - removido
- `dep_datetime` - removido (pode ser derivado do timeline_json futuramente se necessario)

### Arquivos Modificados

1. **supabase/functions/fetch-status-aereo/index.ts** - Reescrever: t_aereo_ws como fonte primaria, t_master_dados como enriquecimento
2. **supabase/functions/mariadb-proxy/index.ts** - Alterar `get_awb_tracking_events` para usar timeline_json de t_aereo_ws
3. **src/pages/Index.tsx** - Ajustar mapeamento de campos no fetchStatusAereoData

