Tabela `dados_dachser.t_chb_file_extractions` já existe. Próximos passos de implementação:

## 1. `mariadb-proxy` — 2 novas actions

- **`insert_chb_extraction`**: insere uma linha em `t_chb_file_extractions` (`item_id`, `file_id`, `filename`, `doc_role`, `etapa`, `file_sha256`, `extractor_model`, `extractor_prompt_version`, `extractor_confidence`, `raw_ocr_text`, `structured_fields` JSON, `field_evidence` JSON, `extraction_status`, `error_message`). Retorna `extractionId`.
- **`get_chb_extractions`**: lê últimas extrações por `(item_id, etapa)` — uma linha por `file_id` (a mais recente via `MAX(created_at)`).

Sem mexer em actions existentes.

## 2. Nova edge function `extract-chb-file`

Responsabilidade única: extrair UM arquivo e gravar em `t_chb_file_extractions`.

Entrada: `{ itemId, fileId, fileUrl, filename, docRole, etapa }`.

Fluxo:
1. Baixa PDF, calcula SHA256.
2. Chama Lovable AI Gateway (`google/gemini-2.5-flash` → fallback `google/gemini-2.5-pro`) com prompt focado em UM documento. Pede:
   - `raw_ocr_text` integral.
   - `structured_fields` normalizados: `peso_bruto {value, unit}`, `peso_liquido`, `valor_mercadoria {value, currency}`, `valor_total_frete {value, currency, kind: 'consolidado'|'parcial'}`, `ncm[]`, `incoterm`, `cnpj_consignee`, `master`, `house`, `descricao`.
   - `field_evidence` por campo: `{ source_label, source_snippet, line_number }`. Campo sem evidência → `null` (nunca `ND` inventado).
   - Para `valor_total_frete`: instrução explícita de procurar linhas `Total`, `Total Geral`, `Totais na moeda de origem`, `Total Prepaid`, `Total Collect`; se só houver componentes parciais (`Por Peso`, `Por Valor`, `Impostos`, `Outros`), somar e marcar `kind: 'parcial'`.
3. Insere via `insert_chb_extraction`. Retorna `{ extractionId, structuredFields, fieldEvidence, status }`.

Regra de ouro: nunca grava `ND`/strings vazias — só `null` quando o OCR realmente não tem evidência.

## 3. `analyze-chb-documents` vira orquestrador-comparador

Mudança mínima e cirúrgica:

1. Para cada arquivo da etapa, dispara `extract-chb-file` em paralelo (`Promise.all`).
2. Chama `get_chb_extractions(itemId, etapa)`.
3. Monta a grade comparativa **somente** a partir de `structured_fields` retornados do banco — sem reanexar PDFs ao LLM, sem reler OCR.
4. Para cada linha (Peso Bruto, Peso Líquido, Valor Mercadoria, Valor Total Frete, NCM, Incoterm, CNPJ):
   - Célula vazia → `—` (campo ausente, vai para Alerta automaticamente se outra coluna tiver valor).
   - Divergência > 2% (pesos) ou > 1% / R$1 (monetários) → badge 🟨.
5. Salva run em `t_chb_runs` como hoje, adicionando no `result_json` os `extractionId`s usados.

Remove a lógica de comparação que reanexa PDFs ao prompt comparativo — a comparação agora é determinística sobre dados já normalizados.

## 4. Front-end (mínimo)

Em `src/components/chb/ChbAnalysisPanel.tsx`, adicionar link **"Ver extrações por arquivo"** abrindo modal que lista, por documento:
- `structured_fields` (campo + valor + unidade/moeda)
- `field_evidence` (snippet de origem)
- modelo + confiança + timestamp

Sem mudar layout existente.

## 5. Validação no item 116

Após deploy:
- Conferir `SELECT filename, structured_fields FROM t_chb_file_extractions WHERE item_id = 116 ORDER BY created_at DESC` — todos os arquivos têm linha.
- `extrato-conhecimento-AUL246698`: `peso_bruto.value` real (não `null`), `valor_total_frete.kind = 'consolidado'` sem sufixo `(Por Peso)`.
- Grade comparativa: Peso Bruto `7,0` vs `6,7` → 🟨 Alerta.
- Qualquer campo `null` no banco aparece como `—` na grade, nunca como "Conforme".

## Arquivos afetados

- `supabase/functions/mariadb-proxy/index.ts` (2 actions novas)
- `supabase/functions/extract-chb-file/index.ts` (nova)
- `supabase/functions/analyze-chb-documents/index.ts` (vira orquestrador)
- `src/components/chb/ChbAnalysisPanel.tsx` (botão + modal)
