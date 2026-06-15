---
name: Batch Import Lookup by Processo+Valor+Vencimento
description: Importação em lote de SPOs busca em t_dados_financeiro_spo por numero_processo+valor_nf+data_vencimento; SPO e Fornecedor são sempre preenchidos pelo banco. N>1 candidatas expande em N linhas marcadas como ambíguas.
type: feature
---

## Chave de match
- Lookup em `dados_dachser.t_dados_financeiro_spo` por:
  - `UPPER(REPLACE(TRIM(numero_processo),' ',''))` = processo da planilha normalizado
  - `ROUND(valor_nf, 2)` = valor da planilha arredondado
  - `DATE(data_vencimento)` = vencimento da planilha (YYYY-MM-DD)
- Planilha NÃO tem mais coluna SPO/ND/Voucher (removida de `EXPECTED_HEADERS`).
- `parseSheetRow` força `spo: null`; SPO sempre vem do DFV.
- Fornecedor (`nome_beneficiario`/`razao_social`), CNPJ e id_rm também vêm sempre do DFV.

## Comportamento por número de matches
- **0 matches**: linha mantida com `status='ERROR'` e mensagem "Nenhuma SPO encontrada em t_dados_financeiro_spo para este processo+valor+vencimento".
- **1 match**: linha resolvida normalmente via `mergeWithDfv`.
- **N>1 matches**: backend expande em N linhas, todas com:
  - `is_ambiguous=true`, `ambiguous_group_key=processo|valor|vencimento`, `ambiguous_total=N`
  - `expanded_from_processo=true`, `source_row_index=<linha original>`
  - `is_duplicate=true` (compat com badge da preview)
  - `validation_message` inclui "SPO ambígua: N candidatas… Exclua N-1 linha(s) para prosseguir."

## Frontend
- `markDuplicates` em `BatchImportVoucherDialog` recalcula ambiguidade por `ambiguous_group_key` toda vez que o usuário remove/edita linhas. Quando o grupo cai para 1 ocorrência, limpa o flag e remove a mensagem de ambiguidade.
- `validate` no front NÃO exige mais `spo`; preserva as mensagens "Nenhuma SPO encontrada" e "SPO ambígua" entre revalidações locais.
- `confirm` bloqueia criação enquanto houver qualquer `is_duplicate` (mostra toast "SPOs ambíguas na planilha").
- Badge na coluna SPO mostra "Ambígua" (vermelho) com tooltip "exclua linhas extras até restar 1 por grupo".

## Arquivos
- `supabase/functions/mariadb-proxy/index.ts` — `parseSheetRow`, `fetchDfvByProcVenc` (substitui `fetchDfvBySpo`), `mergeWithDfv`, `buildPreviewItems`.
- `src/components/esteira/BatchImportVoucherDialog.tsx` — `EXPECTED_HEADERS`, `validate`, `markDuplicates`, `confirm`, `errorReasons`.
- `src/components/esteira/BatchImportPreviewTable.tsx` — badge "Ambígua".
