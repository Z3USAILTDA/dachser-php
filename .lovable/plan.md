## Objetivo

Quando um conjunto de pré-lançados já tem um DAI vinculado (com linha digitável extraída) e, em seguida, recebe um BOLETO durante a formação do voucher master no lote, o sistema deve **sempre prevalecer a linha digitável do BOLETO**, sobrescrevendo a que veio do DAI.

## Diagnóstico

Em `src/components/esteira/BatchDocumentBinderDialog.tsx` (linhas ~240-330):

1. Cada vinculação acumula `extractionTargets` (BOLETO ou DAI).
2. O filtro `voucherHasBoleto(vid)` consulta apenas o `docs` já carregado — não considera BOLETOs que estão sendo vinculados na **mesma** ação.
3. O loop `for (const target of extractionTargets)` processa na ordem em que os documentos foram selecionados. Se um DAI for processado **depois** de um BOLETO no mesmo batch, ele pode sobrescrever a linha digitável do BOLETO (porque `save_linha_digitavel` sempre faz UPDATE direto em `t_vouchers.linha_digitavel`).
4. Se o BOLETO chega numa ação posterior à do DAI, hoje funciona (overwrite acontece). O bug está apenas no caso de DAI + BOLETO na mesma ação, ou em ações intercaladas onde `docs` não foi atualizado a tempo.

## Mudança (cirúrgica, somente frontend)

Arquivo único: `src/components/esteira/BatchDocumentBinderDialog.tsx`.

1. **Considerar os BOLETOs em vinculação atual** em `voucherHasBoleto`: além de `docs`, marcar como "tem boleto" qualquer `vid` que apareça em algum `extractionTargets[i]` com `tipo === "BOLETO"`.
2. **Ordenar `extractionTargets`** antes do loop: processar todos os **DAI primeiro** e os **BOLETO por último**. Assim, se ambos coexistem para o mesmo voucher, o BOLETO sempre faz o último `save_linha_digitavel` e prevalece — mesmo em race de cache do `docs`.
3. Manter o filtro existente que pula DAI quando já existe BOLETO no voucher (agora reforçado pelo item 1).

Nenhuma alteração no backend (`mariadb-proxy`, `extract-boleto-barcode`) ou em outros componentes.

## Fora de escopo

- Comportamento do fluxo normal da esteira (não-lote).
- Demais ações do `BatchDocumentBinderDialog` (preview, master/SPO numbering, anexos).
- Backend `save_linha_digitavel` (já sobrescreve corretamente).

## Memória

Atualizar `mem://vouchers/document-validation-rules-v2` (ou adicionar nota curta) com a regra: **"No lote, BOLETO sempre prevalece sobre DAI para `linha_digitavel`; DAI só é fonte se nenhum BOLETO estiver vinculado nem sendo vinculado no mesmo conjunto."**
