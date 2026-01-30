

# Correção da Lógica de Seleção de Rotas no Mapa Olimpo

## Problema Identificado

A condição `isSelected` está comparando valores `null` incorretamente:

```typescript
const isSelected = selectedAssetDetails && (
  selectedAssetDetails.asset === item.asset ||      // null === null = TRUE!
  selectedAssetDetails.flight === item.flight       // null === null = TRUE!
);
```

Quando `item.asset` é `null` e `selectedAssetDetails.asset` também é `null`, a comparação retorna `true`, fazendo com que TODAS as rotas de veículos sem asset definido apareçam simultaneamente.

---

## Solução

Adicionar verificações para garantir que os valores não sejam `null` antes de compará-los:

```typescript
const isSelected = selectedAssetDetails && (
  (selectedAssetDetails.asset && item.asset && selectedAssetDetails.asset === item.asset) ||
  (selectedAssetDetails.flight && item.flight && selectedAssetDetails.flight === item.flight)
);
```

**Lógica corrigida:**
- Só considera match de `asset` se AMBOS existirem e forem iguais
- Só considera match de `flight` se AMBOS existirem e forem iguais
- Isso evita que `null === null` seja tratado como seleção válida

---

## Arquivo Modificado

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Olimpo.tsx` | Corrigir condição `isSelected` (linhas 707-711) |

---

## Código Final

**Linhas 707-711 - De:**
```typescript
// Only show route if this vehicle is selected
const isSelected = selectedAssetDetails && (
  selectedAssetDetails.asset === item.asset ||
  selectedAssetDetails.flight === item.flight
);
```

**Para:**
```typescript
// Only show route if this vehicle is selected (with proper null checks)
const isSelected = selectedAssetDetails && (
  (selectedAssetDetails.asset && item.asset && selectedAssetDetails.asset === item.asset) ||
  (selectedAssetDetails.flight && item.flight && selectedAssetDetails.flight === item.flight)
);
```

---

## Resultado Esperado

1. Ao clicar em um veículo específico, apenas a rota dele será exibida
2. Veículos sem `asset` ou `flight` definidos não terão suas rotas exibidas erroneamente
3. O filtro por tipo (aéreo/marítimo) não afetará a exibição de rotas - apenas o clique direto no veículo

