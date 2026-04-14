
## Plano: corrigir os gráficos com NaN no Faturamento

### Diagnóstico
O problema provavelmente está no campo `valor_total_faturado`: ele entra no dashboard como se fosse `number`, mas vindo do MariaDB pode chegar como string decimal. Hoje o código soma direto (`entry.valor += r.valor_total_faturado || 0`), o que pode gerar concatenação de string em vez de soma numérica. Quando esses valores passam por `tickFormatter`, `Tooltip` e `LabelList`, alguns gráficos acabam exibindo `NaN`.

### O que vou ajustar

1. **Normalizar o valor monetário na origem**
   - Revisar o retorno de `get_faturamento_dashboard` no `mariadb-proxy`
   - Garantir que `valor_total_faturado` volte numérico no payload

2. **Blindar o frontend contra dados inválidos**
   - Em `src/pages/olimpo/OlimpoFaturamento.tsx`, criar uma função utilitária para converter qualquer valor em número seguro
   - Usar essa conversão em todos os cálculos:
     - `monthlyData`
     - `kpis`
     - `lastMonthModalData`
     - `divisionData`

3. **Endurecer os formatadores**
   - Ajustar `formatBRL`, `formatBRLFull` e `formatCompact` para nunca retornarem `NaN`
   - Proteger também `Tooltip`, `YAxis` e `LabelList` dos gráficos de valor

4. **Manter o visual atual**
   - Não vou mudar o tipo de gráfico nem o layout
   - Só corrigir a base numérica e a exibição dos valores

### Validação
Depois da correção, vou conferir especialmente os gráficos monetários:
- Valor Total Faturado no RM
- Valor Total Faturado no RM por Modal
- Valor por Modal
- Valor por Divisão Modal
- KPIs de faturamento total e maior cliente

### Arquivos
| Arquivo | Ação |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Normalizar valores e proteger formatadores |
| `supabase/functions/mariadb-proxy/index.ts` | Garantir retorno numérico de `valor_total_faturado` |
