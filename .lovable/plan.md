

## Plano: Mostrar containers do MBL nos Detalhes da Pré-Fatura

### Problema
O dialog `PreInvoiceDetailsDialog` busca containers via `useDemurragePreInvoiceItems` (tabela `pre_invoice_items`), que retorna vazio. Os dados reais dos containers estão na lista operacional (`allContainers` via `useDemurrageData`), filtrados pelo MBL da pré-fatura.

### Alterações

**1. `src/pages/demurrage/DemurragePreInvoicing.tsx`**
- Passar nova prop `containers` ao `PreInvoiceDetailsDialog`, filtrando `allContainers` pelo MBL da pré-fatura selecionada (mesmo padrão já usado no `SendTestEmailDialog`)

**2. `src/components/demurrage/PreInvoiceDetailsDialog.tsx`**
- Adicionar prop `containers: DemurrageContainer[]`
- Substituir a tabela atual (que usa `items` do `useDemurragePreInvoiceItems`) por uma tabela que exibe os `containers` recebidos via prop
- Manter `useDemurragePreInvoiceItems` apenas para o PDF e email
- Colunas da nova tabela de containers:

| Coluna | Campo do `DemurrageContainer` |
|---|---|
| Container | `numero` |
| ATA | `data_atracacao` |
| Último Evento | `last_event` |
| Medida | `tipo_conteiner` |
| Tipo | `tipo_processo` |
| Descarga | `ft_started_at` |
| Free Time | `free_time_days` + `free_time_end_date` |
| Limite Devolução | `free_time_end_date` |
| Devolução Vazio | `data_devolucao` |
| Dias em Posse | calculado: diferença entre `ft_started_at` e `data_devolucao` (ou hoje) |
| Dias Incidentes | `excedente_dias` |

### Resultado
O dialog mostrará todos os containers vinculados ao MBL da pré-fatura com as informações operacionais completas solicitadas.

