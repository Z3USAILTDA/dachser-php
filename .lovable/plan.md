## Problema

Na etapa Robô (Comprovantes), todos os arquivos do padrão "Voucher Remessa" estão retornando "Voucher não encontrado". Exemplo do usuário: `2026188294004052026.5.pdf`.

## Causa raiz

Em `supabase/functions/parse-comprovante-pdf/index.ts` (linha 134), o regex do Pattern 3 (Voucher Remessa) exige obrigatoriamente 2 dígitos no sufixo:

```ts
const voucherRemessaFull = nameWithoutExt.match(/^(\d{18,21})\.(\d{2})$/);
```

Arquivos com sufixo de 1 dígito (ex.: `.5`, `.7`) não casam, e a extração cai no Pattern 7 (ND genérico `20\d{8,11}`), que pega `2026188294` (10 dígitos) em vez do ND correto `20261882940` (11 dígitos) — resultando em ND inexistente no banco.

Verificado:
- `2026188294004052026.5` → regex atual: não casa
- Com regex `\.(\d{1,2})`: casa, ND extraído = `20261882940`, data = `04052026` ✅

## Plano

**Arquivo:** `supabase/functions/parse-comprovante-pdf/index.ts`

1. Alterar o regex da linha 134 de `\.(\d{2})$` para `\.(\d{1,2})$` para aceitar sufixos de 1 ou 2 dígitos no padrão Voucher Remessa.

Sem outras alterações. Sem mudanças de schema, banco, frontend ou memória.
