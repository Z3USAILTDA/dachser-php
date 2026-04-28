## Diagnóstico

47 edge functions abrem conexão direta ao MariaDB com o **mesmo usuário**, competindo pelo mesmo `max_user_connections`. Crons já foram afrouxados. Restam 3 frentes (Frente 2 — usuário dedicado para crons — **descartada por sua decisão**).

---

## Frente 1 — Reduzir polling e refetch do frontend (rápido, alto impacto)

Ajustes pontuais nos hooks/painéis mais ativos:

| Hook/painel | Hoje | Ajuste |
|---|---|---|
| `useUserRole` | Refetch a cada navegação | Cache em `sessionStorage` por 60s |
| `useCCTData` | Refetch ao focar janela | Desabilitar `refetchOnWindowFocus`, manter cache 60s |
| `useDemurrageData` / `DemurrageMonitor` | Polling curto | Subir intervalo para ≥60s |
| `useDraftData` / `DraftSyncDashboard` | Auto-refresh curto | Subir para 30–60s |
| `usePolling` (genérico) | Default curto | Elevar default e revisar callers |
| `DatabaseStatsPanel` / `SeaDbStatsPanel` / `ReguaDbStatsPanel` | Stats em loop | Refresh manual ou ≥120s |

Também: na página `EsteiraVoucherDetails`, adicionar **retry client-side (até 2x)**, **remover o `navigate` em erro** e expor botão **“Tentar novamente”** — para o usuário não ser jogado para fora quando o pico acontece.

**Ganho esperado:** ~−40% de chamadas ao `mariadb-proxy` em uso normal e fim do sintoma “Erro ao carregar voucher”.

---

## Frente 2 — Conectar tarde, fechar cedo (dentro das edge functions)

Padrão atual em várias functions: abre conexão → chama LLM ou API externa de tracking (30–120s) → grava resultado → fecha. A conexão fica **ociosa segurando slot** durante toda a chamada externa.

Refatorar para abrir a conexão **só no momento de ler/gravar** e fechá-la antes da chamada externa, reabrindo só para persistir:

- `sea-submit-analysis`
- `maritimo-analyze`
- `compare-documents-llm`
- `chb-corrections`
- `fetch-tracking-aereo`
- `draft-track-hapag`, `draft-track-msc`, `draft-track-one`, `draft-track-navigator`

**Ganho:** uma conexão que hoje fica aberta 30–120s passa a 1–3s. Reduz drasticamente conexões simultâneas durante batches de tracking/análise.

---

## Frente 3 — Consolidar functions “gêmeas” no `mariadb-proxy`

Várias functions fazem operações triviais que poderiam virar `action` do `mariadb-proxy` (já tem cache de schema e tratamento centralizado), eliminando pontos de conexão paralelos:

Migrar para `mariadb-proxy` e remover conexão própria:

- `fetch-awbs`, `fetch-awbs-dep`, `fetch-awbs-for-retrack`
- `fetch-air-imports`
- `fetch-fin-voucher-stats`
- `fetch-sea-master-dados-stats`
- `add-awb-to-status`
- `validate-dachser-user`
- `client-freetime-crud`

**Não migrar agora** (alto risco / lógica complexa): `mariadb-sync`, `voucher-mariadb-sync`, `demurrage-mariadb-sync`, `olimpo-sync`, `cct-ingest`, `mariadb-contacts-sync`.

**Ganho:** menos pontos de falha, menos picos paralelos, telemetria centralizada. Aplicada por último por ser a mais invasiva.

---

## Ordem de execução

1. **Frente 1** — sem dependência externa, ganho imediato.
2. **Frente 2** — incremental, function por function (começando pelas mais lentas).
3. **Frente 3** — última, mais invasiva.

## O que NÃO vamos fazer

- ~~Usuário MariaDB dedicado para crons~~ (descartado).
- Pool de conexões persistente: o runtime Deno serverless **não suporta** pool entre invocações (cada cold start = nova VM).
- Trocar MariaDB ou migrar tabelas para o Postgres da Cloud.

---

Posso começar pela **Frente 1** assim que aprovar.
