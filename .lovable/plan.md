

# Plano: Modal de Armadores - Manter Existentes + Adicionar Novos Dinamicamente

## Objetivo

Manter a lista estática de armadores/prefixos já mapeados no código (garantindo que sempre apareçam) e **adicionar dinamicamente apenas os novos** encontrados nos MBLs sincronizados, junto com contagens reais de uso.

---

## Lógica de Merge (Estático + Dinâmico)

```text
PARA CADA CATEGORIA:
├── Manter TODOS os itens da lista estática (mesmo com 0 MBLs)
├── Adicionar contagem de MBLs encontrados para cada item
├── Adicionar badge "NOVO" para prefixos encontrados que NÃO existem na lista estática
└── Ordenar: primeiro os com MBLs (por contagem desc), depois os sem MBLs
```

---

## Alterações Técnicas

### Arquivo: `src/pages/ContainerTracking.tsx`

#### 1. Criar `useMemo` para merge de dados estáticos + dinâmicos

```typescript
// Estatísticas de armadores: merge estático + dinâmico
const carrierStats = useMemo(() => {
  // Contagem dinâmica baseada nos MBLs carregados
  const dynamicCounts: Record<string, { count: number; prefixes: Set<string>; examples: string[] }> = {};
  const newLclPrefixes: Record<string, { count: number; examples: string[] }> = {};
  const newRoutePrefixes: Record<string, { count: number; examples: string[] }> = {};
  const numericMbls: string[] = [];
  const unknownPrefixes: Record<string, { count: number; examples: string[] }> = {};
  
  // Prefixos estáticos conhecidos (para detectar "novos")
  const staticLclPrefixes = new Set(LCL_PREFIXES.map(p => p.prefix));
  const staticRoutePrefixes = new Set(ROUTE_FORMAT_PREFIXES.map(p => p.prefix));
  
  // Contagem por prefixo LCL existente
  const lclCounts: Record<string, number> = {};
  LCL_PREFIXES.forEach(p => lclCounts[p.prefix] = 0);
  
  // Contagem por prefixo Rota existente
  const routeCounts: Record<string, number> = {};
  ROUTE_FORMAT_PREFIXES.forEach(p => routeCounts[p.prefix] = 0);
  
  for (const mbl of mblList) {
    const mblId = (mbl.mbl_id || '').toUpperCase().trim();
    if (!mblId) continue;
    
    const carrier = detectCarrierFromMbl(mblId);
    
    if (carrier.code !== 'UNKNOWN') {
      // Armador mapeado - incrementa contagem
      if (!dynamicCounts[carrier.code]) {
        dynamicCounts[carrier.code] = { count: 0, prefixes: new Set(), examples: [] };
      }
      dynamicCounts[carrier.code].count++;
      dynamicCounts[carrier.code].prefixes.add(mblId.substring(0, 4));
      
    } else if (/^\d+$/.test(mblId)) {
      // MBL numérico
      if (numericMbls.length < 5) numericMbls.push(mblId);
      
    } else if (/^[A-Z]{2,4}\/[A-Z]{2,4}/.test(mblId)) {
      // Formato rota
      const prefix = mblId.split('/').slice(0, 2).join('/');
      if (staticRoutePrefixes.has(prefix)) {
        routeCounts[prefix] = (routeCounts[prefix] || 0) + 1;
      } else {
        // NOVO prefixo de rota
        if (!newRoutePrefixes[prefix]) newRoutePrefixes[prefix] = { count: 0, examples: [] };
        newRoutePrefixes[prefix].count++;
        if (newRoutePrefixes[prefix].examples.length < 2) {
          newRoutePrefixes[prefix].examples.push(mblId);
        }
      }
      
    } else {
      // Verificar se é LCL conhecido
      const matchedLcl = LCL_PREFIXES.find(p => mblId.startsWith(p.prefix));
      if (matchedLcl) {
        lclCounts[matchedLcl.prefix] = (lclCounts[matchedLcl.prefix] || 0) + 1;
      } else if (INTERNAL_PREFIXES.some(p => mblId.startsWith(p)) || /^SS[0-9A-Z]/.test(mblId)) {
        // NOVO prefixo LCL
        const prefix = mblId.substring(0, 4);
        if (!newLclPrefixes[prefix]) newLclPrefixes[prefix] = { count: 0, examples: [] };
        newLclPrefixes[prefix].count++;
        if (newLclPrefixes[prefix].examples.length < 2) {
          newLclPrefixes[prefix].examples.push(mblId);
        }
      } else {
        // Desconhecido
        const prefix = mblId.substring(0, 4);
        if (!unknownPrefixes[prefix]) unknownPrefixes[prefix] = { count: 0, examples: [] };
        unknownPrefixes[prefix].count++;
        if (unknownPrefixes[prefix].examples.length < 2) {
          unknownPrefixes[prefix].examples.push(mblId);
        }
      }
    }
  }
  
  // MERGE: Armadores estáticos + contagem dinâmica
  const carriers = getTrackableCarriers().map(carrier => ({
    ...carrier,
    count: dynamicCounts[carrier.code]?.count || 0,
    prefixes: Array.from(dynamicCounts[carrier.code]?.prefixes || [])
  })).sort((a, b) => b.count - a.count);
  
  // MERGE: LCL estáticos + contagem + novos
  const lcl = [
    ...LCL_PREFIXES.map(item => ({
      prefix: item.prefix,
      label: item.label,
      count: lclCounts[item.prefix] || 0,
      isNew: false
    })),
    ...Object.entries(newLclPrefixes).map(([prefix, data]) => ({
      prefix,
      label: `Novo (${data.examples[0] || prefix})`,
      count: data.count,
      isNew: true
    }))
  ].sort((a, b) => b.count - a.count);
  
  // MERGE: Rotas estáticas + contagem + novos
  const routes = [
    ...ROUTE_FORMAT_PREFIXES.map(item => ({
      prefix: item.prefix,
      label: item.label,
      count: routeCounts[item.prefix] || 0,
      isNew: false
    })),
    ...Object.entries(newRoutePrefixes).map(([prefix, data]) => ({
      prefix,
      label: `Rota descoberta`,
      count: data.count,
      isNew: true
    }))
  ].sort((a, b) => b.count - a.count);
  
  // Desconhecidos
  const unknown = Object.entries(unknownPrefixes)
    .map(([prefix, data]) => ({ prefix, ...data }))
    .sort((a, b) => b.count - a.count);
  
  return {
    carriers,
    lcl,
    routes,
    numeric: { count: numericMbls.length, examples: numericMbls },
    unknown,
    totalMbls: mblList.length
  };
}, [mblList]);
```

#### 2. Atualizar Modal para exibir contagens e badges "NOVO"

**Armadores (com contagem)**:
```tsx
<TableRow key={carrier.code}>
  <TableCell className="font-mono text-sm text-gray-300">
    {displayPrefix}
  </TableCell>
  <TableCell className="text-gray-300">
    {normalizeArmadorName(carrier.name)}
  </TableCell>
  <TableCell className="text-gray-400 text-sm">
    {carrier.country}
  </TableCell>
  <TableCell className="text-right">
    {carrierStats.carriers.find(c => c.code === carrier.code)?.count > 0 ? (
      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs">
        {carrierStats.carriers.find(c => c.code === carrier.code)?.count}
      </span>
    ) : (
      <span className="text-gray-600 text-xs">-</span>
    )}
  </TableCell>
</TableRow>
```

**LCL (com badge NOVO)**:
```tsx
{carrierStats.lcl.map(item => (
  <TableRow key={item.prefix}>
    <TableCell>
      <span className="font-mono text-sm px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
        {item.prefix}
      </span>
      {item.isNew && (
        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
          NOVO
        </span>
      )}
    </TableCell>
    <TableCell className="text-gray-400 text-sm">
      {item.label}
    </TableCell>
    <TableCell className="text-right">
      {item.count > 0 ? (
        <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs">
          {item.count}
        </span>
      ) : (
        <span className="text-gray-600 text-xs">-</span>
      )}
    </TableCell>
  </TableRow>
))}
```

**Footer atualizado**:
```tsx
<span className="text-sm text-gray-400">
  {carrierStats.carriers.length} armadores | 
  {carrierStats.lcl.length} LCL ({carrierStats.lcl.filter(l => l.isNew).length} novos) | 
  {carrierStats.routes.length} rotas | 
  {carrierStats.numeric.count} numéricos
</span>
```

---

## Comportamento Final

| Categoria | Comportamento |
|-----------|---------------|
| **Armadores** | Todos os 13 sempre aparecem, com contagem real de MBLs |
| **LCL/Consolidadores** | 16 existentes + novos descobertos com badge "NOVO" |
| **Rotas** | 4 existentes + novos padrões XXX/YYY descobertos |
| **Numéricos** | Exemplos reais dos MBLs sincronizados |
| **Desconhecidos** | Nova seção mostrando prefixos não mapeados |

---

## Visualização

```text
┌─────────────────────────────────────────────────────────────┐
│ Armadores Mapeados                    (baseado em 847 MBLs) │
├─────────────────────────────────────────────────────────────┤
│ ARMADORES COM API                                           │
│ ┌────────┬─────────────────────┬──────────┬───────┐        │
│ │ HLCU   │ Hapag-Lloyd         │ Germany  │  127  │        │
│ │ MSCU   │ MSC                 │ Switz.   │   89  │        │
│ │ MAEU   │ Maersk              │ Denmark  │   45  │        │
│ │ COSU   │ COSCO               │ China    │    -  │ ← sem  │
│ └────────┴─────────────────────┴──────────┴───────┘        │
├─────────────────────────────────────────────────────────────┤
│ LCL / CONSOLIDADORES                                        │
│ ┌─────────────────────────────────────────────────┐        │
│ │ SSZ     DACHSER Santos               34        │        │
│ │ GLNL    DACHSER Netherlands          12        │        │
│ │ BRAZ    Novo (BRAZ1234567)     NOVO   8        │ ← novo │
│ │ SS01    DACHSER Santos (SS01)         -        │        │
│ └─────────────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────────────┤
│ ROTAS                                                       │
│ │ SSZ/HAM    Santos → Hamburgo          23       │        │
│ │ PNG/ITJ    Paranaguá → Itajaí   NOVO   5       │ ← novo │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/ContainerTracking.tsx` | Adicionar `useMemo` para merge estático+dinâmico e atualizar renderização do modal |

---

## Considerações

1. **Preservação**: Todos os 13 armadores e 16+ prefixos LCL existentes sempre aparecem
2. **Descoberta**: Novos prefixos são marcados com badge verde "NOVO"
3. **Contagem**: Mostra quantidade real de MBLs por categoria
4. **Ordenação**: Itens com mais MBLs aparecem primeiro
5. **Performance**: `useMemo` garante recálculo apenas quando `mblList` muda

