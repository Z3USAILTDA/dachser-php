

## Plano: Mostrar todos os processos da t_cct_hawb_api_atual com filtro de data

### Situação atual

Na query `get_cct_shipments` (linha 3619 do `mariadb-proxy/index.ts`), existe o filtro:
```sql
WHERE a.hawb IS NOT NULL
```
Isso exclui HAWBs que não têm correspondência na `t_dados_aereo`. Como todos os processos da `t_cct_hawb_api_atual` já existem na `t_dados_aereo`, esse filtro é redundante mas seguro. O pedido é:

1. Remover o filtro `WHERE a.hawb IS NOT NULL`
2. Adicionar filtro de data: `master_insert >= '2026-03-20'` ou `created_at >= '2026-03-20'` na CTE `aereo_latest`

### Alteração

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

**1. CTE `aereo_latest`** (~linha 3543): adicionar filtro de data
```sql
WHERE a.hawb_number IS NOT NULL
  AND TRIM(a.hawb_number) <> ''
  AND (a.master_insert >= '2026-03-20' OR a.created_at >= '2026-03-20')
```

**2. WHERE final** (~linha 3619): remover `WHERE a.hawb IS NOT NULL`, trocar por:
```sql
WHERE 1=1
```

Isso garante que todos os HAWBs da `t_cct_hawb_api_atual` apareçam no dashboard, mesmo que não tenham match na `t_dados_aereo` (os campos do aéreo ficarão NULL via LEFT JOIN). O filtro de data na CTE limita apenas os registros do aéreo a processos de 20/03/2026 em diante.

### Impacto

- Processos sem correspondência no aéreo aparecerão com cliente/analista/ETD como NULL (já tratados pelo `COALESCE` existente)
- Reduz volume de dados do aéreo ao filtrar por data
- Nenhum outro arquivo alterado

