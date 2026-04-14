

## Plano: Dashboard de Faturamento — Olimpo

### Visão Geral

Criar a tela `/olimpo/faturamento` com analytics visuais baseados nos dados da tabela `t_base_totvs_rm` (MariaDB), replicando as visualizações dos screenshots:

**KPIs (topo):**
- Faturamento Total (R$) do mês mais recente
- Processos Faturados (contagem) do mês mais recente
- Variação % vs mês anterior
- Maior Cliente (nome + valor R$)

**Gráficos (6 charts):**
1. **Quantidade de Files - Total Faturado** — Bar chart mensal (contagem de processos por mês)
2. **Quantidade Total Faturada por Modal** — Stacked bar chart mensal (AI, SI, TCK, ASO, SE, AE)
3. **Valor Total Faturado no RM** — Bar chart mensal (soma valor_total_faturado em R$)
4. **Valor Total Faturado no RM por Modal** — Stacked bar chart mensal por modal
5. **Quantidade Total Faturada por Região** — Donut chart (Sudeste/Sul)
6. **Quantidade/Valor por Divisão Modal** — Bar charts (SI/SE/TCK/ASO vs AI/AE)

### Arquivos a criar

#### 1. `src/pages/olimpo/OlimpoFaturamento.tsx`
- Busca dados via `supabase.functions.invoke("mariadb-proxy", { body: { action: "get_faturamento_dashboard" } })`
- Processa os dados retornados (agrupamento mensal, por modal, por região, divisão modal)
- 4 KPI cards no topo usando padrão existente (KpiCard ou inline)
- 6 gráficos usando Recharts (BarChart, PieChart) — mesmo padrão do OlimpoCobranca
- Design escuro consistente com as outras telas Olimpo
- Filtro de período opcional

#### 2. `supabase/functions/mariadb-proxy/index.ts` — Nova action `get_faturamento_dashboard`
- Query na `dados_dachser.t_base_totvs_rm`:
  ```sql
  SELECT processo, faturado_em, filial, modal, cliente, 
         valor_total_faturado, regiao, divisao_por_modal
  FROM dados_dachser.t_base_totvs_rm
  ORDER BY faturado_em DESC
  ```
- Retorna os dados brutos para processamento no frontend (mais flexível para filtros)

### Arquivos a modificar

#### 3. `src/pages/olimpo/OlimpoIndex.tsx`
- Adicionar card "Faturamento" com ícone `BarChart3` e href `/olimpo/faturamento`

#### 4. `src/App.tsx`
- Import + rota `/olimpo/faturamento`

#### 5. `src/pages/Dashboard.tsx`
- Adicionar "Faturamento" como filho do módulo Olimpo no sidebar

### Detalhes técnicos

- Gráficos usam Recharts (já instalado, usado extensivamente em OlimpoCobranca)
- Formatação BRL: `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`
- Meses no eixo X: "mar/2025", "abr/2025", etc.
- Cores por modal: AI=#3b82f6, SI=#f59e0b, TCK=#8b5cf6, ASO=#10b981, SE=#ec4899, AE=#06b6d4
- Acesso: todos os usuários autenticados (não apenas admin)

### Resumo de alterações
| Arquivo | Ação |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Novo |
| `supabase/functions/mariadb-proxy/index.ts` | +1 case action |
| `src/pages/olimpo/OlimpoIndex.tsx` | +1 card módulo |
| `src/App.tsx` | +1 import, +1 rota |
| `src/pages/Dashboard.tsx` | +1 item menu Olimpo |

