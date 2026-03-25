

## Plano: Corrigir fallback para buscar containers na tabela de histórico

### Diagnóstico (dados reais)

| MBL | demurrage_containers | t_tracking_sea | t_tracking_sea_history | t_master_dados |
|---|---|---|---|---|
| MEDUWA505645 | 1 container | 1 | - | - |
| MEDUVK324543 | 0 | 0 | MEDU4193739 | container=null |
| HLCUSS5251074650 | 0 | 0 | HAMU1416770 | container=null |
| HLCUSS5251081329 | 0 | 0 | HAMU2736675 | container=null |
| MEDUK8744501 | 0 | 0 | MSMU8189258 | container=null |
| MEDUEC647355 | 0 | 0 | 0 | container=null |
| MEDUKQ387608 | 0 | 0 | 0 | container=null |
| MEDUYP869983 | 0 | 0 | 0 | container=null |

O problema: o fallback (step 3) busca containers apenas em `t_tracking_sea`, que ja foi purgada para esses MBLs antigos. A `t_tracking_sea_history` TEM os containers para 4 dos 7 MBLs sem dados, mas nao esta sendo consultada para descoberta de containers -- so e usada para extrair datas apos ja ter encontrado um container.

Para os 3 MBLs restantes (MEDUEC647355, MEDUKQ387608, MEDUYP869983), nao ha dado de container em nenhuma tabela.

### Alteracoes

**1. `supabase/functions/mariadb-proxy/index.ts` -- action `demurrage_get_containers_by_mbl`**

Adicionar Step 3b: buscar containers distintos diretamente de `t_tracking_sea_history` quando `t_tracking_sea` tambem estiver vazia:

```sql
SELECT DISTINCT h.container, h.mbl_id,
  MAX(h.event_description) as last_event,
  MAX(h.event_datetime) as last_event_date
FROM dados_dachser.t_tracking_sea_history h
WHERE TRIM(UPPER(h.mbl_id)) = TRIM(UPPER(?)
  AND h.container IS NOT NULL AND h.container != ''
GROUP BY h.container, h.mbl_id
```

Depois, para cada container encontrado, aplicar a mesma logica de extracacao de datas historicas (discharge, gate_out, return) que ja existe.

Enriquecer com dados da pre-fatura (client_name, origin_port, destination_port, vessel_name) obtidos da propria tabela `t_dachser_demurrage_pre_invoices` quando `invoice_number` for informado.

**Step 4 (novo): Fallback final -- dados minimos da pre-fatura**

Para MBLs sem container em nenhuma tabela, criar um registro sintetico usando os dados disponiveis na pre-fatura (client_name, vessel, portos, total_usd) para que o dialog nao fique completamente vazio. Marcar com `_source: 'pre_invoice_only'`.

**2. Frontend -- sem alteracoes**

O `PreInvoiceDetailsDialog` ja exibe qualquer `DemurrageContainer[]` retornado. Apenas precisa tratar o caso `_source: 'pre_invoice_only'` para exibir "Dados parciais" em vez de campos vazios.

### Detalhes tecnicos

```text
Fluxo atualizado:
1) t_dachser_demurrage_containers WHERE mbl = ?
2) t_dachser_demurrage_containers WHERE pre_invoice_number = ?
3a) t_tracking_sea WHERE mbl_id = ? (existente)
3b) t_tracking_sea_history WHERE mbl_id = ? (NOVO - busca containers distintos)
4) Fallback sintetico da pre-fatura (NOVO)
```

### Resultado esperado
- 4 MBLs adicionais passam a mostrar containers reais (MEDUVK324543, HLCUSS5251074650, HLCUSS5251081329, MEDUK8744501)
- 3 MBLs sem dados mostram registro sintetico com informacoes da pre-fatura
- Total: de 1/22 para 22/22 pre-faturas com dados no dialog

### Arquivos editados
- `supabase/functions/mariadb-proxy/index.ts`
- `src/components/demurrage/PreInvoiceDetailsDialog.tsx` (tratamento visual para dados parciais)

