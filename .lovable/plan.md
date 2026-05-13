## Objetivo

Substituir todas as ocorrências de `https://dachser.z3us.app` por `https://dachser.z3us.ai` nos e-mails e links do sistema, e atualizar os links do supervisor (`.html` → `.php`) para refletir a nova estrutura PHP do domínio.

## Arquivos a alterar

1. `supabase/functions/send-voucher-notification/index.ts`
   - `baseUrl` → `https://dachser.z3us.ai`
   - `approveUrl` → `https://dachser.z3us.ai/supervisor-approve.php?token=...`
   - `rejectUrl` → `https://dachser.z3us.ai/supervisor-reject.php?token=...`

2. `supabase/functions/send-welcome-email/index.ts`
   - `accessUrl` e `hostHref` → `https://dachser.z3us.ai/`
   - Texto visível `dachser.z3us.app` → `dachser.z3us.ai`

3. `supabase/functions/voucher-monthly-report/index.ts`
   - Botão "Acessar Esteira" → `https://dachser.z3us.ai/`

4. `supabase/functions/anthropic-balance-alert/index.ts`
   - `dashboardUrl` → `https://dachser.z3us.ai/admin/apis`

5. `supabase/functions/send-api-usage-alert/index.ts`
   - `dashboardUrl` (HTML e texto plano) → `https://dachser.z3us.ai/`

6. `src/pages/esteira/EmailPreview.tsx`
   - `voucherLink` mock → `https://dachser.z3us.ai`

## Observações

- Edge functions são reimplantadas automaticamente.
- E-mails antigos já enviados continuam funcionando porque o `.htaccess` do novo domínio redireciona `.html` → `.php`, mas os novos e-mails já vão direto para `.php` em `dachser.z3us.ai`.
- Nenhuma alteração de schema, autenticação ou lógica de negócio.
