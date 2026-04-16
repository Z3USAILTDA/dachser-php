

## Plano: Mover Tipo de Documento e Forma de Pagamento para Campos Adicionais

### Contexto
Atualmente, "Tipo de Documento" está na seção principal de informações (junto com dados do RM) e é preenchido automaticamente pela busca RM (`form.setValue("tipoDocumento", rmData.tipoDocumento)`). "Forma de Pagamento" já está na seção "Campos Adicionais" mas também é preenchida pelo RM (`form.setValue("formaPagamento", rmData.formaPagamento)`).

O pedido é que ambos os campos sejam tratados como campos adicionais manuais, sem usar dados do banco.

### Alterações

**Arquivo: `src/components/esteira/CreateVoucherDialog.tsx`**

1. **Remover auto-fill do RM** (L241-242):
   - Remover `form.setValue("formaPagamento", rmData.formaPagamento)` 
   - Remover `form.setValue("tipoDocumento", rmData.tipoDocumento || "")`
   - Os campos manterão seus valores padrão (BOLETO e vazio)

2. **Mover "Tipo de Documento"** da seção principal (L1109-1138) para a seção "Campos Adicionais (não do RM)" (L1159+):
   - Remover o campo da grid de Row 2 (onde está junto com Valor/Moeda)
   - Colocar na grid de 3 colunas dos Campos Adicionais, junto com Filial, Cobrança em Nome De e Forma de Pagamento
   - A grid passará de 3 para 4 colunas (ou 2 rows de 2)

### Resultado
- Os dois campos ficam explicitamente na seção "Campos Adicionais (não do RM)"
- O operador sempre preenche manualmente, mesmo quando busca pelo RM
- Valores padrão mantidos: Forma de Pagamento = BOLETO, Tipo de Documento = vazio (obrigatório selecionar)

