

# Plano: Mesclar timelines Firecrawl + API e exibir peças/peso com alerta de discrepância

## Problema
Para o AWB 724-86856405, o status é `UNK` no Firecrawl, então o fallback **substitui** os 12 eventos detalhados do Firecrawl por apenas 5 eventos da API. Perdemos a timeline completa e os dados de peças/peso nunca são exibidos.

## Solução

### 1. Backend — `supabase/functions/mariadb-proxy/index.ts` (bloco `get_awb_tracking_events`)

**Alterar o fallback de "substituição" para "mesclagem"** (linhas ~6804-6833):

- Quando `needsFallback` é `true` e já temos `timelineData` do Firecrawl (length > 0), buscar a API **sem substituir** — guardar os eventos API separadamente
- **Mesclar**: para cada evento da API, tentar encontrar correspondência no Firecrawl (mesmo código de status + mesmo aeroporto + timestamp dentro de 2h). Se encontrar, enriquecer o evento Firecrawl com `pecas` e `peso`. Se não encontrar, adicionar o evento API como novo
- Se Firecrawl estiver vazio, usar API como fonte única (comportamento atual)
- Marcar `timelineSource = 'merged'` quando ambas as fontes forem usadas

**Adicionar campos `pecas` e `peso` ao output dos eventos** (linhas ~6916-6962):
- Eventos API: extrair `quantidadeCarga` → `pecas`, `pesoCarga` → `peso`
- Eventos Firecrawl: iniciar com `pecas: null, peso: null`, podendo ser preenchidos pela mesclagem

**Detectar discrepância de peças** (após merge, antes do return):
- Coletar todos os valores de `pecas` não-nulos
- Se min ≠ max, adicionar ao resultado: `discrepancy: { field: 'pecas', values: [2, 6], min: 2, max: 6 }`

### 2. Frontend — `src/components/air/AwbTimelineModal.tsx`

**Estender interface `TimelineEvent`**:
```typescript
pecas?: number | null;
peso?: string | null;
```

**Estender interface `TimelineResponse`**:
```typescript
discrepancy?: { field: string; values: number[]; min: number; max: number };
```

**Exibir peças/peso por evento**: Abaixo da descrição, mostrar badge: `📦 6 pcs · 49.6 K` (quando disponível)

**Banner de discrepância**: Quando `discrepancy` estiver presente, exibir alerta no topo da timeline:
```
⚠ Discrepância de peças detectada: valores encontrados 2 e 6
```
Destacar em vermelho/âmbar os eventos cujo `pecas` diverge do máximo.

## Arquivos alterados
1. `supabase/functions/mariadb-proxy/index.ts` — Mesclar fontes, adicionar pecas/peso, detectar discrepância
2. `src/components/air/AwbTimelineModal.tsx` — Exibir pecas/peso e banner de discrepância

