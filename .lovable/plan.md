

## Plano: Forçar eixo Y mínimo em 0 com `allowDataOverflow`

### Problema
Mesmo com `domain={[0, 'auto']}`, o Recharts expande o domínio quando existem valores negativos nos dados. Os gráficos "Valor Total Mensal" e "Valor Faturado por Modal" ainda mostram -R$ 6M e -R$ 3M.

### Causa
`domain={[0, 'auto']}` é apenas uma "sugestão" — Recharts a ignora quando os dados ultrapassam o intervalo. Para forçar, é necessário `allowDataOverflow={true}`.

### Alteração

**Arquivo: `src/pages/olimpo/OlimpoFaturamento.tsx`**
Adicionar `allowDataOverflow={true}` em **todos** os `<YAxis>` e `<XAxis>` numéricos que já têm `domain={[0, 'auto']}`:
- L476 — Valor Total Mensal (YAxis)
- L493 — Qtd. por Modal (YAxis)
- L506 — Valor Faturado por Modal (YAxis)
- L519 — XAxis numérico do horizontal bar
- L542 — Qtd. por Divisão (YAxis)
- L560 — Valor por Divisão (YAxis)

Também na Evolução Faturamento (L415, se existir).

**Arquivo: `src/pages/cct/tabs/AnalyticsTab.tsx`**
Adicionar `allowDataOverflow={true}` nos YAxis que já têm `domain={[0, 'auto']}`.

### O que NÃO muda
- Nenhum dado, layout ou lógica de cálculo
- Apenas o comportamento visual do eixo é forçado

