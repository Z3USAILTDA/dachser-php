# Memory: air/ajustes-manuais-e-exclusoes
Updated: 2026-03-16

O monitoramento aéreo utiliza 'MANUAL_OVERRIDES' e 'FORCED_TIMELINES' para gerenciar exceções operacionais. A aplicação de overrides manuais é condicional: o override é ignorado se o status automático no MariaDB possuir um peso hierárquico IATA superior (mais avançado) ou se a data do evento automático for estritamente mais recente que a data definida no override manual. Isso garante que atualizações automáticas em tempo real prevaleçam sobre dados manuais estáticos. AWBs incluídos no conjunto 'HIDDEN_AWBS' são filtrados no backend e não aparecem na interface.

## Regra de prevalência cronológica (implementada 2026-03-16)

Tanto no `fetch-status-aereo` quanto no `mariadb-proxy`, antes de aplicar um override manual ou timeline forçada:
1. Extrai-se a `last_event_date` do registro automático do MariaDB
2. Compara-se com a `last_event_date` do override manual
3. Se a data automática for **estritamente mais recente** e o status automático **não for** `tracking_failed`, o override é **ignorado** e os dados automáticos prevalecem
4. Se o peso IATA automático for maior que o manual, o override também é ignorado (regra pré-existente)

Isso elimina a necessidade de remover manualmente os overrides quando o rastreio automático progride.
