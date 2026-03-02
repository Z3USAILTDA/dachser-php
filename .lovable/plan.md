
# Budget e Forecast no Olimpo Cobranca

## Resumo

Adicionar action `get_budget_forecast_auto` no `mariadb-proxy` e 3 KPI cards novos no frontend, com tratamento robusto de erros para nunca quebrar o aging existente.

---

## Etapa 1 — Backend: nova action no `mariadb-proxy/index.ts`

Inserir novo case `get_budget_forecast_auto` apos o bloco `get_aging_by_client` (linha ~2232).

### Logica da action (com tratamento defensivo total):

1. **Criar tabela** (try/catch isolado — se falhar, ignora):
```text
CREATE TABLE IF NOT EXISTS dados_dachser.t_budget_cobranca (
  period CHAR(7) NOT NULL,
  view_mode ENUM('product','client') NOT NULL,
  budget_value DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (period, view_mode)
);
```

2. **Buscar budget** (try/catch isolado — se falhar, budget = 0):
```text
SELECT COALESCE(budget_value, 0) AS budget
FROM dados_dachser.t_budget_cobranca
WHERE period = DATE_FORMAT(CURDATE(), '%Y-%m')
  AND view_mode = ?
```

3. **Calcular forecast** (try/catch isolado — se falhar, forecast = 0):
```text
SELECT COALESCE(SUM(
  t.valor_nf *
  CASE
    WHEN DATEDIFF(CURDATE(), t.data_vencimento) <= 0 THEN 0.85
    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 1 AND 90 THEN 0.55
    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 91 AND 180 THEN 0.35
    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 181 AND 240 THEN 0.20
    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 241 AND 360 THEN 0.10
    ELSE 0.05
  END
), 0) AS forecast
FROM dados_dachser.t_dados_financeiro_nfs t
LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
WHERE COALESCE(sd.active, 1) = 1
  AND NOT EXISTS (
    SELECT 1 FROM dados_dachser.tbaixas b
    WHERE b.IdLancamentoRM = t.id_rm
      AND b.StatusLan IN (1, 2, 3)
  )
  AND (t.disputa IS NULL OR t.disputa = 0)
  AND t.data_vencimento <= LAST_DAY(CURDATE())
```

4. **Retorno sempre `success: true`** com `budget` e `forecast` como numeros (nunca null).

---

## Etapa 2 — Frontend: `OlimpoCobranca.tsx`

### 2.1 Interface e state

Adicionar `BudgetForecast` interface e `budgetForecast` state.

### 2.2 Atualizar `fetchData()`

- Usar `Promise.allSettled` (nao `Promise.all`) para garantir que falha do budget nao impede aging.
- Se a promise do budget falhar ou retornar erro, usar fallback silencioso:
```text
setBudgetForecast({
  period: "YYYY-MM atual",
  budget: 0,
  forecast: 0,
  asOf: new Date().toISOString(),
});
```
- Sem toast destructive para erro de budget.

### 2.3 Calculos derivados

```text
budgetValue    = budgetForecast?.budget ?? 0
forecastValue  = budgetForecast?.forecast ?? 0
gapValue       = forecastValue - budgetValue
attainmentPct  = budgetValue > 0 ? (forecastValue / budgetValue * 100).toFixed(1) : "0"
isNegativeGap  = gapValue < 0
```

### 2.4 KPI Grid

Expandir de `md:grid-cols-4` para `md:grid-cols-7` e adicionar 3 cards:

| KPI | Icone | Valor | Accent |
|-----|-------|-------|--------|
| Budget (Mes) | DollarSign | formatCompact(budgetValue) | Nao |
| Forecast (Mes) | TrendingUp | formatCompact(forecastValue) + " - " + attainmentPct + "%" | Nao |
| Gap (Forecast - Budget) | AlertTriangle | formatCompact(gapValue) | Sim, se gap < 0 |

---

## O que NAO sera alterado

- Actions `get_aging_overview` e `get_aging_by_client`
- Tabela de aging, graficos, `mergeProductRows`, paginacao, filtros
- Nenhum outro arquivo

## Arquivos modificados

1. `supabase/functions/mariadb-proxy/index.ts` — nova action com 3 try/catch isolados
2. `src/pages/olimpo/OlimpoCobranca.tsx` — interface, state, fetch com fallback, 3 KPI cards
