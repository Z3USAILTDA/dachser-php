

## Adicionar armador ZIM na tela Local Charges

### Arquivos alterados

**2 arquivos:**
1. `supabase/functions/mariadb-proxy/index.ts`
2. `src/pages/LocalCharges.tsx`

---

### Alteração 1 — Backend: `mariadb-proxy/index.ts`

**No `case 'get_local_charges'` (linha ~1812):**

Adicionar uma chamada para carregar ZIM logo após ONE:
```typescript
const zim = await loadChargesForCompany(chargesClient, 't_local_charge_zim', 'ZIM');
```

Atualizar o log (linha 1814) para incluir ZIM.

Atualizar o `result` (linha 1816) para incluir `zim`:
```typescript
result = { success: true, hapag, msc, cma, hmm, one, zim };
```

**No `case 'get_fee_changes'` (linha ~1861):**

Adicionar o par ZIM no array `pairs`:
```typescript
{ main: 't_local_charge_zim', hist: 't_local_charge_zim_history' },
```

---

### Alteração 2 — Frontend: `LocalCharges.tsx`

1. Adicionar cor para ZIM no `armadorColors`:
```typescript
'ZIM': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
```

2. Adicionar estado `zimData` (mesmo padrão dos outros).

3. No `fetchLocalCharges`, adicionar:
```typescript
if (data.zim) setZimData(data.zim);
```

4. No `allData` useMemo, adicionar spread de `zimData.rows` com `empresa: 'ZIM'`.

5. No `statsByArmador`, adicionar `'ZIM': zimData.rows.length`.

6. No dropdown `<SelectContent>`, adicionar:
```tsx
<SelectItem value="ZIM">ZIM</SelectItem>
```

---

### O que NÃO muda

- Nenhum layout, estilo, componente, paginação ou ordenação
- Nenhuma outra page ou hook
- A função `loadChargesForCompany` já é genérica e funciona com a tabela ZIM sem alteração

