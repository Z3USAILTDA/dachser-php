

## Plano: Top Clientes com dados de todos os meses

### Problema
O gráfico "Top Clientes" atualmente filtra apenas o último mês (`lastMonth`), mostrando o ranking de clientes somente do mês mais recente. O usuário quer ver o ranking consolidado de **todos os meses** disponíveis na base.

### Alteração

**Arquivo: `src/pages/olimpo/OlimpoFaturamento.tsx`**

1. **Linha 212-218** — Remover o filtro por `lastMonth` no `topClientesData`. Em vez de filtrar `r.faturado_em.substring(0,7) !== lastMonth`, somar o valor de **todos** os registros, independente do mês.

2. **Linha 436** — Alterar o subtitle do card de `"Último mês"` para `"Todos os meses"` (ou `"Acumulado"`).

### O que NÃO muda
- Layout, cores, formatação de valores
- Lógica dos demais gráficos
- Filtro de clientes "N/A"/"Desconhecido" (se existente)

