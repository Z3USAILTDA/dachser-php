

## Plano: Adaptar Faturamento ao design do Olimpo Cobrança

### Problema
O dashboard de Faturamento usa tema claro (fundo cinza, cards brancos, inline styles) enquanto o Cobrança usa o design system dark padrão do Olimpo com componentes `Card`/`CardContent`/`CardHeader`/`CardTitle` e classes Tailwind.

### Alteração — Arquivo único

**`src/pages/olimpo/OlimpoFaturamento.tsx`** — Ajustes de estilo (sem mudar visualizações)

1. **Remover o container claro**: Eliminar o wrapper `style={{ background: "#f0f2f5" }}` e o header azul `#1a2744`. Usar o layout natural do `PageLayout` (fundo escuro)

2. **KPI Cards**: Substituir `KpiExecCard` (inline styles, fundo branco) pelo padrão do Cobrança:
   - Usar `Card className="bg-card border-border"` + `CardContent` com ícone + label + valor
   - Ícones: `DollarSign` (faturamento), `FileText` (processos), `TrendingUp` (variação), `Users` (maior cliente)
   - Mesma estrutura do `KpiCard` do Cobrança

3. **Chart Cards**: Substituir `ChartCard` (inline styles, fundo branco) por:
   - `Card className="bg-card border-border"` + `CardHeader` + `CardTitle className="text-sm text-foreground"` + `CardContent`
   - Remover `SlicerBadge` decorativos

4. **Gráficos Recharts**: Ajustar cores internas:
   - `CartesianGrid stroke="rgba(255,255,255,0.08)"` (era `#edf2f7`)
   - `XAxis/YAxis tick fill="#aaa"` (era `#718096`)
   - `LabelList fill` para cores claras (era `#2d3748`)
   - Tooltip com `backgroundColor: "rgba(0,0,0,0.85)"` e `border: "1px solid rgba(255,255,255,0.15)"` (era branco)

5. **Header**: Usar `rightContent` do PageLayout para o botão Atualizar, como no Cobrança. Subtítulo de período como texto `text-muted-foreground` abaixo dos KPIs

### Sem alteração
- Todas as 9 visualizações permanecem idênticas (tipos de gráfico, dados, lógica)
- Lógica de fetch e processamento inalterada
- Nenhum outro arquivo modificado

### Resumo
| Arquivo | Ação |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Ajuste de estilo: dark theme + componentes Card |

