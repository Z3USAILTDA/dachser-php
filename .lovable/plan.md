## Objetivo

Remover todos os mecanismos de "kill switch" / bloqueio emergencial que ainda retornam **503 "Sistema em manutenção"** em telas como Métricas, agora que cada módulo tem seu próprio pool MariaDB (OPS, AIR, SEA, FIN, CHARGES). Também desativar o polling de `forced_logouts`. O `InactivityGuard` (logout por 20 min de inatividade) **permanece intacto**.

## Mudanças

### 1. `supabase/functions/mariadb-proxy/index.ts`
Remover o bloco completo entre as linhas ~417–489:
- `KILL_SWITCH` (env `MARIADB_PROXY_KILL_SWITCH`)
- `AUTH_ACTIONS` whitelist
- `ALLOWED_USERS` (bloqueio por `cleiciane.faconi`)
- `ALLOWED_ACTIONS` (whitelist da Esteira)
- Todas as respostas 503 "Sistema em manutenção"

O fluxo passa direto para o roteamento normal (FIN_ACTIONS / OPS / etc.), que já está funcional com os pools separados.

### 2. `src/utils/installInvokeUserGuard.ts`
**Deletar o arquivo.** Já não há finalidade — o backend não lê mais `requesterUsername`.

### 3. `src/App.tsx`
Remover:
- `import { installInvokeUserGuard } from "@/utils/installInvokeUserGuard";` (linha 115)
- `installInvokeUserGuard();` (linha 118)
- O comentário associado (linha 117)

### 4. `src/hooks/useAuth.ts`
Remover o polling `forced_logouts` (bloco ~linhas 38–66):
- A função `checkForcedLogout`
- O `setInterval` de 15s
- O `clearInterval` de cleanup

Manter o restante do hook (parsing do localStorage, listener Supabase, signOut) intacto.

### 5. Não tocar
- `InactivityGuard` / `useInactivityTimeout` (logout por 20 min permanece)
- Toggle de manutenção do CCT Console (independente)
- Tabela `forced_logouts` no Supabase (fica como histórico; pode ser removida depois pelo usuário se quiser)
- Secret `MARIADB_PROXY_KILL_SWITCH` (vira no-op; pode ser removido depois nas configurações de Cloud)

## Resultado esperado

- Telas como **Métricas** voltam a carregar para todos os usuários — sem 503.
- Não há mais qualquer caminho que retorne `"Sistema em manutenção"` originado do `mariadb-proxy`.
- Sessões deixam de ser monitoradas pela tabela `forced_logouts`.
- Logout por inatividade (20 min) continua funcionando normalmente.
