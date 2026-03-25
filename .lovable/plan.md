

## Plano: Corrigir campo HBL no detalhe da pré-fatura

### Problema
Na dialog de detalhes da pré-fatura (`PreInvoiceDetailsDialog.tsx`), linha 135-136:
- O label diz "BL:" quando deveria ser "HBL:"
- O valor usa `preInvoice.bl_number` que contém o MBL duplicado, em vez do HBL real enriquecido pelo backend

### Alteração em `src/components/demurrage/PreInvoiceDetailsDialog.tsx`

1. Renomear o label de "BL:" para "HBL:"
2. Usar `(preInvoice as any).hbl || preInvoice.bl_number || '-'` para exibir o HBL enriquecido pelo backend (mesmo padrão já usado na tabela de pré-faturamento)

### Arquivo editado
- `src/components/demurrage/PreInvoiceDetailsDialog.tsx`

