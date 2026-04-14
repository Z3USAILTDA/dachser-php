

## Plano: Apenas containers entregues não devem ser re-rastreados

### Situação atual

Existem **duas camadas** de filtragem que impedem containers de serem re-rastreados:

1. **`refresh_sea_tracking`** (modo normal): Usa `stale_hours=4` para pendentes e `refresh_valid_hours=48` para válidos, pulando containers atualizados recentemente. Também exclui status finais (DELIVERED, DLV, GOD, etc.).

2. **`sea_seed_smart`** (JsonCargo): Usa lógica de cache baseada em ETA — pula containers entregues, ETA > 7 dias, e ETA 1-7 dias se já atualizou hoje.

### O que muda

A regra passa a ser: **todos os containers ativos devem ser re-rastreados, exceto os entregues (status final)**. Sem filtros de staleness/ETA.

### Alterações

#### 1. `supabase/functions/olimpo-proxy/index.ts` — `refresh_sea_tracking`

- Alterar defaults de `stale_hours` de `4` para `0` e `refresh_valid_hours` de `48` para `0` (linha 2830-2831)
- Isso remove a filtragem por "tempo desde último check", mantendo apenas a exclusão de status finais (DELIVERED, DLV, GOD, etc.) que já existe na linha 2862

#### 2. `supabase/functions/olimpo-proxy/index.ts` — `sea_seed_smart`

- Remover as regras de cache por ETA (linhas 747-753):
  - Remover: "Entregue há mais de 1 dia → cache permanente"
  - Remover: "ETA > 7 dias → usar cache"
  - Remover: "ETA 1-7 dias e já atualizou hoje → usar cache"
- Manter apenas: se `isDelivered` → `useCache = true` (entregues continuam pulados)
- A lógica simplificada fica:
```typescript
if (isDelivered) {
  useCache = true; // Entregue = não re-rastrear
}
```

#### 3. `src/pages/ContainerTracking.tsx` — Auto-sync do frontend

- Atualizar as 2 chamadas que usam `stale_hours=4&refresh_valid_hours=48` (linhas 1076 e 1346) para `stale_hours=0&refresh_valid_hours=0`
- A chamada da linha 1485 já usa `0` — sem alteração necessária

### Arquivos alterados
- `supabase/functions/olimpo-proxy/index.ts` (2 seções)
- `src/pages/ContainerTracking.tsx` (2 URLs)

