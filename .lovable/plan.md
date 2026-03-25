

## Plano: Habilitar exportação PDF da pré-fatura

### Problema
O botão "Exportar PDF" está desabilitado porque a condição `items.length === 0` bloqueia o clique. Para a maioria das pré-faturas, `items` (da tabela de line items) está vazio, mas os dados de `containers` (obtidos via fallback) estão disponíveis.

### Alterações

**1. `src/components/demurrage/PreInvoiceDetailsDialog.tsx`**
- Alterar a condição `disabled` do botão de `isLoading || items.length === 0` para `isLoading && isLoadingContainers` (permitir export sempre que não estiver carregando)
- Passar `containers` como terceiro argumento para `exportPreInvoicePDF`

**2. `src/utils/demurragePdfExport.ts`**
- Adicionar parâmetro opcional `containers?: DemurrageContainer[]` à função `exportPreInvoicePDF`
- Quando `items` estiver vazio mas `containers` tiver dados, gerar a tabela do PDF usando os dados dos containers (container number, medida/tipo, free_time, dias em posse, dias incidentes)
- Quando ambos estiverem vazios, gerar o PDF apenas com os dados do cabeçalho da pré-fatura (cliente, MBL, navio, portos, totais) sem tabela de containers

### Resultado
- O botão ficará habilitado para todas as 22 pré-faturas
- O PDF será gerado com os melhores dados disponíveis (items > containers > apenas cabeçalho)

### Arquivos editados
- `src/components/demurrage/PreInvoiceDetailsDialog.tsx`
- `src/utils/demurragePdfExport.ts`

