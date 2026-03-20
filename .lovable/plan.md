

## Plano: Excel sempre com abas Product e Client

### Problema
O export Excel atualmente usa os dados do `viewMode` ativo (product ou client). O usuário quer que o Excel sempre contenha ambas as visões, independente de qual esteja visualizando.

### Solução (`src/pages/olimpo/OlimpoCobranca.tsx`)

**Alterar `handleExportExcel`** para:

1. **Buscar ambos os datasets**: Fazer 2 chamadas paralelas ao backend — `get_aging_overview` (product) e `get_aging_by_client` (client) — independente do `viewMode` atual.

2. **Gerar 3 abas no Excel**:
   - **Aba "Aging - Product"**: Dados agrupados por product (usando `mergeProductRows` nos dados de `get_aging_overview`), com toda a formatação profissional existente (título dourado, zebra, Grand Total, % do Total, % Provisão, Valor Provisionado).
   - **Aba "Aging - Client"**: Dados de `get_aging_by_client`, ordenados por maior vencido (mesma lógica do `displayRows` client), com a mesma formatação profissional.
   - **Aba "Analítico de Clientes"**: Mantém como está (dados de `get_aging_analitico`).

3. **Reutilizar lógica de estilização**: Extrair a lógica de criação da aba Aging para uma função auxiliar que recebe `rows[]`, `label` ("Product"/"Client") e `sheetName`, evitando duplicação de código.

4. **Nome do arquivo**: Trocar de `aging_${viewMode}_...` para `aging_report_...` (sem referência ao viewMode).

### Arquivo alterado
| Arquivo | Alteração |
|---------|-----------|
| `src/pages/olimpo/OlimpoCobranca.tsx` | Refatorar `handleExportExcel` para buscar ambos datasets e gerar 3 abas |

