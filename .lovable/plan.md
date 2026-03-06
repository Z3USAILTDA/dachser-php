

# Fix: DIS sem discrepância de peso/volume não deve ser Crítico nem vermelho

## Problema
O flag `has_dis_event` (que indica qualquer evento DIS na timeline) está sendo tratado como crítico em 5 locais. Apenas `pieces_discrepancy` (discrepância de peças/peso/volume) deve ser crítico e vermelho. DIS genérico deve ser âmbar e ficar no card "Em Alerta".

## Correções em `src/pages/Index.tsx` — 5 locais

### 1. Filtro card "criticos" (linha 2036)
Remover `|| awb.has_dis_event === true`

### 2. Card count "Críticos" (linha 2368)
Remover `|| awb.has_dis_event === true`

### 3. Row highlight vermelho piscante (linha 2624)
Remover `|| awb.has_dis_event === true`

### 4. Badge Situação — DIS âmbar (linha 2901)
Mudar condição de `!awb.pieces_discrepancy && !awb.has_dis_event` para apenas `!awb.pieces_discrepancy`:
```typescript
if (statusCode === "DIS" && !awb.pieces_discrepancy) {
```

### 5. Check isCritical na coluna Situação (linha 2918)
Remover `awb.has_dis_event === true`

**Resultado:** DIS genérico → âmbar, card "Em Alerta". DIS com `pieces_discrepancy` → vermelho, card "Críticos".

