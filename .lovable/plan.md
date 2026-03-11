

## Adicionar 4 visualizações históricas ao dashboard de Cobrança

Já existem na tela: **Aging List** e **Aging List por cliente**. Não serão tocados.

### Visualizações a adicionar

1. **SCORE RATING** (histórico) — % por faixa simplificada (NOT OD, 1-90, 91-180, 181-240, 241-360, >361, OD%), últimos 10 meses
2. **BAD DEBTS** (histórico) — Valores de provisão (R$) por faixa, últimos 10 meses
3. **CURRENT CUSTOMERS - AGING LIST** (histórico) — Contagem de clientes distintos por faixa, últimos 10 meses
4. **PYMT TERM por cliente** — Tabela expandível por empresa, distribuição de prazos de pagamento por cliente

### Backend — `mariadb-proxy/index.ts`

**2 novas actions:**

- **`get_aging_historical`** — Para cada final de mês (últimos 10), calcula faturas em aberto (emitidas antes do ref_date, sem baixa antes do ref_date). Retorna: % por faixa (Score Rating), valores de provisão (Bad Debts), contagem de clientes distintos (Current Customers). Uma query com CROSS JOIN de 10 datas.

- **`get_pymt_term_by_client`** — Top 20 clientes, distribuição de prazos de pagamento mensal dos últimos 10 meses a partir de `tbaixas`.

### Frontend — `OlimpoCobranca.tsx`

- 2 novos states: `historicalData`, `clientPymtHistorical`
- Fetch em paralelo no `fetchData` existente
- **Grid 2 colunas**: Score Rating + Bad Debts lado a lado (tabelas compactas)
- **Full-width**: Current Customers - Aging List
- **Full-width**: PYMT Term por cliente (collapsible por empresa)

Todas adicionadas **após** as visualizações existentes, sem alterar nada atual.

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/mariadb-proxy/index.ts` | 2 novas actions |
| `src/pages/olimpo/OlimpoCobranca.tsx` | 4 novas seções + states + fetch |

