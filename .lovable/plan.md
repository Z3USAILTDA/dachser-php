
## Objetivo

Refinar a importação de SPO em lote em 4 pontos:

1. Painel "Editar em lote" com 3 campos fixos (Tipo de Documento, Forma de Pagamento, Fiscal), sem seletor de campo.
2. Vinculação de 1 arquivo a múltiplos vouchers → cria master automaticamente; mostra total acumulado e popup de confirmação com o `numero_spo` que o master receberá.
3. Mesmo lote pode misturar masters (vínculo de N>1 vouchers a 1 arquivo) e individuais (vínculo 1↔1). Ao finalizar, criar os masters necessários e promover os individuais.
4. Filtro de busca por **fornecedor** nas telas de edição da planilha e de anexos.

---

## 1. Editar em lote — 3 campos fixos (frontend)

Arquivo: `src/components/esteira/BatchImportVoucherDialog.tsx`

- Substituir o conteúdo do `Popover` "Editar em lote" (linhas ~529-557): em vez de `Select` para escolher o campo, mostrar simultaneamente 3 `Select` (um por campo), todos opcionais — o usuário preenche os que quiser e clica em Aplicar.
  - Tipo de Documento → `tipo_documento` (TIPOS_DOC)
  - Forma de Pagamento → `forma_pagamento` (FORMAS, com mapeamento já existente)
  - Fiscal → `cobranca_em_nome_de` (Sim — Fiscal `DACHSER` / Não — Cliente `CLIENTE`)
- Ajustar `applyBulk` para aplicar todos os campos preenchidos de uma vez nas linhas selecionadas (somente os com valor; vazios são ignorados). Manter `field_origin` = `MANUAL` por campo aplicado.
- Remover o estado `bulkField` e usar `bulkValues: Record<string,string>`.
- Manter botão habilitado apenas quando `selected.size > 0` e ao menos 1 dos 3 campos preenchido.

---

## 2. Master automático ao vincular múltiplos vouchers

Arquivo principal: `src/components/esteira/BatchDocumentBinderDialog.tsx` (frontend)
Backend: `supabase/functions/mariadb-proxy/index.ts` (action `bind_batch_document_to_voucher` e nova action de preview/grouping)

**Frontend (`BatchDocumentBinderDialog.tsx`):**

- Trocar `selectedVoucher: string | null` por `selectedVouchers: Set<string>`. O componente `BatchVoucherChecklist` passa a aceitar checkbox/seleção múltipla (mantendo a aparência atual; clique no card alterna seleção).
- Acima do botão "Vincular", mostrar barra com:
  - Quantidade de vouchers selecionados
  - **Valor total (soma `item.valor` dos selecionados)** formatado em BRL
  - Em modo master (≥2): badge "Master" + texto "será atribuído numero_spo: XXX" — calcular previewSpo client-side usando o **menor `id_rm`** entre os itens do checklist correspondentes (refletindo a regra atual `master-numbering-logic-v1` usando `id_rm` como chave acessível na UI; o backend revalida no momento da criação).
- Ao clicar em "Vincular", abrir `AlertDialog` com:
  - Se 1 voucher → confirmação simples (vínculo individual).
  - Se ≥2 → "Será criado um voucher master agrupando N vouchers. SPO do master: XXX. Total: R$ Y. Confirma?"
- No confirm:
  - Se 1 voucher: invocar `bind_batch_document_to_voucher` como hoje.
  - Se ≥2: invocar nova action `bind_batch_document_to_master_group` (ver backend) passando `batch_document_id`, `voucher_ids[]`, `tipo_anexo`. Não cria o master ainda — apenas registra a intenção (grupo). O master é criado de fato no `finalize_batch_import`.
- Após vincular, limpar `selectedVouchers` e refresh.
- Ajustar exibição na coluna "Documentos do lote": quando o doc estiver vinculado a um grupo master, mostrar badge "Master (N vouchers)" no lugar do tipo único.
- `unbind_batch_document` continua removendo o vínculo (e o grupo, se for master).

**Backend (`mariadb-proxy/index.ts`):**

- Nova migração leve via `ALTER TABLE` na própria action (ou tabela auxiliar): adicionar colunas em `t_voucher_batch_documents`:
  - `is_master_group TINYINT(1) DEFAULT 0`
  - `master_voucher_ids JSON NULL` (lista de voucher_ids agrupados; quando preenchida, `voucher_id`/`anexo_id` ficam NULL até finalização).
- Nova action `bind_batch_document_to_master_group`:
  - Valida que todos os `voucher_ids` pertencem ao mesmo `batch_id` do documento.
  - Atualiza o doc com `is_master_group=1`, `master_voucher_ids=JSON`, `tipo_anexo=?`, `status='VINCULADO'`, `bound_by_*`, `bound_at`.
  - Não cria anexos individuais ainda (serão atribuídos ao master no finalize).
  - Registra log `ANEXO_VINCULADO_LOTE_MASTER` para cada voucher do grupo.
- Ajustar `unbind_batch_document` para também limpar `is_master_group`/`master_voucher_ids`.
- Ajustar `get_batch_import_status`:
  - `documents` retorna `is_master_group` e `master_voucher_ids` (parsed).
  - O cálculo de `temFatura`/`temBoleto` no `checklist` também considera vínculos via grupo master — para cada voucher membro de um grupo, contar os tipos dos docs do grupo.

---

## 3. Finalize misto (masters + individuais)

Arquivo: `supabase/functions/mariadb-proxy/index.ts`, action `finalize_batch_import` (linha ~18841).

Antes da promoção atual:

1. Buscar todos os docs do lote com `is_master_group=1` e `master_voucher_ids` não nulo.
2. Agrupar por conjunto único de `voucher_ids` (mesmo conjunto = mesmo master).
3. Para cada grupo:
   - Buscar metadata dos vouchers (fornecedor, cnpj, valor, vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de, filial, moeda, id_rm, numero_spo, idmov via DFV) — reutilizando consulta análoga à de `case 'create_voucher_master'`.
   - Determinar `numeroSpoMaster` pela mesma regra (`COALESCE(idmov, id_rm)` mínimo).
   - Inserir registro master em `t_vouchers` (espelhando `case 'create_voucher_master'`); marcar children com `voucher_master_id` e `is_master=0`.
   - Para cada doc do grupo, criar `t_voucher_anexos` apontando para o master (substitui o anexo_id antes nulo); atualizar o doc com `voucher_id=master_id`, `anexo_id=…`.
   - Promover o **master** para a etapa adequada (mesma lógica de destino atual; `urgencia_tipo`/`cobranca_em_nome_de`).
   - Os children ficam com `etapa_atual` apontando para o master ou `CONSOLIDADO_NO_MASTER` (manter compatibilidade com fluxo existente — usar mesmo padrão do `create_voucher_master`).
4. Para os vouchers que não fazem parte de nenhum grupo master e têm vínculo direto (`voucher_id` setado), aplicar a promoção individual já existente.
5. Validação de pendências (`PENDENTE_FATURA`, `PENDENTE_BOLETO`) deve considerar docs vinculados via grupo master para os vouchers membros (já tratado no get_batch_import_status; replicar a checagem no finalize).

Logs: `MASTER_CRIADO_LOTE` por master e `VOUCHER_PROMOVIDO_LOTE` por voucher promovido (master ou individual).

---

## 4. Busca por fornecedor

**Tela de edição (`BatchImportVoucherDialog.tsx` + `BatchImportPreviewTable.tsx`):**
- O input atual já busca em SPO/processo. Estender o `hay` para incluir `it.fornecedor` (toLowerCase).
- Ajustar placeholder: "Buscar SPO, processo ou fornecedor...".

**Tela de anexos (`BatchDocumentBinderDialog.tsx`):**
- Acima da lista de "Vouchers do lote", adicionar `<Input>` com ícone `Search` (mesmo estilo da tela de edição) e estado `voucherSearch`.
- Filtrar `checklist` por `fornecedor`/`numero_spo` (case-insensitive).
- Aplicar também na seção "Documentos do lote" um input opcional? **Não** — só vouchers, conforme pedido.

---

## Detalhes técnicos resumidos

- Sem alteração no parser/`parseSheetRow` nem em `mergeWithDfv`.
- `BatchVoucherChecklist` ganha prop opcional `multi?: boolean` para alternar visual de seleção (checkbox no canto). Mantém o look-and-feel atual.
- Cálculo do preview de `numero_spo` master no frontend: `min(id_rm)` entre os selecionados; se nenhum tiver `id_rm`, usar o primeiro `numero_spo`. Reflete intenção; backend recomputa no finalize com idmov.
- Schema: alteração em `t_voucher_batch_documents` aplicada via `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` na primeira execução das novas actions (mesmo padrão usado em `create_voucher_master`).

## Arquivos editados

- `src/components/esteira/BatchImportVoucherDialog.tsx` — popover bulk com 3 campos fixos; busca por fornecedor.
- `src/components/esteira/BatchImportPreviewTable.tsx` — filtro por fornecedor no `hay`.
- `src/components/esteira/BatchDocumentBinderDialog.tsx` — seleção múltipla, total, popup de confirmação, busca por fornecedor, badges master.
- `src/components/esteira/BatchVoucherChecklist.tsx` — modo multi-seleção opcional.
- `supabase/functions/mariadb-proxy/index.ts` — nova action `bind_batch_document_to_master_group`; ajustes em `unbind_batch_document`, `get_batch_import_status` e `finalize_batch_import` para suportar grupos master.

Sem alterações em frontend de outras telas, no parser de planilha, nem em RLS/auth.
