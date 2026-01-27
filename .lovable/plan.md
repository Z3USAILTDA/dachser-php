
# Plano: Filtrar Armadores por Existência no Banco + Suporte API

## Objetivo
Modificar o filtro de armadores para mostrar apenas os que:
1. Existem no banco de dados atual (mblList)
2. Têm suporte à API JSONCargo (`apiSupported: true`)

## Situação Atual

```typescript
// Lista FIXA de todos os armadores (17 no total)
const allArmadores = useMemo(() => {
  return getAllShippingLines()
    .map(info => info.name)
    .sort((a, b) => a.localeCompare(b));
}, []);
```

Isso retorna TODOS os armadores, incluindo os sem suporte API (Seaboard, Crowley, Arkas, etc.) e os que não existem no banco.

## Armadores com Suporte API (apiSupported: true)

| Armador | Código |
|---------|--------|
| Hapag-Lloyd | HAPAG_LLOYD |
| MSC | MSC |
| Maersk | MAERSK |
| Hamburg Süd | HAMBURG_SUD |
| CMA CGM | CMA_CGM |
| ONE | ONE |
| Evergreen | EVERGREEN |
| COSCO | COSCO |
| Yang Ming | YANG_MING |
| HMM | HMM |
| ZIM | ZIM |
| PIL | PIL |
| Wan Hai | WAN_HAI |

## Armadores SEM Suporte API (serão excluídos)

| Armador | Código |
|---------|--------|
| Seaboard Marine | SEABOARD |
| Crowley Maritime | CROWLEY |
| Arkas Line | ARKAS |
| Turkon Line | TURKON |
| Grimaldi Lines | GRIMALDI |
| SM Line | SM_LINE |
| Transroll | TRANSROLL |

## Implementação

**Arquivo:** `src/pages/ContainerTracking.tsx`

**Alteração:** Substituir `allArmadores` por lógica dinâmica que:
1. Extrai os códigos de armador de cada MBL no banco usando `getShippingLineCodeFromMbl`
2. Filtra apenas os que têm `apiSupported: true` no mapeamento
3. Converte para nomes legíveis e remove duplicados

```typescript
// ANTES
const allArmadores = useMemo(() => {
  return getAllShippingLines()
    .map(info => info.name)
    .sort((a, b) => a.localeCompare(b));
}, []);

// DEPOIS
const filteredArmadores = useMemo(() => {
  const armadoresSet = new Set<string>();
  mblList.forEach(m => {
    const code = getShippingLineCodeFromMbl(m.mbl_id, m.shipping_line);
    // Só inclui se tiver suporte API
    if (code !== 'UNKNOWN' && SHIPPING_LINE_INFO[code].apiSupported) {
      armadoresSet.add(SHIPPING_LINE_INFO[code].name);
    }
  });
  return Array.from(armadoresSet).sort((a, b) => a.localeCompare(b));
}, [mblList]);
```

## Resultado Esperado

O dropdown de filtro "Armador" mostrará apenas os armadores que:
- Existem efetivamente no banco de dados atual
- Podem ser rastreados via API JSONCargo

Por exemplo, se o banco tiver MBLs de Hapag-Lloyd, MSC, Maersk e COSCO, o filtro mostrará apenas esses 4 armadores.
