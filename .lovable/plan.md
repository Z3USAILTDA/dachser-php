

## Adicionar visualizações faltantes na tela de Cobrança

### Análise das imagens vs implementação atual

Comparando os screenshots com o código atual de `OlimpoCobranca.tsx`, identifico **2 visualizações faltantes**:

| Visualização | Status | Dados disponíveis? |
|---|---|---|
| SCORE RATING (histórico %) | ✅ Já existe | — |
| BAD DEBTS (provisão R$) | ✅ Já existe | — |
| CURRENT CUSTOMERS (contagem) | ✅ Já existe | — |
| PYMT TERM RATING (global) | ✅ Já existe | — |
| PYMT TERM por Cliente | ✅ Já existe (collapsible) | — |
| **AGING LIST (histórico R$)** | ❌ Faltando | ✅ Sim (`historicalData` já tem `not_od`, `d1_90`, etc.) |
| **AGING LIST por Cliente (histórico R$)** | ❌ Faltando | ❌ Precisa de nova action no backend |

### Alterações

**1. Frontend — Tabela "AGING LIST" histórica (R$)**

Adicionar uma tabela ao lado do Score Rating e Bad Debts (grid 3 colunas), mostrando os valores absolutos em R$ por período. Os dados já existem no `historicalData` — campos `not_od`, `d1_90`, `d91_180`, `d181_240`, `d241_360`, `d361_plus`, `total`. Apenas precisa renderizar.

**2. Backend — Nova action `get_aging_historical_by_client`**

Criar action no `mariadb-proxy` que, para cada um dos 10 meses, agrupa os valores de aging por cliente (razão social normalizada), retornando:
- `cliente`, `periodo`, `not_od`, `d1_90`, `d91_180`, `d181_240`, `d241_360`, `d361_plus`, `total`

A query será similar à de `get_aging_historical`, mas com `GROUP BY TRIM(SUBSTRING_INDEX(razao_social, '-', 1))`.

**3. Frontend — Tabela "AGING LIST por Cliente" (collapsible)**

Seção collapsible (mesmo padrão do PYMT Term por Cliente) onde cada cliente expande para mostrar seus 10 meses de aging em R$. Posicionada ao lado ou abaixo do "Current Customers".

### Layout proposto

O bloco histórico passará de 2 colunas (Score Rating | Bad Debts) para **3 colunas** (Score Rating | Aging List R$ | Bad Debts), espelhando exatamente o layout do screenshot.

A seção inferior terá 3 blocos: Current Customers | Aging List por Cliente (collapsible) | PYMT Term por Cliente (collapsible).

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/mariadb-proxy/index.ts` | Nova action `get_aging_historical_by_client` |
| `src/pages/olimpo/OlimpoCobranca.tsx` | Adicionar tabela Aging List R$ histórica + Aging List por Cliente collapsible + fetch da nova action |

