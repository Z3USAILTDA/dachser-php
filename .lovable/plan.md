

## Plano: Aplicar estilo visual do Amazon Trans (Gestão de Frota / Rotas) ao Faturamento

O objetivo é alinhar o dashboard de Faturamento com o design system Z3US usado nas telas "Gestão de Frota" e "Rotas mais utilizadas" do projeto Amazon Trans. As mudanças são puramente visuais — nenhuma lógica de dados será alterada.

### Mudanças principais no `src/pages/olimpo/OlimpoFaturamento.tsx`

1. **KPI Cards** — Substituir o `SparklineKpiCard` atual pelo estilo `KPICardEnhanced` do Amazon Trans:
   - Background com `linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.98))`
   - Barra colorida no topo (`h-1` com gradiente da cor do KPI)
   - Ícone dentro de box colorido com borda sutil
   - Manter sparklines existentes integrados ao novo layout

2. **Chart Cards** — Substituir `ChartCard`/`GlassCard` pelo estilo `ZeusChartCard`:
   - Background: `rgba(8, 12, 22, 0.9)` com borda `rgba(255,255,255,0.06)`
   - Título uppercase, `text-xs font-semibold tracking-wide`
   - Substituir badges por botão "Ver detalhes" sutil (como no Amazon Trans)

3. **Cores** — Migrar para paleta ZEUS:
   - Primário: `#F2A007` (amber) em vez de `#4a6fa5`
   - Sucesso: `#22C55E`
   - Manter cores de modal mas aplicar efeito glow (`drop-shadow`) nas barras

4. **Tooltip** — Atualizar para estilo Z3US:
   - `backgroundColor: "hsl(222 41% 6%)"`, `border: "1px solid hsl(220 30% 22%)"`, `borderRadius: 8px`

5. **Grid e Eixos** — Alinhamento com Amazon Trans:
   - `vertical={false}` no CartesianGrid
   - `tickLine={false}` nos eixos
   - Grid stroke mais sutil: `rgba(255,255,255,0.06)`

6. **Labels com Glow** — Adicionar `filter: drop-shadow(0 0 6px color)` nos LabelList e valores de destaque

### Arquivo alterado
| Arquivo | Ação |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Refatorar componentes visuais (KPI, ChartCard, cores, tooltip, grid) |

### Sem alteração
- Lógica de fetch, processamento de dados, useMemo
- Estrutura de grid (3 colunas mantida)
- Nenhum outro arquivo modificado

