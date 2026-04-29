---
name: CCT Visibility & Retention Rules
description: HAWBs entregues ocultos após 5 dias do evento via tabela MariaDB dados_dachser.t_cct_hidden_hawbs (NÃO usar Supabase nem air_hidden_awbs)
type: feature
---

## Regra de retenção pós-entrega (CCT)

Processos CCT cujo **último evento da timeline é "Entregue"** são persistidos na tabela própria do módulo no **MariaDB**:

`dados_dachser.t_cct_hidden_hawbs`

Schema:
- `hawb` VARCHAR(64) UNIQUE
- `reason` VARCHAR(32) DEFAULT 'ENTREGUE'
- `delivered_at` DATETIME — **data REAL do evento de entrega da timeline**, não `updated_at`
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

Não usar:
- Supabase / `public.cct_hidden_hawbs` (não existe).
- `air_hidden_awbs` (é do módulo aéreo).

## Onde a lógica vive

Edge function `supabase/functions/mariadb-proxy/index.ts`, dentro do case `get_cct_shipments_cached`:

1. `CREATE TABLE IF NOT EXISTS dados_dachser.t_cct_hidden_hawbs ...` (idempotente).
2. Para cada row do cache, parseia `eventos`, identifica se o último evento é "Entregue" e extrai a data.
3. `INSERT IGNORE INTO ... (hawb, reason, delivered_at) VALUES (...)` em lote — preserva a `delivered_at` original.
4. `SELECT hawb, delivered_at FROM t_cct_hidden_hawbs` e calcula `expiredHidden` = HAWBs com `delivered_at` mais antigo que **5 dias**.
5. Filtra `cachedRows` removendo apenas HAWBs em `expiredHidden`.

O frontend (`useProcessosCCT`) não filtra nada — recebe a lista já podada do edge.

## Comportamento esperado

- HAWB entregue continua visível pelos primeiros **5 dias** após a data do evento.
- Após 5 dias, é ocultado da listagem padrão automaticamente.
- A tela de detalhe (`ProcessoTimeline`) continua acessível por URL direta.
- `ProcessosTable.tsx` NÃO aplica filtro de retenção.
