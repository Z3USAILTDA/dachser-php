# Renomear `vesselName` → `shipperName`

## Contexto
No banco, o campo que contém o nome do navio chama-se `shipper_name`. Vamos alinhar a API do componente e da edge function a essa nomenclatura, mantendo compat retroativa.

## Mudanças

### 1. `src/components/tracking/VesselFinderMap.tsx`
- Renomear prop `vesselName` → `shipperName` na interface e em todas as referências internas (overlays, título, cache de sessão, chamada à edge function).
- Enviar `{ shipperName }` no body de `resolve-vessel-imo`.

### 2. `supabase/functions/resolve-vessel-imo/index.ts`
- Aceitar `shipperName` como entrada principal.
- Manter `vesselName` como alias retrocompatível (`const name = shipperName ?? vesselName`).
- Normalização, cache (`t_vessel_registry`) e scraping permanecem idênticos.

### 3. Consumidores
- `ContainerTracking.tsx` apenas importa o componente — sem renderização ativa. Nenhuma mudança necessária; futuros usos passarão `shipperName={row.shipper_name}`.

## Fora de escopo
- Renomear tabela/colunas de `t_vessel_registry`.
- Alterar lógica de scraping ou cache.
