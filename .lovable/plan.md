## Diagnóstico

O voucher SPO `101-292881 DIM-BY` **já existe na MariaDB** em etapa `OPERACAO` (id `f54fec01-d618-46c4-9fae-fe173a89f675`, criado hoje 11:32). Quando o usuário tenta criá-lo novamente, o handler `save_voucher_esteira` em `mariadb-proxy/index.ts` (linhas 6296–6311) detecta o duplicado e responde com **HTTP 409 + payload `{ error, existingId, existingEtapa }`**.

O problema: `supabase.functions.invoke()` no front trata qualquer status ≥400 como erro de transporte. O `data` (payload com `existingId`) vem como `null`, e o `error.message` é a string genérica **"Edge Function returned a non-2xx status code"** — sem o `"409"` nem `"já existe"`.

Em `src/components/esteira/CreateVoucherDialog.tsx` (linha 540–552), a checagem de duplicado depende exatamente dessas substrings:

```ts
if (errorMessage.includes("já existe") || errorMessage.includes("409")) { ... }
```

Como nenhuma bate, cai no `throw` da linha 552 → toast vermelho **"Erro ao criar voucher/SPO — Erro ao salvar voucher no MariaDB: Edge Function returned a non-2xx status code"**.

Ou seja: **o voucher não foi salvo porque já existia**, mas o usuário recebeu uma mensagem inútil de "erro de servidor" em vez do aviso de duplicado.

## Plano

Mudança cirúrgica em 2 arquivos, sem alterar contrato nem schema:

### 1. `supabase/functions/mariadb-proxy/index.ts` — handler `save_voucher_esteira`
Trocar o status do duplicado em estágio avançado de **409 → 200**, mantendo o mesmo payload (`{ error, existingId, existingEtapa, duplicate: true }`). Assim `mariaResult` chega preenchido no front e o ramo de duplicado já existente (linhas 556–566) trata corretamente.

### 2. `src/components/esteira/CreateVoucherDialog.tsx` — defesa adicional
Tornar a detecção do bloco `if (mariaError)` (linhas 540–552) tolerante a erros opacos do `supabase.functions.invoke`: tentar ler `mariaError.context?.response?.json()` para extrair `{ error, existingId, existingEtapa }` antes de cair no toast genérico. Isso protege contra qualquer outro 4xx futuro e cobre o caso do voucher já existente.

### Validação pós-deploy
- Reabrir o RM `101-292881` → tentar criar voucher → deve aparecer o toast amarelo **"Voucher duplicado — Este voucher já existe na etapa OPERACAO. Localize-o na lista principal..."** em vez do toast vermelho.
- Vouchers genuinamente novos seguem criando normalmente (200 OK, sem duplicado).
- Erros reais de banco continuam exibindo a mensagem específica do MariaDB.

Sem mudanças em RLS, schema, ou contratos de outras actions.