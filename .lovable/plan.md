

## Plano: Forçar `domain={[0, 'auto']}` em todos os gráficos

### Problema
Alguns gráficos no Olimpo Faturamento e no Analytics CCT não têm `domain={[0, 'auto']}` no `YAxis`, permitindo que o Recharts calcule automaticamente o mínimo — que pode ser negativo.

### Alteração

**Arquivo 1: `src/pages/olimpo/OlimpoFaturamento.tsx`**
Adicionar `domain={[0, 'auto']}` em todos os `<YAxis>` numéricos (não nos `type="category"`). Linhas afetadas:
- L415 — Evolução Faturamento (Quantidade)
- L476 — Evolução Mensal (Valor)
- L493 — Qtd. por Modal
- L506 — já tem ✓
- L519 — XAxis numérico (horizontal bar) — adicionar `domain={[0, 'auto']}` no XAxis
- L542 — Qtd. por Divisão
- L560 — Valor por Divisão

Também no XAxis numérico do Top Clientes (L456) — adicionar `domain={[0, 'auto']}`.

**Arquivo 2: `src/pages/cct/tabs/AnalyticsTab.tsx`**
Adicionar `domain={[0, 'auto']}` nos `<YAxis>` numéricos:
- L176 — Volume por Dia
- L311 — Por Analista

### O que NÃO muda
- Nenhum dado, layout ou lógica de cálculo
- YAxis do tipo `category` (rotas, clientes) não são alterados

