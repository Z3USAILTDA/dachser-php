---
name: Lote BOLETO prevalece sobre DAI
description: No fluxo de lote, linha_digitavel do BOLETO sempre sobrescreve a do DAI; DAI só vale se nenhum BOLETO existir nem estiver sendo vinculado na mesma ação
type: feature
---
Em `BatchDocumentBinderDialog.tsx`, a extração de linha digitável ordena `extractionTargets` para processar DAI primeiro e BOLETO por último, garantindo que `save_linha_digitavel` do BOLETO sobrescreva. `voucherHasBoleto` também considera VIDs que recebem BOLETO na mesma ação (não só `docs` carregado).
