## Alterações

**1. Reduzir opções de tipo de anexo**

Em `src/utils/batchVoucherImport.ts`, alterar `TIPOS_ANEXO` para conter apenas:
- `FATURA`
- `BOLETO`
- `OUTROS`

Isso impacta automaticamente o select em `BatchDocumentBinderDialog.tsx` (que faz `.map` sobre essa lista).

**2. Confirmação apenas para master**

Em `src/components/esteira/BatchDocumentBinderDialog.tsx`, ajustar `requestBind`:
- Se `isMaster` (≥ 2 vouchers selecionados) → abrir `AlertDialog` de confirmação (comportamento atual).
- Caso contrário → executar `doBind()` diretamente, sem abrir o diálogo.

Nenhuma mudança em backend/edge functions.