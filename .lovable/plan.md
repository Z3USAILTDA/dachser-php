## Diagnóstico

A tela alterna entre carregar e falhar porque a Edge Function `fetch-tracking-aereo` está no teto de CPU/memória do Edge Runtime do Supabase. Evidências:

- Sucessos: **8.000–13.600 ms** por invocação
- Falhas: HTTP **546 `WORKER_RESOURCE_LIMIT`** (`"Function failed due to not having enough compute resources"`)
- Padrão alternado (200, 200, 546, 200, 546…) — clássico de função no limite do worker

Causas que coincidem nas invocações que estouram:
1. Reciclagem de isolate → caches em memória zerados → hidrata tudo do Postgres no caminho síncrono
2. Refresh de cache stale (`JSON_TABLE` pesado em `t_status_aereo`) sendo `await`ado dentro do mesmo request
3. Lookups extras (`t_master_dados`, `t_air_process_visibility`, `air_hidden_awbs`) executados a cada poll
4. Processamento de ~1.609 linhas com regex/normalização recriados por invocação

## Plano (cirúrgico, sem mudar nada exibido)

Objetivo único: **reduzir CPU/memória da Edge Function**. Nenhuma função removida, nenhum campo do payload alterado, nenhuma lógica de tracking modificada.

### 1. Refresh pesado fora do caminho síncrono
- Mover o refresh stale de `discrepancyCache` e `routeCache` para `EdgeRuntime.waitUntil(...)` (fire-and-forget). O request já serve cache stale hoje — apenas para de bloquear nele.
- Se o cache estiver **ausente** (cold start), mantém `await` para garantir dados.
- Resultado visível ao usuário: idêntico — discrepância/rota já vinham desse cache.

### 2. Cachear lookups auxiliares em memória de módulo (TTL 5 min)
- `t_air_process_visibility` (795 linhas)
- `t_master_dados` para CLIENTE vazio (1.294 linhas)
- `air_hidden_awbs` (REST Supabase)

Mesmo padrão de cache já usado para discrepância/rota: hidrata uma vez, serve em memória nos polls seguintes. Hit em isolate quente vira `O(1)`.

### 3. Reaproveitar estruturas estáticas entre invocações
- `EXACT_MAP` e `KEYWORD_INDEX` (186 + 190 entradas) hoje são reconstruídos a cada request. Manter no escopo do módulo e só reconstruir quando vazios ou após TTL. Idêntico resultado, sem custo de CPU recorrente.

### 4. Garantir `client.close()` em `finally`
- Evitar conexão MariaDB pendurada no isolate em caminhos de erro — também consome memória do worker.

### 5. Log de execução
- Logar `execution_time_ms` e flag de cold start no fim do handler para validar a melhora após deploy.

## Detalhes técnicos

Arquivo único alterado:
- `supabase/functions/fetch-tracking-aereo/index.ts`

Sem mudanças em:
- Frontend (`/air/tracking-aereo` continua chamando `supabase.functions.invoke('fetch-tracking-aereo')`)
- SQL principal de `t_status_aereo` / `t_aereo_ws`
- Eleição IATA, ARR Destino/Conexão, `FORCED_ARR_DESTINO_AWBS`, `FORCED_CONNECTIONS_AWBS`, RFS, discrepância, hide_reason, SLA
- Payload `{ success, data, failed_count }` — mesmos campos por linha

## Garantias

- **Nenhuma função removida.** Toda lógica e todo lookup continuam existindo; só passam por cache em memória.
- **Mesmo universo de dados.** Continua processando todas as ~1.609 linhas.
- **Mesma tela.** O usuário vê exatamente o mesmo conteúdo, na mesma ordem, com os mesmos status.
- **Tracking-truth preservado.** Manual overrides e mirroring do banco continuam tendo prioridade absoluta.

## Resultado esperado

- Fim do 546 intermitente em tráfego normal
- Tempo médio cai de 8–13 s para ~3–5 s em isolate quente
- Cold start mais leve, dentro do orçamento do worker