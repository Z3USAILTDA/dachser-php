

## Plano: Geração de Título de Pre-Alert nos Modais Aéreo e Marítimo

### Formato do título
```
Dachser Pre-Alert SE - PO: {po}; - {customer_number} - HBL: {hbl} - MBL: {mbl} - {consignee} - Consignee: {consignee_destino} - {airport/port} - ETD: {etd} - ETA: {eta}
```

Para **aéreo**, adaptar com AWB em vez de MBL/HBL:
```
Dachser Pre-Alert AIR - PO: {po}; - {customer_number} - AWB: {awb} - HAWB: {hawb} - {consignee} - Consignee: {consignee} - {airport_dest} - ETD: {etd} - ETA: {eta}
```

### Alterações

**1. `src/components/sea/CadastroMaritimoModal.tsx`**
- Adicionar função `generatePreAlertTitle(form)` que monta o título usando os campos: `po_number`, `consignee_customer_number`, `hbl_number`, `master_number`, `consignee_nome` (ou `consignee_expo`), port, `etd`, `eta` — formatando datas como `DD.MM.YYYY`
- Após salvar com sucesso, gerar o título e exibi-lo em um campo copiável (com botão "Copiar") antes de fechar o modal, ou copiar automaticamente para o clipboard
- Também exibir um campo read-only com preview do título em tempo real conforme o usuário preenche os campos

**2. `src/components/air/CadastroNovaModal.tsx`**
- Mesma lógica, usando `awb_number`, `hawb_number`, `po_number`, `consignee_customer_number`, `consignee_nome`, `airport_destination`, `etd`, `eta`
- Preview em tempo real + cópia automática ao salvar

### Comportamento
- Um campo read-only "Título Pre-Alert" aparece no topo/rodapé do formulário, atualizado em tempo real
- Botão de copiar (ícone clipboard) ao lado do campo
- Ao salvar com sucesso, o título é copiado automaticamente para o clipboard com toast informando
- Campos vazios são omitidos do título (sem "PO: ;")

### Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/sea/CadastroMaritimoModal.tsx` | Função `generatePreAlertTitle` + campo preview + cópia ao salvar |
| `src/components/air/CadastroNovaModal.tsx` | Mesma lógica adaptada para campos aéreos |

