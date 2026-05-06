## Ajustar filtro de Etapa em Relatórios

Em `src/components/tabs/ReportsTab.tsx`, no Select de "Etapa":

1. **Remover** os itens `AJUSTE_OPERACAO` ("Ajuste - Operação") e `AJUSTE_FISCAL` ("Ajuste - Fiscal").
2. **Ajustar a lógica de envio** do filtro no `handleExport`: quando o usuário selecionar `OPERACAO`, enviar `['OPERACAO', 'AJUSTE_OPERACAO']`; quando selecionar `FISCAL`, enviar `['FISCAL', 'AJUSTE_FISCAL']`. Para os demais valores, manter o envio atual.

### Detalhes técnicos
- Alterar o body de `supabase.functions.invoke('mariadb-proxy', ...)` para passar `etapa` como array (ou string com vírgulas) nos casos de Operação/Fiscal, mantendo retrocompatibilidade — preferência: enviar campo adicional `etapas: string[]` quando aplicável, sem quebrar o `etapa` atual. Se preferir minimizar mudança no backend, mando apenas o valor selecionado e adapto o proxy para expandir.
- Sem mudanças em outros componentes ou no backend (a expansão fica do lado do client invocando filtro `IN`).

Arquivo afetado: `src/components/tabs/ReportsTab.tsx`.