

## Plano: Redesign do Dashboard de Faturamento — Estilo Corporativo/Excel

### Visão Geral

Reescrever completamente o `OlimpoFaturamento.tsx` para adotar visual corporativo claro (fundo cinza claro, cards brancos, cabeçalho azul escuro), saindo do tema dark/gold atual. O componente continuará dentro do `PageLayout` existente, mas todo o conteúdo interno terá estilo próprio que sobrepõe o fundo escuro com um container claro.

### Alterações — Arquivo único

**`src/pages/olimpo/OlimpoFaturamento.tsx`** — Reescrita completa

#### Estrutura visual

1. **Container principal**: fundo `#f0f2f5` (cinza claro) com `rounded-2xl` para criar um "painel" claro sobre o background existente do PageLayout

2. **Cabeçalho executivo**: faixa azul escura (`#1a2744`) com título "DASHBOARD GERENCIAL DE FATURAMENTO — {MÊS ATUAL}" e subtítulo "Período de análise: {primeiro mês} – {último mês} | Base: TOTVS RM" — dados dinâmicos baseados nos registros

3. **4 KPI cards** em linha horizontal:
   - FATURAMENTO TOTAL (header azul `#2c5282`) — valor em R$ + subtítulo mês
   - PROCESSOS FATURADOS (header azul `#2b6cb0`) — contagem + subtítulo mês
   - VAR. vs {mês anterior} (header verde `#276749`) — percentual + "Mês a Mês"
   - MAIOR CLIENTE (header laranja/dourado `#c27803`) — valor R$ + nome do cliente
   - Estilo: borda fina cinza, header colorido compacto, valor centralizado grande, subtítulo menor

4. **Gráficos 1-4** (linhas de 2 colunas): cards brancos com borda cinza sutil
   - Cada card com rótulo analítico cinza no topo (ex: "Contagem de PROCESSO"), título centralizado, gráfico, e "filtro" decorativo no rodapé
   - Gráfico 1: Quantidade de Files - Total Faturado (barras azuis `#4a6fa5`, valores acima)
   - Gráfico 2: Quantidade Total Faturada por Modal (barras agrupadas, NÃO empilhadas — cada modal lado a lado)
   - Gráfico 3: Valor Total Faturado no RM (barras azuis, valores monetários acima)
   - Gráfico 4: Valor Total Faturado no RM por Modal (barras agrupadas por modal)

5. **Gráficos 5-9** (área inferior):
   - Gráfico 5: Donut de Região (Sudeste azul escuro, Sul cinza) — valores dentro das fatias
   - Gráfico 6: Qtd por Modal (barras verticais por modal, dados do mês mais recente)
   - Gráfico 7: Valor por Modal (barras verticais, valores monetários, mês recente)
   - Gráfico 8: Qtd por Divisão Modal (SI/SE/TCK/ASO vs AI/AE)
   - Gráfico 9: Valor por Divisão Modal

#### Paleta corporativa
- Fundo geral: `#f0f2f5`
- Cards: `#ffffff` com `border: 1px solid #e2e8f0`
- Header principal: `#1a2744`
- Gráficos: azuis (`#4a6fa5`, `#2c5282`), laranja (`#e8913a`), verde (`#48a868`), cinza (`#8b9dc3`)
- Modais: AI=`#4a6fa5`, SI=`#e8913a`, TCK=`#8b9dc3`, ASO=`#48a868`, SE=`#b065a1`, AE=`#5cb3c8`
- Texto: `#2d3748` (escuro), `#718096` (muted)
- Tooltip: fundo branco, borda cinza

#### Filtros decorativos
- Pequenos badges cinza claro no rodapé de cada gráfico simulando slicers de Excel (ex: "MÊS DO FATURAMENTO ▼", "MODAL ▼", "Região ▼")

#### Dados
- Toda a lógica de fetch e processamento (useMemo) permanece igual
- Novos useMemo adicionados para: dados do mês mais recente por modal (gráficos 6-7), dados por divisão modal com contagem e valor (gráficos 8-9)
- Labels de mês no formato "março, 2025" (por extenso, como no anexo)

### Resumo
| Arquivo | Acao |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Reescrita completa (visual corporativo claro, 9 gráficos) |

Nenhum outro arquivo é alterado. Backend, rotas e menu permanecem iguais.

