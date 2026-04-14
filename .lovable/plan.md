

## Plano: Melhorar visual do Faturamento inspirado no design de referência

A imagem de referência mostra um dashboard moderno com: cards com sparklines/mini-gráficos, ícones mais elegantes, subtítulos nos KPIs, bordas mais suaves, e uma hierarquia visual mais clara. Vou aplicar essas melhorias mantendo a estrutura existente e o padrão dark do Olimpo.

### Alterações — Arquivo único

**`src/pages/olimpo/OlimpoFaturamento.tsx`**

1. **KPI Cards mais ricos** (inspirado na imagem):
   - Adicionar indicador de variação (seta + percentual) no card de Faturamento Total
   - Mostrar o nome do maior cliente como subtítulo abaixo do valor
   - Adicionar mini-indicador de tendência (ícone TrendingUp/Down) nos cards relevantes
   - Usar `gap-4` nos KPIs (como referência) com cards mais compactos e informação densa

2. **ChartCard com header melhorado**:
   - Adicionar subtítulo e título na mesma linha (subtítulo à direita, menor, como badge)
   - Bordas mais suaves com `border-border/50` em vez de `border-border`
   - Adicionar `hover:border-border` transition para interatividade sutil

3. **Gráfico principal (linha de tendência)**:
   - Converter o primeiro gráfico "Quantidade de Files — Total Faturado" de BarChart para um **AreaChart** com gradiente, inspirado no gráfico principal da referência (curva suave com área preenchida)
   - Manter tooltip com dados completos
   - Usar gradiente de preenchimento da cor primária (#4a6fa5) com opacidade

4. **Cores e polish**:
   - Usar cores de barra com gradiente sutil (via `linearGradient` no SVG defs)
   - Melhorar o `gridStroke` para `rgba(255,255,255,0.05)` (mais sutil)
   - Cursor pointer nos tooltips com `cursor="pointer"` no `<Bar>`

5. **Layout Row 3 (3 cards)**:
   - Ajustar o donut chart (Região) para ter legenda embaixo com badges coloridos em vez de labels inline no gráfico

6. **Espaçamento geral**:
   - Adicionar `rounded-xl` nos Cards (bordas mais arredondadas, como na referência)
   - Manter `space-y-6` entre seções

### Sem alteração
- Lógica de fetch/processamento de dados inalterada
- 9 visualizações mantidas (apenas 1 muda de Bar para Area)
- Tooltip styles, formatadores e proxy inalterados
- Nenhum outro arquivo modificado

### Resumo
| Arquivo | Ação |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Melhorar KPIs, converter gráfico principal para AreaChart, polish visual |

