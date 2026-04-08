

## Plano: Corrigir busca de Master por SPO de voucher filho

### Causa raiz
O campo `voucherMasterId` **nunca é mapeado** no `mapVoucherFromDB` (linhas 732-785 de `EsteiraIndex.tsx`). O campo `voucher_master_id` vem do banco mas é ignorado no mapeamento. Resultado: o `masterChildSPOsMap` está sempre vazio e a busca por SPO de filho nunca encontra o Master.

### Correção

**`src/pages/esteira/EsteiraIndex.tsx`** — `mapVoucherFromDB` (~linha 768)

Adicionar a linha faltante no mapeamento:
```typescript
voucherMasterId: v.voucher_master_id || null,
```

Isso alimenta o `useMemo` do `masterChildSPOsMap` e faz a busca por SPO de filho funcionar como esperado.

### Arquivo alterado
| Arquivo | Alteração |
|---------|-----------|
| `src/pages/esteira/EsteiraIndex.tsx` | Adicionar `voucherMasterId: v.voucher_master_id` no `mapVoucherFromDB` |

### Resultado esperado
Ao buscar pelo número de um voucher filho (ex: `SPO-001`), o voucher Master correspondente aparecerá nos resultados junto com o próprio filho.

