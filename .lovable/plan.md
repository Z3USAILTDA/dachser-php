## Plano: Adicionar filtro Impo/Expo na tela /air/tracking-aereo

### Lógica

Usar a mesma lógica já existente em `Index.tsx`: se o aeroporto de destino (`destino`) está na lista de aeroportos brasileiros → Importação. Caso contrário → Exportação.

### Alterações

**Arquivo: `src/pages/air/TrackingAereo.tsx**`

1. O state `filterProcessType` já existe (linha 289), apenas não está sendo usado na filtragem nem renderizado como select.
2. **Adicionar filtro na UI** (após o filtro de Analista, ~linha 688): renderizar um select "Impo/Expo" com opções "Todos", "Importação", "Exportação", seguindo o mesmo estilo visual dos filtros existentes.
3. **Adicionar lógica de filtragem** no `filteredAwbs` (useMemo, ~linha 502-560): antes do `return matchesSearch && matchesAirline && matchesAnalyst`, aplicar a mesma lógica do Index.tsx:
  - Lista de aeroportos brasileiros: `['GRU', 'VCP', 'CGH', 'GIG', 'SDU', 'BSB', 'CNF', 'POA', 'CWB', 'REC', 'SSA', 'FOR', 'BEL', 'MAO', 'NAT', 'MCZ', 'FLN', 'VIX', 'CGB', 'GYN', 'SLZ', 'THE', 'AJU', 'JPA', 'PMW', 'PVH', 'RBR', 'BVB', 'MCP', 'CGR', 'LDB', 'MGF', 'IGU', 'NVT', 'JOI', 'XAP', 'UDI', 'RAO', 'SJP', 'PPB', 'BAU', 'CPQ', 'QPS', 'SOD', 'MAB', 'STM', 'SJK', 'PNZ']`
  - Se `destino` está na lista → import, senão → export
  - Comparar com `filterProcessType`
4. **Adicionar `filterProcessType` nas dependências** do useMemo.

### Nenhum outro arquivo alterado