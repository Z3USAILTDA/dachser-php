

# Adicionar Campos de Pre-Fatura ao Relatorio de Demurrage

## Contexto
Os campos "Status Info", "MISK", "Reg. Othello" e "Observacao" foram adicionados recentemente na tela de Pre-Faturamento e sao preenchidos pelo usuario. Porem, eles nao aparecem nos relatorios Excel e PDF exportados pelo Monitor de Demurrage.

Esses campos existem na tabela `t_dachser_demurrage_pre_invoices` e estao vinculados aos containers pelo campo `shipment_mbl` (MBL).

## Plano

### 1. Backend: Trazer campos da pre-fatura no query de containers
Modificar a query `demurrage_get_containers` no `mariadb-proxy/index.ts` para incluir um segundo LEFT JOIN com `t_dachser_demurrage_pre_invoices`, trazendo os campos `status_info`, `misk`, `othello_registro` e `observacao`. Como um MBL pode ter mais de uma pre-fatura, usaremos uma subquery que pega a pre-fatura mais recente por MBL.

### 2. Frontend: Atualizar tipo DemurrageContainer
Adicionar os campos `status_info`, `misk`, `othello_registro` e `observacao` (todos `string | null`) na interface `DemurrageContainer` em `useDemurrageData.ts`.

### 3. Relatorio Excel: Adicionar colunas
Incluir as 4 colunas no `exportDemurrageToExcel` (apos as colunas existentes, antes de Data Criacao):
- Status Info
- MISK
- Reg. Othello
- Observacao

### 4. Relatorio PDF: Adicionar colunas
Incluir as mesmas colunas no `exportDemurrageReportPDF` na tabela principal.

## Detalhes Tecnicos

**Query modificada (mariadb-proxy):**
```sql
SELECT dc.*, 
  cb.dchr_customer_number as partner_id,
  pi.status_info as pi_status_info,
  pi.misk as pi_misk,
  pi.othello_registro as pi_othello_registro,
  pi.observacao as pi_observacao
FROM dados_dachser.t_dachser_demurrage_containers dc
LEFT JOIN dados_dachser.t_clientes_base cb ON dc.cliente = cb.nome_cliente COLLATE utf8mb4_general_ci
LEFT JOIN dados_dachser.t_dachser_demurrage_pre_invoices pi ON pi.id = (
  SELECT id FROM dados_dachser.t_dachser_demurrage_pre_invoices 
  WHERE shipment_mbl = dc.mbl COLLATE utf8mb4_unicode_ci 
  ORDER BY created_at DESC LIMIT 1
)
WHERE ...
```

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mariadb-proxy/index.ts` | LEFT JOIN com pre_invoices para trazer status_info, misk, othello_registro, observacao |
| `src/hooks/useDemurrageData.ts` | Adicionar 4 campos na interface DemurrageContainer |
| `src/utils/demurrageExcelExport.ts` | Adicionar 4 colunas nos exports |
| `src/utils/demurragePdfExport.ts` | Adicionar colunas no PDF |
