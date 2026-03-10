

## Problema Identificado

O processo `LYS-61818280 / 724-13475593` mostra "Entregue" na tabela principal e "Em área de Transferência" nos detalhes porque **as duas telas usam lógicas diferentes para determinar o status**:

- **Tabela principal (backend)**: Usa hierarquia canônica (`CCT_STATUS_ORDER`) -- o status **mais avançado** de todas as fontes vence. Se o tracking diz `DLV` (ENTREGUE, ordem 7) e a RFB diz `EM_AREA_TRANSFERENCIA` (ordem 3), a tabela mostra ENTREGUE.

- **Tela de detalhes (frontend)**: Usa o **evento mais recente cronologicamente** da timeline. Se o evento mais recente é `AREA_TRANSFERENCIA` (com timestamp posterior ao DLV do tracking), mostra `EM_AREA_TRANSFERENCIA`.

A abordagem correta para CCT (conformidade regulatória) é a **cronológica**: o evento mais recente reflete a situação real da carga. Um status `DLV` do tracking pode ser anterior a um `AREA_TRANSFERENCIA` da RFB, significando que a carga ainda não foi entregue.

## Solução

### Backend: Usar lógica cronológica no `get_cct_shipments`

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

Na etapa de enriquecimento (linhas 3609-3626), em vez de usar `CCT_STATUS_ORDER` para escolher o status "mais avançado", comparar os **timestamps** das fontes:

1. Tracking: `row.ultimo_evento_data` (scraped_at do `t_aereo_ws_firecrawl`)
2. RFB: timestamp do `partesEstoque` (situacaoAtual com data)

Se a RFB tem dados mais recentes, usar o status da RFB mesmo que seja "inferior" na hierarquia.

**Mudança concreta:**
- Ao enriquecer com RFB (`rfbInfo`), comparar timestamps em vez de ordens hierárquicas
- Guardar junto ao `cctRfbMap` o timestamp mais recente do partesEstoque
- Na hora do merge: se `rfb_timestamp > tracking_timestamp`, status da RFB prevalece (independente da ordem hierárquica)
- Manter a hierarquia apenas como tiebreaker quando timestamps são iguais ou indisponíveis

```text
ANTES:
  tracking(DLV, 08:00) + rfb(AREA_TRANSF, 10:00) → ENTREGUE (hierarquia: 7 > 3)

DEPOIS:
  tracking(DLV, 08:00) + rfb(AREA_TRANSF, 10:00) → EM_AREA_TRANSFERENCIA (cronológico: 10:00 > 08:00)
```

### Detalhes da implementação

1. **Step 2.5** (`cctRfbMap`): Já extrair e armazenar o timestamp mais recente do `partesEstoque` (ex: `dataHoraOperacao`, `dataHoraSituacao`, ou campo similar)

2. **Merge step** (linhas 3609-3626): Alterar a lógica de comparação:
   - Se RFB tem timestamp e tracking tem timestamp → usar o mais recente
   - Se apenas uma fonte tem timestamp → usar essa
   - Se nenhuma tem timestamp → usar hierarquia como fallback

3. **Manter consistência**: A tela de detalhes (`ProcessoTimeline.tsx`) já usa lógica cronológica, então ambas as telas passarão a concordar.

