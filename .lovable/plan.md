

## Reformatar Bad Debts conforme modelo de referência

### O que mudar

O modelo de referência mostra uma **tabela única combinada** com colunas mais granulares e 4 linhas:

**Colunas**: Not Overdue | 0-30 | 31-40 | 41-60 | 61-90 | 91-120 | 121-180 | 181-240 | 241-365 | 366+ | Total overdue | Grand Total

**Linhas**:
1. **Score Rating %** — distribuição percentual por faixa
2. **Valores absolutos** — R$ por faixa  
3. **% Provisão** — 1%, 1%, 1%, 1%, 1%, 25%, 25%, 50%, 75%, 100%
4. **Valores de provisão** — valor × % provisão por faixa

### Alterações necessárias

**1. Backend (`mariadb-proxy/index.ts`)** — Expandir `get_aging_overview` para retornar buckets mais granulares:
- Substituir `aging_30` (1-30) por `aging_30` (0-30) ✓ já existe
- Dividir `aging_90` (31-90) em: `aging_40` (31-40), `aging_60` (41-60), `aging_90` (61-90)
- Dividir `aging_180` (91-180) em: `aging_120` (91-120), `aging_180` (121-180)
- Renomear `aging_360` (241-360) para `aging_365` (241-365)
- Renomear `aging_360_plus` para `aging_366_plus`

**2. Frontend (`OlimpoCobranca.tsx`)** — Substituir os dois cards separados (Score Rating + Bad Debts) por uma **tabela única full-width** com as 4 linhas do modelo, usando as novas colunas granulares. Atualizar:
- Interface `AgingRow` com os novos campos
- Constantes `AGING_COLORS`, `AGING_LABELS`, `PROVISION_PCT`, `agingKeys`
- `scoreRating` e `badDebtsRow` useMemo
- Tabela principal de aging (cabeçalhos)
- Gráfico de barras
- Cálculos de `totalOverdue`
- Exportação Excel (colunas)

### Escopo de impacto
- `supabase/functions/mariadb-proxy/index.ts` — query SQL do `get_aging_overview` + totais
- `src/pages/olimpo/OlimpoCobranca.tsx` — tipo, constantes, visualizações, Excel
- `src/components/olimpo/ClientDetailSheet.tsx` — atualizar agingKeys/labels se usar os mesmos campos

