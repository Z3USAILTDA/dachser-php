# Pausar consultas ao banco quando a tela não está ativa + timeout de inatividade

## Princípios
- Telas chamam o banco **apenas** quando o usuário está nelas (componente montado **e** aba visível **e** usuário ativo).
- Background = **cron no servidor**, nunca polling no frontend.
- Após **20 min sem interação**, sessão é encerrada e usuário volta para `/login`.

---

## Parte 1 — Pausar polling quando a aba não está visível

### Problema
Mesmo com a aba minimizada, estes pollings continuam disparando edge functions MariaDB:

| Local | Frequência | Edge function |
|---|---|---|
| `src/pages/Index.tsx` (Dashboard) | 30s + 60s | `fetch-status-aereo`, `fetch-master-dados-stats` |
| `src/pages/ReguaCobranca.tsx` | 60s | `fetch-master-dados-stats` (regua) |
| `src/pages/air/TrackingAereo.tsx` | 30s | `fetch-tracking-aereo` |
| `src/pages/ContainerTracking.tsx` | 12h auto-sync | sync marítimo |
| `src/pages/AWBList.tsx` | 30s (refetchInterval) | `fetch-awbs` |
| `src/hooks/useCCTData.ts` | 120s | dados CCT |
| `src/hooks/useLeadcomexLogs.ts` | 30s + 60s | logs Leadcomex |
| `src/components/demurrage/JobExecutionLogsPanel.tsx` | 30s | logs jobs |
| `src/components/DatabaseConnectionIndicator.tsx` | 60s | `check-db-connection` |

### Solução
1. **Novo hook** `src/hooks/usePageVisibility.ts` — retorna `isVisible: boolean` baseado em `document.visibilityState` + listener `visibilitychange`.
2. **`setInterval` manuais**: o `useEffect` passa a depender de `isVisible`. Se `false`, não cria interval. Quando volta a `true`, faz fetch imediato e arma o interval.
   - Arquivos: `Index.tsx` (linhas 707–718), `ReguaCobranca.tsx` (211–224), `TrackingAereo.tsx` (477–481), `ContainerTracking.tsx` (1855–1863).
3. **`refetchInterval` do React Query**: trocar valor numérico por função:
   ```ts
   refetchInterval: () => (document.visibilityState === 'visible' ? 30000 : false),
   refetchIntervalInBackground: false,
   ```
   - Arquivos: `AWBList.tsx`, `useCCTData.ts`, `useLeadcomexLogs.ts` (2 queries), `JobExecutionLogsPanel.tsx`.
4. **Remover `DatabaseConnectionIndicator`** (viola memória "Never show offline indicators"; função `check-db-connection` já está neutralizada):
   - Remover import + JSX em `AWBList.tsx`.
   - Deletar `src/components/DatabaseConnectionIndicator.tsx`.
   - Deletar edge function `supabase/functions/check-db-connection/`.

### O que NÃO mudar
- `setInterval` de barras de progresso de upload (`SubmeterHblMbl`, `SubmeterManifestHbl`, `InvoicesDraftHbl`, `esteira/FileUpload`) — não tocam o banco.
- `usePolling.ts` — polling pontual de uma análise iniciada pelo usuário, termina sozinho.
- Crons no servidor (pg_cron) — esses são exatamente o caminho correto.

---

## Parte 2 — Timeout de inatividade (20 minutos)

### Comportamento
- Conta como **interação**: `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `click`.
- Após **20 min sem nenhum desses eventos**:
  1. Chama `supabase.auth.signOut()`.
  2. Redireciona para `/login` com `?reason=inactivity`.
  3. Toast informando "Sessão encerrada por inatividade".
- Aviso opcional aos **19 min**: toast "Sua sessão expirará em 1 minuto" (configurável; incluído por padrão para evitar perda de trabalho não salvo).
- O timer **só roda quando há sessão ativa** (`user` presente em `useAuth`).
- O timer é **resetado** a cada interação real; com `throttle` de 5s para não recriar o timeout a cada `mousemove`.

### Implementação
1. **Novo hook** `src/hooks/useInactivityTimeout.ts`:
   - Parâmetros: `timeoutMs` (default 20 * 60 * 1000), `warningMs` (default 1 min antes), callbacks `onWarning` e `onTimeout`.
   - Adiciona listeners globais (`window`) para os eventos de interação com `{ passive: true }`.
   - Mantém `lastActivityRef` + `setTimeout` reagendado.
   - Cleanup remove listeners e cancela timers.
2. **Integrar em `App.tsx`** dentro de um componente `<InactivityGuard>` montado quando há sessão:
   - Usa `useAuth()` para saber se está logado.
   - Usa `useNavigate()` para redirecionar.
   - Chama `signOut()` + `navigate('/login?reason=inactivity', { replace: true })` no timeout.
3. **`Login.tsx`**: ler `searchParams.reason === 'inactivity'` e exibir toast/aviso uma vez.

### Detalhes técnicos
- Listeners no `window` (não em `document`) para captura ampla.
- Throttle manual via flag + `setTimeout` curto, evitando dependência extra.
- O timer não é afetado por visibilidade da aba: se o usuário deixou aberto e foi embora, deve ser deslogado mesmo assim — esse é o objetivo do timeout.
- Não interfere com Parte 1: visibilidade pausa **rede**, inatividade encerra **sessão**.

---

## Impacto esperado
- Aba em segundo plano: **0 chamadas/min** ao MariaDB pelo frontend (hoje: ~6–10/min por aba).
- Aba ativa e usuário interagindo: comportamento idêntico ao atual.
- Aba ativa mas abandonada: após 20 min, sessão encerrada → libera conexões e remove risco de uso por terceiros na máquina.
- Picos no limite de 30 conexões MariaDB caem significativamente em horários fora de pico.
- Remoção de 1 indicador visual obsoleto + 1 edge function não usada.

## Resumo de arquivos
- **Novos**: `src/hooks/usePageVisibility.ts`, `src/hooks/useInactivityTimeout.ts`, componente `InactivityGuard` (pode viver dentro de `App.tsx`).
- **Editados**: `Index.tsx`, `ReguaCobranca.tsx`, `TrackingAereo.tsx`, `ContainerTracking.tsx`, `AWBList.tsx`, `useCCTData.ts`, `useLeadcomexLogs.ts`, `JobExecutionLogsPanel.tsx`, `App.tsx`, `Login.tsx`.
- **Removidos**: `src/components/DatabaseConnectionIndicator.tsx`, `supabase/functions/check-db-connection/`.
- **Banco**: nenhuma migração.
