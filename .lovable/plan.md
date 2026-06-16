## Contexto

Na importação em lote (`BatchDocumentBinderDialog`), quando um documento é vinculado a um voucher (ou master group), o sistema apenas registra o anexo via `bind_batch_document_to_voucher` / `bind_batch_document_to_master_group`. Diferente do fluxo unitário (`VoucherRascunhoActions`, `VoucherMasterForm`, etc.), nenhuma extração de linha digitável é disparada.

Regra existente: anexo `DAI` dispensa fatura/boleto (`temDai` no `mariadb-proxy`).

## Mudança

Tratar `DAI` como portador de linha digitável no fluxo de lote, **apenas quando o SPO não tiver BOLETO vinculado** — quando há BOLETO, ele é a única fonte de linha digitável (mantém o comportamento atual do fluxo unitário).

### Frontend — `src/components/esteira/BatchDocumentBinderDialog.tsx` (função `doBind`, ~linha 208)

Após cada bind bem-sucedido, para cada `voucher_id` afetado:

1. Determinar a fonte de linha digitável:
   - Se `tipoAnexo === "BOLETO"` → usar o `file_url` do doc recém-vinculado.
   - Se `tipoAnexo === "DAI"` → consultar os anexos existentes do voucher (após `refresh()`, via `checklist`/`docs` do lote já carregados, ou via `mariadb-proxy` `get_voucher_anexos`); se já houver qualquer anexo com `tipo === "BOLETO"` vinculado a esse voucher, **pular** a extração.
   - Outros tipos → não extrai.
2. Chamar `supabase.functions.invoke("extract-boleto-barcode", { body: { fileUrl } })`.
3. Em sucesso (`linhaDigitavel` presente), gravar via `mariadb-proxy` `save_linha_digitavel` (`linha_digitavel` + `codigo_barras`) para cada `voucher_id` do bind (1 no single, N no master).
4. Toast informativo; erros apenas em `console.warn` — não bloquear o fluxo do lote.

### Decisão de "tem boleto"

Usar a lista `docs` do próprio lote (já carregada em `refresh()`) filtrando por `voucher_id` (single) ou `master_voucher_ids` (master) e `tipo_anexo === "BOLETO"`. Isso evita roundtrip extra e cobre o caso em que BOLETO e DAI são vinculados no mesmo lote.

Ordem importa: se o usuário vincular DAI antes do BOLETO, a extração do DAI ocorre, e depois o BOLETO (quando vinculado) sobrescreve via fluxo normal. Comportamento aceitável dado o requisito ("apenas se nenhum boleto for vinculado junto").

### Não alterar

- `extract-boleto-barcode`, schema, handlers `bind_*` no `mariadb-proxy`.
- Regra `temDai` de obrigatoriedade.
- Componentes fora do `BatchDocumentBinderDialog`.

## Fora de escopo

- Edição/criação unitária de voucher.
- Mudança no parser de DAI ou suporte a novos formatos de linha digitável.
