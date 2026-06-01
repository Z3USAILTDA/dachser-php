Diagnóstico:

- O backend já tenta buscar por `processo` na `t_dados_financeiro_spo`, mas o resultado encontrado não é copiado para o campo `spo`.
- Na mesclagem atual, `spo` fica sempre vindo somente da planilha (`spo: sheet.spo`).
- Como a planilha da imagem não tem coluna/valor de SPO, o processo é encontrado parcialmente, mas a linha continua inválida com `SPO obrigatório`.
- Há um segundo risco: a busca em `detalhes` usa `FIND_IN_SET` direto no texto completo. Se `detalhes` vier com quebras de linha, vírgulas, espaços incomuns ou separadores diferentes, alguns processos podem não casar.

Plano de correção:

1. Ajustar `mergeWithDfv` no `mariadb-proxy` para preencher `spo` a partir do registro encontrado:
   - usar `sheet.spo` se a planilha trouxe SPO;
   - senão usar `dfv.nd`/`dfs.nd` da fonte encontrada pelo processo;
   - marcar a origem do campo como `DFV` quando vier da tabela financeira.

2. Reforçar a busca por processo na `t_dados_financeiro_spo`:
   - manter busca por `numero_processo`;
   - manter busca por `detalhes`;
   - normalizar melhor `detalhes` para tolerar `;`, vírgula, quebras de linha, tabs e espaços.

3. Ajustar validação do frontend no modal de importação em lote:
   - manter SPO obrigatório somente depois da tentativa de enriquecimento;
   - quando o backend devolver `spo` preenchido, a linha deve ficar válida sem edição manual.

4. Validar com os processos do print:
   - `BVCPDIM26050265`, `BVCPDIM26050251`, `BSSZDEX26050364`, etc.;
   - confirmar que o preview retorna `spo` preenchido, `dfv_found=true` e sem erro de `SPO obrigatório` quando existir associação na tabela SPO ou no fallback Voucher.

Arquivos previstos:

- `supabase/functions/mariadb-proxy/index.ts`
- `src/components/esteira/BatchImportVoucherDialog.tsx` somente se a validação local ainda sobrescrever o retorno correto do backend.