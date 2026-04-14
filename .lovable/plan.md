

## Plano: Adicionar links de rastreio para companhias aéreas 118, 086 e 098

### Problema
As companhias Korean Air (118), Singapore Airlines Cargo (086) e Air India Cargo (098) aparecem na tela de Tracking Aéreo sem o botão de link externo para o site da companhia.

### Alterações

**`src/pages/air/TrackingAereo.tsx`**

1. **`getTrackingUrl` (linha ~92-123)**: Adicionar 3 novos builders:
   - `"118"` → `https://cargo.koreanair.com/en/tracking` (Korean Air Cargo — página geral, sem deep link por AWB)
   - `"086"` → `https://www.siacargo.com/e-services/quicksearch_public/` (Singapore Airlines Cargo)
   - `"098"` → `https://cargo.airindia.com/in/en/track-shipment.html` (Air India Cargo)

2. **`airlines` (linha ~252-262)**: Adicionar as 3 companhias à lista de filtro:
   - `{ code: "086", name: "Singapore Airlines Cargo" }`
   - `{ code: "098", name: "Air India Cargo" }`
   - `{ code: "118", name: "Korean Air Cargo" }`

3. **`monitoredAirlinesData` (linha ~266-283)**: Adicionar as 3 companhias e atualizar `totalAirlines`.

**`src/pages/Index.tsx`** (mesma função `getTrackingUrl`)

4. Adicionar os mesmos 3 builders para manter consistência entre as duas telas.

**`src/components/tracking/TrackingUtils.ts`** (mapeamento legado `airlineTrackingLinks`)

5. Adicionar as 3 entradas para manter o mapeamento legado atualizado.

### Resultado
As 3 companhias terão o botão de link externo funcional, abrindo o site de rastreio da respectiva companhia aérea.

