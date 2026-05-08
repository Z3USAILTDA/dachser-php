## Objetivo

Mostrar o número do SPO (`numero_spo`) em cada cartão da lista "Vouchers do lote" no modal `BatchDocumentBinderDialog`.

## Mudanças

### 1. `supabase/functions/mariadb-proxy/index.ts` (action `get_batch_import_status`)
Incluir o SPO no objeto do checklist (campo `spo` do item de importação corresponde ao `numero_spo`):
```ts
return { voucher_id: i.voucher_id, numero_spo: i.spo, fornecedor: i.fornecedor, ... };
```

### 2. `src/components/esteira/BatchVoucherChecklist.tsx`
- Adicionar `numero_spo: string | null` à interface `ChecklistItem`.
- Renderizar o SPO no topo do cartão, em destaque (mono, accent gold), antes do fornecedor:
  ```
  SPO 123456                                      R$ 39,49
  EMBRAPORT - EMBRAPORT EMPRESA BRASILEIRA...
  TRANSFERENCIA • venc. 2026-05-15
  ```

Sem alterações em outros componentes; tipos do binder não precisam mudar (apenas repassam `ChecklistItem`).

## Resultado
Cada cartão da coluna direita passa a exibir o `numero_spo` do voucher, facilitando identificação visual.