---
name: Lote BOLETO prevalece sobre DAI
description: No fluxo de lote, linha_digitavel do BOLETO sempre sobrescreve a do DAI; DAI só vale se nenhum BOLETO existir nem estiver sendo vinculado na mesma ação
type: feature
---
Em `BatchDocumentBinderDialog.tsx`, a extração de linha digitável ordena `extractionTargets` para processar DAI primeiro e BOLETO por último, garantindo que `save_linha_digitavel` do BOLETO sobrescreva. `voucherHasBoleto` também considera VIDs que recebem BOLETO na mesma ação (não só `docs` carregado).

**Master voucher (lote):** a linha digitável do master vem EXCLUSIVAMENTE do BOLETO/DAI vinculado ao próprio grupo master (`t_voucher_batch_documents.is_master_group=1`), extraída em `finalize_batch_import` no momento da criação do master via chamada interna a `extract-boleto-barcode`. Nunca herdar de `linha_digitavel` dos filhos individuais — o boleto único do master é a fonte de verdade e pode substituir boletos antigos dos pré-lançados.
