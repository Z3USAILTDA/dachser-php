
## Objetivo
Três ajustes pontuais na esteira do voucher (frontend + uma action no `mariadb-proxy`), sem mexer em régua, e-mails ou estrutura de tabelas.

---

## 1) Anexo obrigatório na criação manual (ADF isento)

**Onde:** `src/components/esteira/CreateVoucherDialog.tsx` e `src/components/esteira/VoucherMasterForm.tsx`.

**Mudanças:**
- Manter a regra atual em `CreateVoucherDialog`: anexo de fatura obrigatório **exceto quando `tipoDocumento === "ADF"`** (ADF segue podendo ser criado sem anexo).
- Adicionar `disabled` no botão "Criar Voucher/SPO" quando `faturaFiles.length === 0 && tipoDocumento !== "ADF"` — hoje só há toast, falta feedback visual.
- `VoucherMasterForm` já exige anexo — adicionar o mesmo `disabled` no botão de submit quando `faturaFiles.length === 0`.
- Manter exceção do "Salvar Rascunho" (não exige anexo).
- Manter `statusDocumentoFiscal = "PENDENTE"` para ADF criado sem anexo.

**Não muda:** importação via RM/Lote, criação automática via cron, vouchers vindos de RM.

---

## 2) Filtro de etapa deve ignorar o filtro de mês

**Onde:** `src/pages/esteira/EsteiraIndex.tsx` — função `loadVouchers` (linhas ~909-960) e o `useEffect` que recarrega com `quickFilterMesEmissao` (linha 1213).

**Comportamento atual:** `get_vouchers_combined` recebe `data_emissao_inicio/fim` derivados do mês; mudar etapa só filtra em memória → processos fora do mês nunca aparecem.

**Mudança:**
- Quando `filters.etapa !== "all"`, chamar `get_vouchers_combined` **sem** filtro de mês e aplicar etapa client-side como já é feito.
- Quando `filters.etapa === "all"`, manter o comportamento atual (filtro de mês ativo).
- Incluir `filters.etapa` nas dependências do `useEffect` que recarrega vouchers, para refetch ao alternar etapa.
- Backend já aceita ausência do filtro (`hasMonthFilter = false`), sem alteração no `mariadb-proxy`.

---

## 3) Filtro de mês passa a usar data de vencimento

**Onde:** `supabase/functions/mariadb-proxy/index.ts` case `get_vouchers_combined` (linhas 17506-17610) e labels no `EsteiraIndex.tsx` (~2160-2190).

**Backend:**
- `ativosMonthClause`: trocar `dfv.data_emissao`/`v.data_emissao_documento` por `v.vencimento` com fallback em `dfv.data_vencimento`:
  ```
  (v.vencimento >= ? AND v.vencimento < ?)
  OR (v.vencimento IS NULL AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?)
  ```
- `pendentesMonthClause`: trocar `dfv.data_emissao` por `dfv.data_vencimento`.
- Manter exceção das etapas `RASCUNHO/OPERACAO/FINANCEIRO` (sempre aparecem) e o subquery `dfv` agregado.
- Aceitar novos parâmetros `data_vencimento_inicio/fim`, mantendo `data_emissao_inicio/fim` como alias temporário para não quebrar chamadas existentes.

**Frontend:**
- Renomear `quickFilterMesEmissao` → `quickFilterMesVencimento` (state + label "Mês de Emissão" → "Mês de Vencimento").
- Enviar como `data_vencimento_inicio/fim` na chamada `get_vouchers_combined`.

---

## Validação
- Criar voucher não-ADF sem fatura → botão desabilitado (+ toast se forçado).
- Criar voucher ADF sem fatura → permitido, `status_documento_fiscal = PENDENTE`.
- Etapa "Fiscal" com mês passado selecionado → lista todos os processos em Fiscal independente do mês.
- "Todas" etapas com um mês → apenas vouchers/RM com vencimento naquele mês (+ exceções RASCUNHO/OPERACAO/FINANCEIRO).
- Console logs confirmam `monthFilter=none` quando etapa ≠ "all".

## Fora de escopo
Disparo de e-mails, régua, schema de tabelas, importação em lote, cron.
