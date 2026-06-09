# Fix: colunas ETA/ETD e Serviço não exibem valores

## Causa
A query SQL em `fetch-tracking-aereo` (edge function) e `server/index.js` (servidor local) seleciona apenas alguns campos de `t_dados_aereo`. `etd` e `tipo_servico` **não estão sendo lidos do banco**, então o payload entregue ao front não contém esses campos. O `mapItems` em `TrackingAereo.tsx` também não os copia.

## Alterações

### 1. `supabase/functions/fetch-tracking-aereo/index.ts`
- Adicionar `tda.tipo_servico AS TIPO_SERVICO` e `tda.etd AS ETD` no SELECT do CTE `base` (linhas ~352-358).
- Propagar nos CTEs derivados (eles usam `b.*` / `select *`, então a propagação é automática).
- No objeto `normalized` (linhas ~1673-1701), adicionar:
  - `tipo_servico: row.TIPO_SERVICO || ""`
  - `etd: row.ETD || null`

### 2. `server/index.js`
- Mesma alteração no SELECT (linha 119) e no objeto retornado (linha ~580): incluir `tipo_servico` e `etd`.

### 3. `src/pages/air/TrackingAereo.tsx` — `mapItems`
- No retorno do `.map` (linhas 539-573), adicionar:
  - `etd: item.etd || null`
  - `tipo_servico: item.tipo_servico || ""`

### 4. Invalidação de cache
- Limpar `air_tracking_cache` (chaves `payload`, `discrepancy`, `route`) via migration, igual ao que foi feito anteriormente, para forçar refresh com o novo formato.

## Observações
- Surgical: nenhum refactor; apenas 2 colunas adicionadas ao SELECT e mapeadas até o front.
- Sem alterações no schema do MariaDB (colunas já existem em `t_dados_aereo`).
- Componente sem mudanças adicionais — JSX já lê `awb.etd` e `awb.tipo_servico`.
