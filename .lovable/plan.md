

## Adicionar visualizações Score Rating, Bad Debts, PYMT Term Rating + Aba Analítico no Excel

### Resumo

Adicionar 3 novas visualizações no dashboard de Cobrança e uma nova aba "Analítico de Clientes" no Excel exportado. A visualização "Current Customers - Aging List" (item 3) já existe, então será mantida como está.

### Parte 1: Novas actions no backend

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts`

**1.1 — `get_score_rating`**
Calcula a distribuição percentual do receivable por faixa de aging para o mês atual (Score Rating). Retorna: NOT OD%, 1-90%, 91-180%, 181-240%, 241-360%, >361%, OD%.

```sql
-- Usa a mesma query base do aging, mas retorna apenas % do total por faixa
-- Resultado: uma linha com o mês atual e as percentagens
```

**1.2 — `get_bad_debts`**
Retorna valores absolutos por faixa de aging (mesma estrutura do Score Rating, mas com valores em R$). Pode ser calculado a partir dos `totals` já existentes no frontend — portanto **não precisa de nova action**. Será derivado dos dados de `get_aging_overview`.

**1.3 — `get_pymt_term_rating`**
Calcula % de pagamentos por faixa de prazo (0-15, 16-30, 31-45, 46-60, 61-90, >90 dias) a partir da tabela `tbaixas`, agrupado por mês. Usa `DATEDIFF(DataBaixa, DataVencimento)` para determinar a faixa de prazo.

```sql
SELECT 
  DATE_FORMAT(b.DataBaixa, '%Y-%m') AS periodo,
  SUM(CASE WHEN DATEDIFF(b.DataBaixa, b.DataVencimento) BETWEEN 0 AND 15 THEN b.ValorBaixado ELSE 0 END) / SUM(b.ValorBaixado) * 100 AS pct_0_15,
  -- ... demais faixas
FROM dados_dachser.tbaixas b
WHERE b.StatusLan IN (1,2,3) AND b.DataBaixa >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY DATE_FORMAT(b.DataBaixa, '%Y-%m')
ORDER BY periodo DESC
```

**1.4 — `get_aging_analitico`**
Retorna todos os registros individuais de `t_dados_financeiro_nfs` com as colunas do formato "25.02.xlsx":
- Coligada (fixo "1"), documento, numero_nf, modal, tipo_documento, data_emissao, data_vencimento, cod_cliente, razao_social, status (Em aberto), valor_nf, valor_liquido, processo, master, house, id_rm
- Dias de vencimento calculado: `DATEDIFF(CURDATE(), data_vencimento)`
- Provisão por faixa calculada no frontend
- Limite de 10.000 registros

### Parte 2: Novas visualizações no frontend

**Arquivo**: `src/pages/olimpo/OlimpoCobranca.tsx`

**2.1 — Score Rating** (tabela)
Mostra o mês atual com % por faixa de aging + coluna OD%. Calculado dos `totals` já carregados — **sem nova chamada de API**. Apresentado como tabela simples com uma linha do mês corrente.

**2.2 — Bad Debts** (tabela)
Mostra valores absolutos por faixa de aging para o mês atual. Também calculado dos `totals` já existentes — mesma estrutura, valores em R$.

**2.3 — PYMT Term Rating** (tabela)
Nova tabela com dados dos últimos 12 meses, vindo da action `get_pymt_term_rating`. Inclui coluna "TT >30" (soma de 31-45 + 46-60 + 61-90 + >90).

### Parte 3: Nova aba "Analítico de Clientes" no Excel

Ao clicar "Excel", além das abas existentes:
1. Buscar dados via `get_aging_analitico`
2. Gerar aba "Analítico de Clientes" com colunas idênticas ao 25.02.xlsx:
   - Coligada, NUMERO DOCUMENTO, NOTA FISCAL, MODAL, TIPO DOC., DATA EMISSÃO, VENCTO, COD. CLIENTE, RAZÃO SOCIAL CLIENTE, STATUS FINANCEIRO, VALOR ORIGINAL, VALOR LÍQUIDO, PROCESSO, MASTER, HOUSE, IDLAN
   - Colunas de provisão calculadas: ≤90 (1%), 91-180 (25%), 181-240 (50%), 241-360 (75%), >360 (100%)
   - Qtd. Dias de Vencimento até Data Corte
3. Header com "DATA DE CORTE" e totais de provisão

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/mariadb-proxy/index.ts` | 2 novas actions: `get_pymt_term_rating`, `get_aging_analitico` |
| `src/pages/olimpo/OlimpoCobranca.tsx` | 3 novas tabelas (Score Rating, Bad Debts, PYMT Term) + aba Analítico no Excel |

