

## Regra de Discrepancia de Pecas/Volume no Rastreio Aereo

### Contexto

Na timeline de eventos do `t_aereo_ws`, cada evento pode conter informacao de pecas/volume em dois formatos:
- `"Pieces: 2, Weight: 64.00"` (formato longo)
- `"2 / 64.00KGS"` (formato curto)

O primeiro evento cronologico (ultimo no array, pois vem em ordem DESC) estabelece a quantidade de referencia. Se qualquer evento posterior mostrar quantidade diferente, o AWB deve ser marcado como **critico** e permanecer critico ate que o evento de entrega (DLV/Delivered) confirme a quantidade original.

### Logica da Regra

```text
Timeline (ordem cronologica):
  1. Booking Confirmed: 20 pecas    <- REFERENCIA (baseline)
  2. Freight on Hand:   20 pecas    <- OK
  3. Manifested:        18 pecas    <- CRITICO (18 != 20)
  4. Departed:          18 pecas    <- CRITICO (mantido)
  5. Arrived:           18 pecas    <- CRITICO (mantido)
  6. Delivered:         20 pecas    <- LIBERADO (entregou o original)
  6b. Delivered:        18 pecas    <- CRITICO (nao entregou o original)
```

### Implementacao

#### 1. `supabase/functions/fetch-status-aereo/index.ts` - Adicionar coluna `timeline_json` na query

Incluir o campo `timeline_json` na query do Passo 1 (busca de snapshots de `t_aereo_ws`) para que o backend possa analisar a discrepancia de pecas sem precisar de uma segunda query.

#### 2. `supabase/functions/fetch-status-aereo/index.ts` - Logica de deteccao de discrepancia

Apos buscar os snapshots, para cada AWB:
- Parsear o `timeline_json`
- Extrair quantidade de pecas de cada evento usando regex:
  - `/Pieces:\s*(\d+)/i` para formato longo
  - `/(\d+)\s*\/\s*[\d.]+\s*KGS/i` para formato curto
- Ordenar eventos por data (mais antigo primeiro)
- O primeiro evento com pecas define o `baseline_pieces`
- Verificar se algum evento posterior tem quantidade diferente
- Verificar se o ultimo evento e entrega (DLV) e se a quantidade coincide com o baseline
- Retornar dois novos campos: `pieces_discrepancy: boolean` e `baseline_pieces: number | null`

#### 3. `src/pages/Index.tsx` - Interface AWBData

Adicionar campos:
- `pieces_discrepancy?: boolean` - indica discrepancia de pecas detectada
- `baseline_pieces?: number | null` - quantidade de pecas de referencia

#### 4. `src/pages/Index.tsx` - Mapeamento no fetchStatusAereoData

Mapear os novos campos `pieces_discrepancy` e `baseline_pieces` vindos do backend.

#### 5. `src/pages/Index.tsx` - Filtro de criticos

Atualizar a logica de filtragem de AWBs criticos (em 3 locais: filtro do card, contagem de criticos no dashboard, e badge de status) para incluir `pieces_discrepancy === true` como criterio de critico:

```text
const isCritical = status === "NIL" || status === "NIF" || status === "OFLD" 
  || CRITICAL_AWBS.includes(awb.awb) 
  || awb.pieces_discrepancy === true;
```

#### 6. `src/pages/Index.tsx` - Destaque visual

AWBs com `pieces_discrepancy === true` receberao o mesmo estilo dos AWBs criticos: fundo vermelho pulsante (`bg-red-500/15 animate-pulse`) e badge "DISCREPANCIA PECAS".

### Arquivos Modificados

1. **supabase/functions/fetch-status-aereo/index.ts** - Incluir `timeline_json` na query e adicionar logica de deteccao de discrepancia de pecas
2. **src/pages/Index.tsx** - Interface AWBData, mapeamento de campos, filtros de criticos e destaque visual

