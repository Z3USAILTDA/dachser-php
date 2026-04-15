

## Plano: Redesign Premium Assimétrico do Dashboard de Faturamento

### Visão Geral
Refatoração puramente visual do `OlimpoFaturamento.tsx` e seus componentes internos (`KpiCard`, `ZeusChartCard`). Zero alteração em lógica, dados ou identidade visual. O layout passa de grade 4+3+3+3 uniforme para uma composição assimétrica com hierarquia editorial.

### Estrutura Proposta

```text
┌─────────────────────────────────────────────────────┐
│  HEADER (existente, refinado)                       │
├──────────────────────┬──────────────────────────────┤
│                      │  ┌──────┐ ┌──────┐          │
│   HERO KPI           │  │ KPI2 │ │ KPI3 │          │
│   Faturamento Total  │  └──────┘ └──────┘          │
│   (bloco grande,     │  ┌──────────────────┐       │
│    sparkline inline)  │  │   KPI4 (Cliente) │       │
│                      │  └──────────────────┘       │
├──────────────────────┴──────────────────────────────┤
│                                                     │
│  ┌──────────────────────────┐  ┌───────────────┐   │
│  │ Evolução Qtd Files       │  │ Dist Regional │   │
│  │ (col-span 2, largo)      │  │ (pie, menor)  │   │
│  └──────────────────────────┘  └───────────────┘   │
│                                                     │
│  ┌───────────────┐  ┌──────────────────────────┐   │
│  │ Top Clientes  │  │ Valor Total Mensal       │   │
│  │ (menor)       │  │ (col-span 2, largo)      │   │
│  └───────────────┘  └──────────────────────────┘   │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Qtd Modal │ │Val Modal │ │Modal Últ │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  ┌─────────────────────┐  ┌────────────────────┐   │
│  │ Qtd Divisão Modal   │  │ Valor Divisão Modal│   │
│  │ (col-span 1)        │  │ (col-span 1)       │   │
│  └─────────────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Detalhamento

**1. KPI Cards — Composição Assimétrica (Topo)**
- O KPI principal (Faturamento Total) vira um **hero card** ocupando ~50% da largura, mais alto (~140px), com valor em `text-4xl`, sparkline dos últimos 6 meses inline (usando `sparklineValor` já calculado), e ícone maior
- Os 3 KPIs restantes ficam empilhados ao lado em cards compactos (~60px altura cada), com valor em `text-lg`, layout horizontal icon+texto
- Grid: `grid-cols-[1fr_1fr]` com o hero ocupando 1 coluna e os 3 mini cards empilhados na outra
- Cards com `bg-[rgba(5,6,18,0.9)]`, `border border-[rgba(255,200,0,0.12)]`, `rounded-2xl`
- Cada mini KPI clicável → abre modal com detalhes (Dialog do shadcn)

**2. Gráficos — Assimetria Intencional**
- **Linha 1**: `grid-cols-[2fr_1fr]` — Evolução Qtd Files (largo) + Distribuição Regional (compacto)
- **Linha 2**: `grid-cols-[1fr_2fr]` — Top Clientes (compacto) + Valor Total Mensal (largo)
- **Linha 3**: `grid-cols-3` uniforme — Qtd Modal, Valor Modal, Modal Último Mês (estes são de importância equivalente)
- **Linha 4**: `grid-cols-2` — Divisão Modal Qtd + Divisão Modal Valor (2 colunas, mais respiro)

**3. ZeusChartCard — Refinamento Visual**
- Padding interno mais generoso: `p-5` em vez de `p-3`
- Título com `text-[11px]` uppercase + tracking + `text-slate-400`
- Borda sutil `border-[rgba(255,255,255,0.06)]` em vez de `border-border`
- Hover suave: `hover:border-[rgba(255,200,0,0.15)]` com `transition-all duration-300`
- Sem glow, sem sombras pesadas

**4. KPI Detail Modal**
- Usar `Dialog` do shadcn para expandir qualquer KPI ao clicar
- Conteúdo: valor completo, variação, contexto do período, mini gráfico expandido
- Animação suave via `DialogContent` padrão
- Estilo dark consistente com o dashboard

**5. Espaçamento e Respiro**
- Gap entre seções: `gap-6` (mais respiro)
- Gap interno nas grids: `gap-4`
- `space-y-6` no container principal em vez de `space-y-5`

### Arquivos Alterados
- `src/pages/olimpo/OlimpoFaturamento.tsx` — Layout, KpiCard, ZeusChartCard, adição de Dialog para detalhes

### O que NÃO muda
- Nenhuma lógica de dados, useMemo, fetch, filtros
- Nenhum dado do CSV
- Nenhuma cor principal removida
- Todos os 9 gráficos permanecem
- Todos os 4 KPIs permanecem
- ChartDetailPanel continua funcionando
- DonutSingleChart para dados únicos continua

