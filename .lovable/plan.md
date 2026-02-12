

# Adicionar Partner ID aos Relatorios de Demurrage

## Objetivo
Incluir a coluna "Partner ID" (campo `dchr_customer_number` da tabela `t_clientes_base`) nos relatorios Excel e PDF do modulo de Demurrage. Essa informacao nao aparece na tela, mas deve constar nos relatorios exportados.

## Como funciona hoje
- A query `demurrage_get_containers` faz `SELECT * FROM dados_dachser.t_dachser_demurrage_containers` sem JOIN com a tabela de clientes
- O campo `cliente` no container contem o nome do cliente, mas nao o codigo (Partner ID)
- Os relatorios Excel (`demurrageExcelExport.ts`) e PDF (`demurragePdfExport.ts`) exportam apenas os dados disponiveis no tipo `DemurrageContainer`

## Plano de Implementacao

### 1. Backend: Adicionar LEFT JOIN na query (mariadb-proxy)
Modificar o case `demurrage_get_containers` no `mariadb-proxy/index.ts` para fazer LEFT JOIN com `t_clientes_base` usando o campo `cliente` = `nome_cliente`, trazendo o `dchr_customer_number` como `partner_id`.

### 2. Frontend: Atualizar o tipo DemurrageContainer
Adicionar o campo `partner_id: string | null` na interface `DemurrageContainer` em `useDemurrageData.ts`.

### 3. Relatorio Excel: Adicionar coluna Partner ID
Inserir a coluna "Partner ID" logo apos "Cliente" nos dois exports:
- `exportDemurrageToExcel` (relatorio principal do monitor)
- `exportDiscrepancyReport` (relatorio de discrepancias)

### 4. Relatorio PDF: Adicionar coluna Partner ID
Inserir "Partner ID" na tabela principal do `exportDemurrageReportPDF`.

## Detalhes Tecnicos

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`**
- Alterar a query de `SELECT * FROM dados_dachser.t_dachser_demurrage_containers` para:
```sql
SELECT dc.*, cb.dchr_customer_number as partner_id
FROM dados_dachser.t_dachser_demurrage_containers dc
LEFT JOIN dados_dachser.t_clientes_base cb ON dc.cliente = cb.nome_cliente
WHERE ...
```

**Arquivo: `src/hooks/useDemurrageData.ts`**
- Adicionar `partner_id: string | null` na interface

**Arquivo: `src/utils/demurrageExcelExport.ts`**
- Adicionar "Partner ID" como coluna nos dois exports, posicionada apos "Cliente"

**Arquivo: `src/utils/demurragePdfExport.ts`**
- Adicionar "Partner ID" na tabela do PDF principal

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mariadb-proxy/index.ts` | LEFT JOIN com t_clientes_base para trazer dchr_customer_number |
| `src/hooks/useDemurrageData.ts` | Adicionar campo partner_id na interface |
| `src/utils/demurrageExcelExport.ts` | Adicionar coluna Partner ID nos dois exports |
| `src/utils/demurragePdfExport.ts` | Adicionar coluna Partner ID no PDF |

