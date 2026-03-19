

## Plano: Corrigir ordem das conexões e highlight da rota

### Problemas identificados

**1. Ordem invertida (GRU antes de ZRH)**
Os eventos estão ordenados DESC (mais recente primeiro). A extração de segmentos de rota (linhas 1284-1302) itera os eventos nessa ordem, então encontra primeiro `GRU-VCP` (do BKD mais recente), depois `ZRH-GRU` (do DEP/ARR), depois `FRA-ZRH` (do RCF). Resultado: `routeAirportsOrdered = [GRU, VCP, ZRH, FRA]` → filtrado: `[GRU, ZRH]` — ordem errada.

**Correção:** Reverter a lista de eventos antes de iterar para extração de segmentos, ou reverter `routeAirportsOrdered` antes de mesclar. Assim os segmentos serão processados na ordem cronológica: `FRA-ZRH` → `ZRH-GRU` → `GRU-VCP`, resultando em `[FRA, ZRH, GRU, VCP]` → filtrado: `[ZRH, GRU]` ✓

**2. Origem em amarelo (highlight errado)**
O status atual do AWB é provavelmente "AWR" ou "BKD" (eventos pós-chegada em GRU). Esses códigos não estão em `POST_DESTINO` nem em `AT_CONEXAO`, então cai no `else` → `highlightOrigin = true`. Mas o cargo ESTÁ em GRU (uma conexão).

**Correção:** Expandir a lógica de highlight no frontend. Se o AWB tem conexões e o status não é POST_DESTINO, verificar se o cargo já está em trânsito (status como AWR, AWD, BKD, NFD, RCF, CCD que indicam o cargo está em algum ponto intermediário). Se `in_transit === true` ou o status indica movimentação, destacar a última conexão ao invés da origem.

### Alterações

#### 1. Backend — `supabase/functions/fetch-status-aereo/index.ts`
- **Linhas 1284-1292**: Reverter a cópia dos eventos antes de iterar: `[...events].reverse()` para processar em ordem cronológica (mais antigo primeiro)
- Isso garante que `routeAirportsOrdered` siga a ordem real da rota

#### 2. Frontend — `src/pages/Index.tsx`
- **Linhas 2746-2757**: Melhorar lógica de highlight:
  - Definir lista de statuses que indicam "cargo em trânsito/conexão": `AWR, AWD, BKD, NFD, RCF, CCD, DOC, MAN, PRE, TFD, TRM, TRA, RFC`
  - Se o status está nessa lista E existem conexões E `in_transit === true` → destacar última conexão (não a origem)
  - Manter lógica atual para POST_DESTINO e AT_CONEXAO

### Resultado esperado
- Rota: `FRA → ZRH → GRU → VCP` (ordem correta)
- Highlight: GRU em amarelo (última conexão onde o cargo está)

### Arquivos modificados
1. `supabase/functions/fetch-status-aereo/index.ts` — reverter eventos para extração cronológica
2. `src/pages/Index.tsx` — expandir lógica de highlight para statuses pós-chegada em conexão

