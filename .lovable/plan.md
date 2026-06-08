## Objetivo

Reverter a lógica de matching da importação de SPO em lote: voltar a usar o **número do SPO (ND)** da planilha como identificador, em vez do **processo**. A planilha voltará a ter a coluna SPO/ND preenchida, então ela passa a ser a chave de busca contra `t_dados_financeiro_spo` (e fallback `t_dados_financeiro_voucher`).

## Mudanças

### 1. Backend — `supabase/functions/mariadb-proxy/index.ts`

**`buildPreviewItems` (linha ~21442):**
- Trocar a chave de busca: coletar `s.spo` em vez de `s.processo`.
- Remover a expansão "1 processo → N linhas" (não faz mais sentido, pois o SPO já é único por linha).
- Cada linha procura um único DFV pelo SPO; se não achar, segue com `mergeWithDfv(s, null)`.

**Novo helper `fetchDfvBySpo(spos)`** (substitui `fetchSpoByProcesso`):
- Query principal em `t_dados_financeiro_spo`:
  ```sql
  SELECT id_rm, nd, nome_beneficiario, ..., numero_processo, detalhes
    FROM dados_dachser.t_dados_financeiro_spo
   WHERE UPPER(TRIM(nd)) COLLATE utf8mb4_unicode_ci IN (?, ?, ...)
  ```
- Fallback em `t_dados_financeiro_voucher` pelos `nd` não encontrados.
- Retorna `Map<spoNormalizado, dfvRow>`.

**`mergeWithDfv` (linha ~21368):**
- Permanece igual: SPO da planilha já é prioritário; `processo` agora vem do DFV (`dfv.numero_processo`) quando a planilha não traz.
- Validação `merged.processo` continua obrigatória; se planilha não tiver Processo e o DFV trouxer, OK; se nenhum dos dois, erro `processo obrigatório` (mesma regra atual).

**`parseSheetRow`:** já lê `SPO`/`ND` corretamente (linha 21265). Sem mudança.

### 2. Frontend — `src/components/esteira/BatchImportVoucherDialog.tsx`

- Atualizar a mensagem de toast vazio (linha 175): "Verifique se a planilha tem dados e se a coluna **'SPO' (ou 'ND')** está preenchida."
- Nenhuma outra mudança estrutural — o cabeçalho esperado já lista SPO em primeiro, e a busca/dedupe já operam por `(id_rm + spo)`.

### 3. Compatibilidade

- Planilhas legadas que vinham só com `Processo` (sem SPO) passam a falhar com `SPO obrigatório` na validação — comportamento desejado pelo usuário.
- `processo` continua sendo gravado em `processo_id` (preenchido pelo DFV via `mergeWithDfv` ou pela planilha).
- A regra de identidade `SUBSTRING_INDEX(TRIM(x),' ',1)` para SPOs com sufixo (`DIM-BY`, `SAN`) é mantida via `spoPrefix`/`normSpo`, então o lookup tolera variações.

### Diagrama do fluxo novo

```text
Planilha (SPO + Processo + ...)
        │
        ▼
parseSheetRow  →  { spo, processo, ... }
        │
        ▼
fetchDfvBySpo([spo1, spo2, ...])      ← antes: fetchSpoByProcesso
        │
        ▼
mergeWithDfv(sheet, dfv)              ← 1 linha = 1 DFV (sem expansão)
        │
        ▼
fetchExistingVouchers / markAlreadyExisting   (já operam por id_rm+spo)
        │
        ▼
INSERT em t_vouchers
```

## Fora de escopo

- Não alterar `t_voucher_batch_import_item.processo` (continua persistindo o processo da linha).
- Não mexer em UI de edição linha-a-linha, dedupe, ou upload de documentos.
- Não tocar nas regras de parser de filename, matching de comprovantes, ou cascade de anexos.