

## Correção: "A Vencer" não mostra vouchers marcados como Pronto

### Problema
A query de stats (linha 8278) já conta todos os vouchers com `vencimento >= CURDATE()` corretamente, mas o filtro da view `a_vencer` (linha 8193) ainda exclui vouchers com `is_pronto_para_robo = 1`. Isso faz com que o card mostre zero quando todos os vouchers "a vencer" estão marcados como Pronto.

### Correção
**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` — linha 8193

Remover a linha:
```typescript
conditions.push("(v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL)");
```

Manter apenas:
```typescript
} else if (filterVencimento === 'a_vencer') {
  conditions.push("v.vencimento >= CURDATE()");
}
```

Isso garante que vouchers com vencimento futuro apareçam no card "A Vencer" independentemente do status `is_pronto_para_robo`.

