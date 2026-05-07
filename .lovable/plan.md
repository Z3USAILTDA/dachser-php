## Importação de SPO em lote — plano completo (revisado)

Objetivo: criar muitos vouchers a partir de uma planilha de SPOs, usando **exatamente o mesmo conjunto de campos do formulário "via RM"**, e anexar/vincular documentos em lote sem nunca usar o nome do arquivo.

---

### Princípio de paridade com o formulário "via RM"

Cada linha da planilha gera 1 voucher com **todos os campos hoje exigidos/aceitos no formulário individual via RM** (vide screenshot). Para cada campo, a regra de preenchimento é:

1. **DFV** (`t_dados_financeiro_voucher` via SPO) — fonte primária para campos espelhados do RM.
2. **Planilha** — sobrescreve/preenche o que o DFV não tem ou o usuário declarar.
3. **Manual** — edição inline na tela de preview, célula a célula, antes de confirmar.

Campo só fica "—" se nenhuma das três fontes preencher. Campos obrigatórios em branco ⇒ linha marcada `ERROR` e não cria voucher.

#### Mapa de campos (idêntico ao formulário via RM)

| Bloco | Campo | Obrig. | Origem padrão |
|---|---|---|---|
| Busca | SPO/Voucher | sim | planilha (chave) |
| Vinculação Processo | Nº do Processo | sim | planilha |
| Vinculação Processo | Origem do Processo (AIR/SEA/CHB/ROD) | sim | planilha |
| Dados Voucher | Fornecedor | sim | DFV → planilha |
| Dados Voucher | CNPJ Fornecedor | — | DFV → planilha |
| Dados Voucher | Valor | sim | DFV → planilha |
| Dados Voucher | Moeda | sim | DFV → planilha (default BRL) |
| Dados Voucher | Data de Vencimento | sim | DFV → planilha |
| Dados Voucher | Data de Emissão | — | DFV → planilha |
| Adicionais | Tipo de Documento | sim | planilha → manual |
| Adicionais | Filial | — | DFV → planilha |
| Adicionais | Forma de Pagamento | sim | planilha (mapa `FORMA_MAP_CODE`) |
| Adicionais | Contabilização Fiscal? (Sim/Não) | sim | planilha (default "Sim") |
| Adicionais | Pagamento Urgente | — | planilha (default false) |
| Adicionais | Comentários | — | planilha |
| Pagamento | id_rm | — | DFV (herdado) |

> Campos só do RM (responsáveis, etapas, datas de auditoria) seguem a mesma criação automática do fluxo individual — não vêm da planilha.

### Etapa 1 — Upload e preview

- `BatchImportVoucherDialog`: aceita `.csv/.xlsx` com cabeçalhos atualizados para refletir TODAS as colunas acima (não só as 8 atuais).
- Backend `preview_voucher_batch_import`:
  - Lookup em DFV por SPO.
  - Merge DFV + planilha aplicando precedência acima.
  - Mapeia `forma_pagamento` via `FORMA_MAP_CODE`.
  - Devolve por linha: todos os campos resolvidos + `Origem` por campo (DFV / Planilha / —) + `status` (VALID | ERROR) + `pendencias[]`.
- `BatchImportPreviewTable`:
  - Colunas espelhando o formulário (SPO, Processo, Origem Processo, Fornecedor, CNPJ, Valor, Moeda, Vencimento, Emissão, Tipo Doc, Filial, Forma Pag, Fiscal?, Urgente, Comentários).
  - **Edição inline** das células (correção manual) com revalidação ao sair da célula.
  - Badge de origem por campo (chip pequeno: "DFV", "Planilha", "Manual").
  - Linhas `ERROR` destacadas com lista de pendências no tooltip.

### Etapa 2 — Confirmar e criar vouchers

- Botão "Criar N voucher(s)" só habilita quando `validCount > 0`.
- Backend `create_voucher_batch_import` recebe as linhas já editadas:
  - Cria 1 voucher por linha em `t_vouchers` com **todos os campos do formulário RM** preenchidos.
  - `origem_criacao = 'LOTE_PLANILHA'`, `id_rm` herdado do DFV.
  - `etapaAtual` = `OPERACAO` (ou `FISCAL` se "Contabilização Fiscal? = Sim" exigir, seguindo regra atual do via RM).
  - Linhas `ERROR` puladas, listadas no resumo.
- Registra o lote em `t_voucher_batches`.

### Etapa 3 — Anexar e vincular documentos (pool ↔ vouchers)

UX inspirada em `InvoicesDraftHbl.tsx`. **Constraint absoluta:** o nome do arquivo NÃO é usado para nada (nem inferir tipo, nem casar voucher) — apenas rótulo visual.

```text
┌──────────────────────────┬─────────────────────────────────┐
│ POOL DE ARQUIVOS         │ VOUCHERS DO LOTE                │
│ (dropzone única)         │ (1 card por SPO criada)         │
│ [arq1.pdf] [tipo ▾]      │  SPO 12345 · ACME · R$ 1.200    │
│  Vincular a… ▾           │   [arq1 · Fatura ×]             │
│ [arq2.pdf] [tipo ▾]      │  SPO 12346 · XPTO · R$ 980      │
│  Vincular a… ▾           │   (sem anexos)                  │
└──────────────────────────┴─────────────────────────────────┘
```

1. **Upload em pool** → `upload_batch_document` → `t_voucher_batch_documents` com `voucher_id=NULL`, `tipo_documento=NULL`, `status='PENDENTE'`.
2. **Tipo manual obrigatório** por arquivo: Fatura, Boleto, Swift, Comprovante, NF, Outro. Atalho "aplicar aos selecionados".
3. **Vinculação manual ao voucher**:
   - Botão "Vincular a…" abre lista dos vouchers do lote (SPO · fornecedor · valor · vencimento).
   - Opcional: drag & drop arquivo → card do voucher.
   - Pílulas no voucher com `×` para desvincular.
   - Chama `bind_batch_document_to_voucher({batch_document_id, voucher_id, tipo_documento})` — todos obrigatórios.
4. **Confirmar anexos** habilita só quando todo arquivo do pool tiver `tipo_documento` + `voucher_id` (ou estiver `REMOVIDO`).

### Etapa 4 — Finalizar lote

- `finalize_batch_import`:
  - Rejeita se houver doc com `voucher_id IS NULL` ou `tipo_documento IS NULL` (e `status != REMOVIDO`).
  - Para cada voucher, valida documentos mínimos pela `forma_pagamento` (regra já existente via RM).
  - Vouchers OK seguem o fluxo padrão; vouchers com docs insuficientes ficam em `PENDING_DOCUMENTS` e aparecem destacados no resumo, sem bloquear o lote.
- Lote marcado `COMPLETE` quando todos vouchers passam.

---

### Backend — alterações em `mariadb-proxy/index.ts`

- `preview_voucher_batch_import`: lookup DFV por SPO, merge com planilha respeitando todos os campos do RM, devolver origem por campo e pendências.
- `create_voucher_batch_import`: criar voucher com **paridade total** ao via RM, incluindo `id_rm`, `origem_criacao='LOTE_PLANILHA'` e roteamento de etapa.
- `bind_batch_document_to_voucher`: já existe; manter `{batch_document_id, voucher_id, tipo_documento}` obrigatórios.
- `finalize_batch_import`: validar pendências de vínculo/tipo + docs mínimos por forma de pagamento.
- **Remover** qualquer auto-bind por nome de arquivo.

### Frontend — alterações

- `BatchImportVoucherDialog.tsx`: novos `EXPECTED_HEADERS` (todas colunas do RM); steps `upload → preview → attach → finalize`.
- `BatchImportPreviewTable.tsx`: colunas espelhando o formulário, edição inline, badge de origem por campo, tooltip de pendências.
- `BatchImportAttachStep.tsx` (novo): pool + vouchers, select de tipo + "Vincular a…", pílulas, DnD opcional.
- `utils/batchVoucherImport.ts`: parser estendido para todas as colunas.
- Sem heurística por nome de arquivo em ponto algum.

### Fora de escopo

- Fluxo individual via RM permanece inalterado.
- Sem novas colunas em `t_vouchers`.
- Sem mudanças em permissões, esteira, design system.
- Sem OCR / inferência por conteúdo de PDF.