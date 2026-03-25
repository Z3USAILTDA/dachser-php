
Objetivo: corrigir de vez o `500` no `import_voucher_from_rm` que ainda envia um valor inválido para `t_vouchers.vencimento`.

Diagnóstico
- O banco aceita `DATETIME` no padrão `YYYY-MM-DD HH:MM:SS.000`.
- O valor que chega hoje é: `Mon Apr 20 2026 00:00:00 GM 00:00:00.000`.
- Eu revisei o `mariadb-proxy` e encontrei o motivo exato: os helpers usam `if (s.includes('T'))`.
- Em uma string JavaScript como `Mon Apr 20 2026 00:00:00 GMT+0000 (Coordinated Universal Time)`, existe a letra `T` dentro de `GMT` e também em `Time`.
- Então o código entra no ramo errado e faz:
  - `s.split('T')[0]` → `Mon Apr 20 2026 00:00:00 GM`
  - depois concatena ` 00:00:00.000`
  - resultado final: exatamente o valor quebrado que o MariaDB rejeita.

Do I know what the issue is?
- Sim. O problema não é mais “falta de suporte ao formato JS Date”.
- O problema real é a detecção ISO excessivamente ampla com `s.includes('T')`, que captura strings não-ISO antes do regex de mês (`Apr`, `May`, etc.) rodar.

Arquivos afetados
- `supabase/functions/mariadb-proxy/index.ts`

Correção proposta
1. Substituir todas as checagens genéricas `s.includes('T')` por uma validação estrita de ISO, por exemplo:
   - `if (/^\d{4}-\d{2}-\d{2}T/.test(s)) ...`
   - ou mais estrito: `if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) ...`
2. Manter o parser de `JS Date.toString()` ativo para formatos como:
   - `Mon Apr 20 2026 ...`
3. Garantir a ordem correta dentro de cada helper:
   ```text
   vazio/null
   YYYY-MM-DD
   YYYY-MM-DD HH:MM:SS
   DD/MM/YYYY
   JS Date.toString() com mês textual
   ISO real com T
   fallback new Date(...)
   fallback final
   ```
4. Aplicar a mesma correção em todos os formatadores de data do arquivo, porque todos repetem o mesmo padrão:
   - `toMySQLDate`
   - `formatDateVal`
   - `toMySQLDateSafe`
   - `mirrorVenc`
   - `formatDateForMariaDB`

Validação
- Reexecutar `import_voucher_from_rm` com o mesmo ND `20261881537`.
- Confirmar que `vencimento` vai como algo no formato:
  - `2026-04-20 00:00:00.000`
- Confirmar que o retorno deixa de ser `500`.

Apoio de debug
- Como o erro está persistente há várias tentativas, eu também incluiria logs temporários no fluxo `import_voucher_from_rm` antes do `INSERT`:
  - valor bruto de `rm.data_vencimento`
  - valor retornado por `toMySQLDateSafe(rm.data_vencimento)`
- Isso serve para provar no log se o problema foi resolvido ou se ainda existe algum segundo ponto bypassando o helper.

Escopo
- Sem mudanças de banco, RLS ou UI.
- Correção concentrada apenas no `mariadb-proxy`.
