

# Mover DIS do card "Em Alerta" para o card "Críticos"

## Mudança

DIS (Discrepancy) deve sair do card "Em Alerta" e ir para o card "Críticos". O card "Em Alerta" fica apenas com atrasos (`data_atraso`).

## Correções em `src/pages/Index.tsx` — 3 locais

### 1. Card count "Em Alerta" (linha 2351)
```typescript
// De:
return status === "DIS" || !!awb.data_atraso;
// Para:
return !!awb.data_atraso;
```

### 2. Card count "Críticos" (linha 2368)
Adicionar `status === "DIS"`:
```typescript
return status === "NIL" || status === "NIF" || status === "OFLD" || status === "DIS" || CRITICAL_AWBS.includes(awb.awb) || awb.pieces_discrepancy === true || awb.has_dis_event === true;
```

### 3. Filtro do card "alerta" (linha 2032)
```typescript
// De:
return status === "DIS" || !!awb.data_atraso;
// Para:
return !!awb.data_atraso;
```

### 4. Filtro do card "criticos" (linha 2036)
Adicionar `status === "DIS"`:
```typescript
return status === "NIL" || status === "NIF" || status === "OFLD" || status === "DIS" || CRITICAL_AWBS.includes(awb.awb) || awb.pieces_discrepancy === true || awb.has_dis_event === true;
```

Quatro linhas alteradas, mesmo arquivo.

