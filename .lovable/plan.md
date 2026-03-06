

# Fix: ETD futuro deve usar data_insert como cutoff para timeline

## Problema atual

Quando o ETD de um AWB é uma data futura, o sistema anula o cutoff (`etdCutoff = null`), desabilitando completamente a filtragem. Isso pode trazer eventos antigos de ciclos anteriores do mesmo AWB.

## Correção

No bloco de ETD filter (linhas 6265-6272 do `mariadb-proxy/index.ts`):

1. Buscar tambem `data_insert` na query de `t_master_dados`
2. Se o ETD for futuro, usar `data_insert` (menos 7 dias de margem) como cutoff em vez de anular
3. Se o ETD for passado, manter o comportamento atual (usar ETD como cutoff)

### `supabase/functions/mariadb-proxy/index.ts` -- linhas 6258-6271

Alterar a query para incluir `data_insert`:
```sql
SELECT etd, data_insert FROM dados_dachser.t_master_dados
WHERE TRIM(mawb) = TRIM(?) AND etd IS NOT NULL
ORDER BY data_insert DESC LIMIT 1
```

Alterar a logica de cutoff:
```typescript
const etdDate = new Date(etdRows[0].etd);
const now = new Date();
if (etdDate <= now) {
  // ETD no passado: usar ETD como cutoff (comportamento atual)
  etdCutoff = etdDate;
} else {
  // ETD futuro: usar data_insert - 7 dias como cutoff
  const dataInsert = new Date(etdRows[0].data_insert);
  if (!isNaN(dataInsert.getTime())) {
    etdCutoff = new Date(dataInsert.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}
```

Isso garante que, mesmo com ETD futuro, eventos de ciclos antigos sejam filtrados usando a data de inserção do registro no banco como referência.

