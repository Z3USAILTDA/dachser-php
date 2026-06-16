# Excluir `admin` e `herbert.zacatei` da tela de Métricas

## Objetivo
Na tela `/metrics`, ocultar completamente os acessos dos usuários `admin` e `herbert.zacatei` em **todas as visualizações** (estatísticas, gráficos diário/endpoint, módulos, sessões, conexões ativas, lista de logs e dropdown de filtro de usuários), para **qualquer requisitante** — não apenas os usuários DACHSER especiais.

## Mudanças
Arquivo único: `supabase/functions/mariadb-proxy/index.ts`

Nos 5 cases abaixo, a lista `HIDDEN_LOG_USERS*` passa de `["admin", "teste.test3"]` para `["admin", "herbert.zacatei", "teste.test3"]` e o filtro `username NOT IN (...)` é aplicado **sempre** (remover o gate `if (isDachserUser...)`):

1. `get_metrics` (linhas ~1114-1125) — estatísticas, dailyData, endpointData e tabela de logs.
2. `get_metrics_by_module` (linhas ~1234-1257) — cards por módulo.
3. `get_metrics_sessions` (linhas ~953-966) — lista de sessões.
4. `get_active_connections` (linhas ~1046-1061) — conexões ativas.
5. `get_metric_users` (linhas ~1336-1346) — dropdown de filtro de usuário.

Mantém `teste.test3` na lista (comportamento atual de teste).

## Detalhes técnicos
- Não alterar o frontend (`src/pages/MetricsUsage.tsx`) — o filtro é aplicado server-side e cobre automaticamente os contadores, gráficos e a tabela.
- `t_dachser_usage_logs` continua recebendo logs normalmente; apenas a leitura é filtrada.
- Sem migração de banco.

## Fora de escopo
- Não mexer em logs de uso de outras telas (admin/UserManagement etc.) — o usuário pediu apenas a tela de Métricas.
- Não tornar a lista configurável via UI; é hard-coded como já é hoje.
