

## Plano: Ocultar processos ENTREGUE após 5 dias no CCT

### Contexto

Processos com status CCT "ENTREGUE" devem continuar visíveis por 5 dias após a entrega, e depois ser ocultos da visualização padrão (grid e cards). Só devem aparecer se buscados pela barra de pesquisa.

### Alterações

**1. Backend: `supabase/functions/mariadb-proxy/index.ts`** — seção `get_cct_shipments`

- Passar `data_hora_situacao_estoque` no objeto de resposta de cada shipment (atualmente extraído do SQL mas não incluído no retorno final, ~linha 3856-3908). Adicionar campo `data_entregue` com o valor de `row.data_hora_situacao_estoque` quando o status for ENTREGUE.

**2. Frontend: `src/components/cct/ProcessosTable.tsx`**

- No `filteredProcessos` (useMemo), antes dos filtros existentes, separar processos ENTREGUE com mais de 5 dias:
  - Se `status_cct_oficial === 'ENTREGUE'` e a data de entrega (`data_entregue` ou `updated_at`) for > 5 dias atrás → ocultar do array **a menos que** `searchTerm` esteja preenchido
- Quando o searchTerm estiver preenchido, mostrar todos os processos (inclusive ENTREGUE antigos)

**3. Frontend: `src/pages/cct/CCTDashboard.tsx`**

- No cálculo de `metrics` (useMemo, ~linha 76), filtrar os processos ENTREGUE > 5 dias antes de contar total, alerta, crítico, etc. Os cards de métricas não devem incluir processos entregues há mais de 5 dias.

### Tipo CCT

- Adicionar campo opcional `data_entregue?: string | null` ao mapeamento no `useCCTData.ts` (hook `mapRowToProcessoCCT`).

### Resultado

- Processos entregues ficam visíveis por 5 dias após entrega
- Após 5 dias, somem da grid e dos cards
- Podem ser encontrados pela busca a qualquer momento

