## Regra de negócio

Vouchers só podem ser editados quando `etapa_atual = 'A_PROCESSAR'` (Operacional). Em qualquer outra etapa a edição é proibida — sem exceção, inclusive ADMIN. Edições válidas precisam aparecer no histórico com responsável e diff.

---

## Plano de correção

### 1. Bloqueio de edição fora da Operacional

**Front — `src/components/esteira/VoucherTable.tsx`**
Trocar:
```ts
canEdit={canEdit && voucher.etapaAtual !== "CANCELADO"}
```
por:
```ts
canEdit={canEdit && voucher.etapaAtual === "A_PROCESSAR"}
```
O item "Editar" some do menu fora da etapa Operacional.

**Front — `src/components/esteira/EditVoucherDialog.tsx`** (defesa em profundidade)
No `handleSubmit`, antes da chamada à edge function:
```ts
if (voucher.etapaAtual !== "A_PROCESSAR") {
  toast({ title: "Edição não permitida",
          description: "Vouchers só podem ser editados na etapa Operacional.",
          variant: "destructive" });
  return;
}
```

**Backend — `supabase/functions/mariadb-proxy/index.ts` › `update_voucher_esteira`**
Antes do UPDATE:
```sql
SELECT etapa_atual FROM dados_dachser.t_vouchers WHERE id = ?
```
Se `etapa_atual <> 'A_PROCESSAR'`:
- Retorna 403 `{ success:false, error:"EDICAO_BLOQUEADA_FORA_OPERACIONAL", message:"Vouchers só podem ser editados na etapa Operacional." }`.
- Insere log `VOUCHER_EDICAO_BLOQUEADA` em `t_voucher_logs` registrando a tentativa (usuário, etapa, campos enviados).

Operações internas legítimas (transições de etapa, upload de comprovante, robô etc.) usam outras actions e seguem funcionando.

### 2. Captura correta do usuário no log

`EditVoucherDialog.tsx` usa `supabase.auth.getUser()` (linha ~116), mas a esteira autentica via MariaDB + `localStorage("user"|"dachser_user")` → `userData.user` é `null` → `user_id`/`user_name` chegam `undefined` → no proxy o `if (user_id || user_name)` falha e **nenhum log é gravado**.

Trocar pela leitura do `localStorage` (mesmo padrão do `CreateVoucherDialog`):
```ts
const stored = localStorage.getItem("user") || localStorage.getItem("dachser_user");
const u = stored ? JSON.parse(stored) : null;
// ...
user_id:   u?.id?.toString() ?? null,
user_name: u?.username ?? "Sistema",
```

### 3. Log sempre, com diff antes/depois

No `update_voucher_esteira`:
- Remover o `if (user_id || user_name)` — log sempre é inserido.
- Antes do UPDATE, `SELECT` dos campos atuais; calcular diff só dos campos efetivamente alterados.
- Gravar `t_voucher_logs.detalhe` legível, ex.:
  ```
  Vencimento: 2026-05-15 → 2026-05-11
  Valor: 1500.00 → 1234.56
  ```
- Quando faltar `user_name`, registrar `"Sistema (sem identificação)"`.

### 4. Reverter o voucher 105-292893 ao valor original

Operação pontual via edge function, em duas etapas controladas:

**4.1. Diagnóstico (read-only)** — nova action `audit_voucher_diff` em `mariadb-proxy`:
- `SELECT id, numero_spo, vencimento, valor, etapa_atual` de `t_vouchers WHERE numero_spo = '105-292893'`.
- `SELECT dt_vencimento, valor_total` de `t_dados_financeiro_voucher` (espelho RM) para o mesmo voucher.
- `SELECT * FROM t_voucher_logs WHERE voucher_id = ? ORDER BY data_hora DESC LIMIT 20`.
- Retorna o JSON consolidado para confirmação visual antes de reverter.

**4.2. Reversão controlada** — nova action `revert_voucher_field` (ADMIN-only via header `x-user-role`):
- Recebe `{ voucher_id, field, old_value, reason, user_id, user_name }`.
- Whitelist de campos: `vencimento`, `valor`, `forma_pagamento`.
- Faz o UPDATE direcionado e grava log `VOUCHER_REVERTIDO_ADMIN` com `detalhe`:
  ```
  Reversão administrativa — campo: vencimento
  Valor atual: 2026-05-15 → Restaurado para: 2026-05-11
  Justificativa: <reason>
  ```
- Não passa pelo bloqueio da etapa (é justamente a ferramenta de correção para vouchers fora da Operacional).

**Disparo da reversão**: depois que o plano for aprovado, eu executo o passo 4.1, mostro o diff aqui no chat, você confirma o valor original (vencimento 11/05) e eu disparo o 4.2 com sua justificativa. O log da reversão fica permanente em `t_voucher_logs`.

---

## Arquivos alterados

- `src/components/esteira/VoucherTable.tsx` — `canEdit` somente em `A_PROCESSAR`.
- `src/components/esteira/EditVoucherDialog.tsx` — guard de etapa + leitura de usuário do `localStorage`.
- `supabase/functions/mariadb-proxy/index.ts`:
  - `update_voucher_esteira`: bloqueio por etapa + log de tentativa + log sempre com diff.
  - Novas actions `audit_voucher_diff`, `revert_voucher_field`.

Sem alterações de design ou de outros fluxos. Aprovando, eu implemento (1–3) e em seguida rodo o passo 4 sob sua confirmação do valor original.