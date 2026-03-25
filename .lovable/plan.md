

## Plano: Trocar filtros Origem/Destino por Tipo Processo

### Alterações em `src/pages/demurrage/DemurrageMonitor.tsx`

**1. State** — Remover `filterPortoOrigem` e `filterPortoDestino`, adicionar `filterTipoProcesso`

**2. Filtro client-side** — Substituir os blocos de filtro de porto_origem/porto_destino pelo filtro de tipo_processo:
```typescript
if (filterTipoProcesso !== "all") {
  result = result.filter(c => c.tipo_processo === filterTipoProcesso);
}
```

**3. Unique values** — Remover `uniquePortosOrigem`/`uniquePortosDestino`, adicionar:
```typescript
const uniqueTipoProcesso = useMemo(() => 
  [...new Set(containers.map(c => c.tipo_processo).filter(Boolean))].sort() as string[], [containers]);
```

**4. UI** — Substituir os dois `<Select>` de Porto Origem e Porto Destino por um único Select de Tipo Processo com opções dinâmicas (valores do banco, ex: "SEA IMPORT", "SEA EXPORT")

**5. Limpeza** — Atualizar `hasActiveFilters`, `clearAllFilters` e o `useEffect` de reset de página para usar `filterTipoProcesso` em vez dos dois filtros removidos

### Arquivo editado
- `src/pages/demurrage/DemurrageMonitor.tsx`

