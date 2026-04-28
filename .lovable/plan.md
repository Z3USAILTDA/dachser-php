# Frente 1 — Concluída

## O que mudou

| Arquivo | Mudança | Efeito |
|---|---|---|
| `src/App.tsx` | `QueryClient` agora usa `refetchOnWindowFocus:false`, `refetchOnReconnect:false`, `staleTime:60_000`, `retry:1` | Elimina refetch em massa ao alternar abas/rede em **todas** as queries do app (Demurrage, Vouchers, Draft, etc.) |
| `src/hooks/useUserRole.ts` | Cache em `sessionStorage` por 60s da resposta `get_user_esteira_role` | Reduz drasticamente chamadas ao `mariadb-proxy` durante navegação entre páginas |
| `src/pages/esteira/EsteiraVoucherDetails.tsx` | Retry interno (até 2 tentativas com backoff 300/900ms), remoção do `navigate()` em erro, estado de erro inline com botão **“Tentar novamente”** | Usuário não é mais expulso para `/fin/esteira` em pico de conexões — vê mensagem amigável e pode reabrir a página |
| `src/hooks/usePolling.ts` | Intervalo padrão 2s → 4s | Metade de chamadas durante análise marítima |

## Frentes seguintes (pendentes, sob demanda)

- **Frente 2** — Conectar tarde / fechar cedo nas edge functions com chamadas LLM/tracking longas (`sea-submit-analysis`, `maritimo-analyze`, `compare-documents-llm`, `chb-corrections`, `fetch-tracking-aereo`, `draft-track-*`).
- **Frente 3** — Migrar functions “gêmeas” (`fetch-awbs*`, `fetch-air-imports`, `fetch-fin-voucher-stats`, `fetch-sea-master-dados-stats`, `add-awb-to-status`, `validate-dachser-user`, `client-freetime-crud`) para actions do `mariadb-proxy`.

# Frente 2 — Concluída (escopo revisado)

## Diagnóstico inicial vs realidade

Após inspeção:
- **`draft-track-msc/hapag/one/navigator`**: NÃO acessam MariaDB (só fazem fetch a APIs externas). Removidos do escopo.
- **`fetch-tracking-aereo`**: já fechava o cliente (`await client.close(); client = null;` linha 537) **antes** de qualquer processamento JS pesado. Sem ação necessária.
- **`sea-submit-analysis`**: ponto crítico real — o background `processAnalysis` mantinha `bgClient` aberto durante toda a análise Flash → Claude → Pro (1-3 min).

## Mudança aplicada

| Arquivo | Mudança | Efeito |
|---|---|---|
| `supabase/functions/sea-submit-analysis/index.ts` | Refatoração do `processAnalysis`: helper `withDb()` abre/fecha conexão em rajadas curtas (status `analisando`, persistência de resultado, persistência de erro). LLM chamado **sem** segurar conexão DB. | Libera 1 slot MariaDB durante 1-3 min por análise — durante picos com várias análises simultâneas, isso multiplica em vários slots livres |

`chb-corrections` foi avaliado mas tem múltiplos pontos DB intercalados com LLM ao longo de 1.000 linhas — refatoração extensa, alto risco. Adiado para evolução futura se a pressão persistir.

# Frente 3 — Concluída (escopo revisado)

## Diagnóstico

- **`validate-dachser-user`**: usa banco DIFERENTE (`USERS_DACHSER_*`), fora do escopo do `mariadb-proxy` que aponta para `MARIADB_*`. Não migrado.
- **`fetch-awbs`** e **`fetch-fin-voucher-stats`**: candidatos diretos, queries simples sobre o mesmo banco.

## Mudanças aplicadas

| Arquivo | Mudança |
|---|---|
| `supabase/functions/mariadb-proxy/index.ts` | Adicionadas duas novas actions: `fetch_tracked_awbs` e `fetch_fin_voucher_stats` |
| `src/pages/AWBList.tsx` | Migrado para `mariadb-proxy` action `fetch_tracked_awbs` |
| `src/pages/esteira/EsteiraIndex.tsx` | `fetchFinDbStats` migrado para `mariadb-proxy` action `fetch_fin_voucher_stats` |

As funções antigas `fetch-awbs` e `fetch-fin-voucher-stats` continuam deployadas (não removidas) mas deixam de receber tráfego do app — podem ser deletadas em iteração futura, após confirmar que nenhum outro consumidor as chama.
