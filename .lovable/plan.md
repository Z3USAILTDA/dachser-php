## Objetivo

Aumentar o tempo de execução permitido para a query `get_cct_shipments_cached`, que está estourando o limite atual e causando o erro **"Servidor temporariamente indisponível"** na tela **Monitoramento Pós-Embarque (CCT)**.

## Diagnóstico atual

- A action `get_cct_shipments_cached` está configurada com `timeoutMs: 15000` (15s) em `supabase/functions/mariadb-proxy/index.ts` (linha 4551), com `attempts: 1` (sem retry — correto, para não saturar o MariaDB).
- A conexão TCP ao MariaDB usa `timeout: 10000` (10s) na linha 446 — esse é o limite de leitura do driver e é o que dispara o erro `Connection read timed out` que vimos nos logs.
- Como a query CCT faz JOIN pesado entre `t_cct_dashboard_cache`, `t_master_dados`, `t_dados_aereo` (com `ROW_NUMBER()`) e `t_fato_aereo`, ela ultrapassa 10s sob carga, e o driver derruba a conexão antes do `timeoutMs` de 15s do wrapper sequer ser usado.

## Mudanças

### 1. `supabase/functions/mariadb-proxy/index.ts`

**a)** Aumentar o read timeout do driver MariaDB (linha 446) de `10000` para `45000` (45s). Isso vale para todas as actions, mas é o único caminho para queries pesadas legítimas não serem cortadas pelo driver.

**b)** Aumentar `timeoutMs` da action `get_cct_shipments_cached` (linha 4551) de `15000` para `40000` (40s) — mantendo `attempts: 1` para não pressionar o MariaDB. O wrapper continua abortando antes do driver, garantindo erro controlado caso a query passe de 40s.

### Resumo dos limites resultantes

```text
Driver MariaDB (read timeout) ........ 45s  (era 10s)
queryWithRetry CCT (timeoutMs) ....... 40s  (era 15s)
Retentativas ......................... 1 (sem mudança)
```

### Observações

- Não vou mexer em outras actions nem alterar lógica de retry/cache.
- Se mesmo com 40s a query continuar estourando, o próximo passo (a decidir depois) é verificar se o job de população de `t_cct_dashboard_cache` está rodando — porque o cache existe justamente para essa tela ser leve, e timeouts longos são paliativos.
