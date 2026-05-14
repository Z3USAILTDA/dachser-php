## Editar Dados — Inline na tela de Detalhes

O modal `EditVoucherDialog` ainda é aberto pelo botão **Editar Dados** dentro da tela de detalhes (`VoucherOperacaoActions` e `VoucherRascunhoActions`). Vou substituir por edição inline com autosave, conforme o item 3a do plano original.

### 1. Novo hook `useVoucherInlineSave(voucherId)`

Arquivo: `src/hooks/useVoucherInlineSave.ts`

- Retorna `{ save(field, value), savingField, savedField }`.
- `save` chama `mariadb-proxy.update_voucher_esteira` com **apenas** o campo alterado (`updates: { [snakeKey]: value }`).
- Autenticação igual ao `EditVoucherDialog` (`localStorage.user/dachser_user`).
- Debounce mínimo (300 ms) por campo. Toast discreto em sucesso/erro.
- Indicador visual: `savingField === field` → spinner; após sucesso, ícone check por 1.5 s.
- Após sucesso, dispara callback `onSaved?.()` para o pai recarregar (`onUpdate`).

### 2. Componente `InlineField` interno (em `VoucherDetailsView.tsx`)

Renderiza o label + o valor formatado. Quando `editable=true`, ao clicar vira input/select/textarea, com `onBlur` salvando via hook.

Tipos suportados:
- `text` (fornecedor, CNPJ, filial, chave PIX, comentários)
- `number` (valor)
- `date` (vencimento, data emissão)
- `select` (moeda + checkbox estrangeira, tipo documento, forma pagamento, cobrança em nome de, origem do processo)
- `switch` (urgente)

Visual: borda discreta dourada (`#F5B843`) ao focar, indicador de save à direita. Não-editáveis renderizam exatamente como hoje.

### 3. Editabilidade em `VoucherDetailsView`

Nova prop `canEditFields?: boolean` (default `false`). Habilitada quando o pai detecta `etapaAtual ∈ {A_PROCESSAR, OPERACAO, AJUSTE_OPERACAO}`. Substitui cada `<p>` dos campos da seção "Informações do Voucher/SPO" por `<InlineField>` quando `canEditFields`.

Campos editáveis (espelha o `CreateVoucherDialog`):
- Nº Voucher/SPO, Fornecedor, CNPJ, Valor, Moeda + flag estrangeira, Vencimento, Data Emissão, Tipo Documento, Filial, Forma de Pagamento, Cobrança em Nome de, Urgente, Chave PIX (só se PIX), Origem do Processo, Comentários.

Não editáveis: Nº Processo, Status Baixa, Status Financeiro, Remessa, Email do Cliente, Tempo na Etapa.

### 4. Remover botão "Editar Dados" e modal

- `VoucherOperacaoActions.tsx`: remover `<Button>Editar Dados</Button>`, `<EditVoucherDialog>`, `showEditDialog` state e import.
- `VoucherRascunhoActions.tsx`: idem.
- `EditVoucherDialog.tsx`: **mantido** (segue acessível pelo menu de ações da lista — `VoucherActionsMenu`).

### 5. Wire-up em `EsteiraVoucherDetails.tsx`

Passar `canEditFields={["A_PROCESSAR","OPERACAO","AJUSTE_OPERACAO"].includes(voucher.etapaAtual)}` para `VoucherDetailsView`.

### Arquivos alterados

- `src/hooks/useVoucherInlineSave.ts` (novo)
- `src/components/esteira/VoucherDetailsView.tsx`
- `src/components/esteira/VoucherOperacaoActions.tsx`
- `src/components/esteira/VoucherRascunhoActions.tsx`
- `src/pages/esteira/EsteiraVoucherDetails.tsx`

### Não vou alterar

- `EditVoucherDialog.tsx` (ainda usado pelo menu da lista).
- Backend (`update_voucher_esteira` já aceita updates parciais).
- Lógica de stages, anexos, baixa.