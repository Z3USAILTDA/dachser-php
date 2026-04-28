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
