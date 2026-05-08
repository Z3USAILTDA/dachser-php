# SPO da planilha sem sufixo: bater com o voucher/SPO completo

## Problema

Hoje, o lookup de SPO no lote (`fetchDfvBySpo` e `fetchExistingVouchers` em `mariadb-proxy/index.ts`) faz **match exato** após normalização (`trim` + collapse de espaços + uppercase). Se a planilha vier com `"105-293293"` mas o `t_dados_financeiro_voucher.nd` (e/ou `t_vouchers.numero_spo`) estiver gravado como `"105-293293 DIM-BY"`, o casamento falha — o item entra como sem DFV / "novo voucher".

A regra desejada: o **prefixo numérico** (`"105-293293"`) é a chave de identidade. Sufixos como `" DIM-BY"`, `" SAN"`, `" CWB"` etc. são apenas anexos e devem ser ignorados na comparação. Também precisa funcionar no sentido oposto (planilha com sufixo, DB sem).

## Implementação

Arquivo: `supabase/functions/mariadb-proxy/index.ts`, dentro do bloco `case 'preview_voucher_batch_import' / 'create_voucher_batch_import' / 'finalize_batch_import'`.

### 1. Nova helper `spoPrefix`

```ts
// Extrai a chave de identidade do SPO: "NNN-NNNNNN" (3 dígitos + hífen + 6+ dígitos).
// Se não casar o padrão, devolve a string normalizada inteira (fallback seguro).
const spoPrefix = (s: any): string => {
  const n = normSpo(s);
  const m = n.match(/^(\d{2,4}-\d{4,})/);
  return m ? m[1] : n;
};
```

### 2. `fetchDfvBySpo` — buscar também por prefixo

- Continuar fazendo o `WHERE UPPER(TRIM(nd)) IN (...)` com os SPOs exatos da planilha.
- **Adicionar segunda passada**: para os SPOs que não casaram exato, rodar:
  ```sql
  SELECT id_rm, nd, ...
    FROM dados_dachser.t_dados_financeiro_voucher
   WHERE UPPER(TRIM(nd)) LIKE CONCAT(?, ' %')
      OR UPPER(TRIM(nd)) = ?
  ```
  para cada prefixo faltante (em batches; ou um único `WHERE (nd LIKE ? OR nd LIKE ? ...)` montado dinamicamente).
- Indexar o resultado em **dois maps**: `byFull[normSpo(nd)]` e `byPrefix[spoPrefix(nd)]`.
- No retorno, lookup do sheet faz: `byFull[normSpo(sheet.spo)] || byPrefix[spoPrefix(sheet.spo)] || null`.
- Quando o match for via prefixo, **substituir `sheet.spo` (ou `merged.spo`) pelo `nd` completo do DFV** para que a criação do voucher use o SPO canônico (`"105-293293 DIM-BY"`), mantendo paridade com o sistema antigo.

### 3. `fetchExistingVouchers` — match por prefixo em `t_vouchers.numero_spo`

- Manter o lookup atual `(id_rm, UPPER(TRIM(numero_spo))) IN (...)`.
- Para itens não encontrados que tenham `id_rm`, rodar segundo lookup:
  ```sql
  SELECT id_rm, numero_spo, etapa_atual
    FROM dados_dachser.t_vouchers
   WHERE id_rm IN (?,?,...)
     AND UPPER(TRIM(numero_spo)) LIKE CONCAT(?, ' %')
  ```
  e indexar por `${id_rm}|${spoPrefix(numero_spo)}`.
- Se o item bate por prefixo, marca `already_exists` exatamente como hoje (com a etapa) e a mensagem de erro informa o SPO completo encontrado: `"Já existente como '105-293293 DIM-BY' na etapa Fiscal"`.

### 4. Logs

- Adicionar `console.log` quando o casamento ocorrer via prefixo (`'[batch] SPO matched by prefix: 105-293293 → 105-293293 DIM-BY'`) para facilitar auditoria sem mudar o contrato externo.

## Sem mudanças

- Nenhuma migração; nenhuma alteração de schema.
- Frontend (`BatchImportRowEditor`, `BatchVoucherChecklist`, `BatchDocumentBinderDialog`) continua igual — recebe o SPO já canônico do backend.
- Validações, gate de anexos e promoção para Fiscal/Financeiro/Supervisor permanecem como definido no plano anterior.

## Resultado

- Planilha com `"105-293293"` casa com DFV/voucher gravado como `"105-293293 DIM-BY"` (e vice-versa).
- O voucher criado/atualizado mantém o SPO completo do sistema fonte, sem perder o sufixo.
- Itens já existentes em etapa avançada continuam sendo bloqueados, mesmo que o usuário tenha digitado só o prefixo.
