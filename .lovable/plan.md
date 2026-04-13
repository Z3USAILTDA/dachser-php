

## Plano: Priorizar Masters na busca do Robô + Badge diferenciado

### Problema
1. O badge na etapa robô não mudou — a alteração anterior do `getStatusBadge` com "MASTER" já está no código (linha 365-378), mas o `find_voucher_by_spo` retorna o voucher individual/filho PRIMEIRO, e o frontend pega `vouchers[0]` (linha 151). Então o master nunca aparece como resultado principal.
2. O usuário quer que masters sejam priorizados na busca.

### Alterações

**1. Backend — `supabase/functions/mariadb-proxy/index.ts` (~linha 9980)**

Antes de retornar o resultado, reordenar o array `vouchers` para que masters (`is_master = true` ou `matched_via_child = true`) venham primeiro:

```typescript
// Priorizar masters: mover para o início do array
if (vouchers && vouchers.length > 1) {
  vouchers.sort((a: any, b: any) => {
    if (a.is_master && !b.is_master) return -1;
    if (!a.is_master && b.is_master) return 1;
    if (a.matched_via_child && !b.matched_via_child) return -1;
    if (!a.matched_via_child && b.matched_via_child) return 1;
    return 0;
  });
}
```

Inserir entre a linha 9980 e 9982 (antes do `result = { success: true, vouchers }`).

**2. Frontend — `src/pages/esteira/ComprovanteRobot.tsx` (linha 150-152)**

Alterar a lógica de seleção do voucher para preferir master quando disponível:

```typescript
if (spoResult?.vouchers?.length > 0) {
  // Prefer master voucher if available
  foundVoucher = spoResult.vouchers.find((v: any) => v.is_master) || spoResult.vouchers[0];
}
```

Mesma lógica para `find_voucher_by_nd` (linha 162).

### Resumo

| Arquivo | Alteração |
|---------|-----------|
| `mariadb-proxy/index.ts` | Reordenar resultados priorizando masters |
| `ComprovanteRobot.tsx` | Preferir master no `vouchers[0]` selection |

Duas alterações cirúrgicas, ~10 linhas no total.

