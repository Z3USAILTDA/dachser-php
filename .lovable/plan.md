

# Mover DIS de volta para "Em Alerta" e tirar cor vermelha

## Mudanças em `src/pages/Index.tsx`

### 1. Filtro card "alerta" (linha 2032)
Adicionar `status === "DIS"` de volta:
```typescript
return status === "DIS" || !!awb.data_atraso;
```

### 2. Card count "Em Alerta" (linha 2351)
Mesmo:
```typescript
return status === "DIS" || !!awb.data_atraso;
```

### 3. Filtro card "criticos" (linha 2036)
Remover `status === "DIS"`:
```typescript
return status === "NIL" || status === "NIF" || status === "OFLD" || CRITICAL_AWBS.includes(awb.awb) || awb.pieces_discrepancy === true || awb.has_dis_event === true;
```

### 4. Card count "Críticos" (linha 2368)
Mesmo — remover `status === "DIS"`.

### 5. Coluna Situação — DIS não deve ser vermelho (linhas 2900-2918)
- Remover `statusCode === "DIS"` do check `isDelayed` (linha 2909) — DIS terá badge próprio
- Adicionar check para DIS puro (sem `has_dis_event` ou `pieces_discrepancy`) ANTES do `isCritical`, com badge amarelo/âmbar ao invés de vermelho:

```typescript
// DIS puro (sem discrepância de peças) — badge amarelo/âmbar
if (statusCode === "DIS" && !awb.pieces_discrepancy && !awb.has_dis_event) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
      DIS - Discrepância
    </span>
  );
}
```

E remover `statusCode === "DIS"` da linha 2909 (`isDelayed`).

Resultado: DIS aparece no card "Em Alerta" com badge âmbar (não vermelho). Casos com `has_dis_event` ou `pieces_discrepancy` continuam críticos e vermelhos.

