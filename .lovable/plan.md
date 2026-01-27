
# Diagnóstico: Processos do Tracking Não Aparecem no CCT

## Problema Identificado

Os processos aparecem no tracking mas não no CCT devido a um filtro que exige `dep_datetime`:

```sql
-- Query atual no CCT (mariadb-proxy):
AND s.dep_datetime >= '2026-01-26 00:00:00'  -- PROBLEMA: dep_datetime é NULL!
AND DATE(m.data_insert) = '2026-01-26'
```

| Campo | Valor nos Registros | Impacto |
|-------|---------------------|---------|
| `dep_datetime` | **NULL** | Registros excluídos pelo filtro `>= '2026-01-26'` |
| `último_status` | DEP, ARR, etc. | Status indica DEP, mas data não está preenchida |

## Evidência

Nos dados retornados do tracking (network requests):
```json
{
  "último_status": "DEP",
  "dep_datetime": null  // Campo vazio!
}
```

---

## Solução Proposta

Remover o filtro `s.dep_datetime >= '2026-01-26'` e manter apenas o filtro por `último_status` e `DATE(m.data_insert)`.

### Alteração em `supabase/functions/mariadb-proxy/index.ts`

**Linha 2790**: Remover filtro problemático

| Antes | Depois |
|-------|--------|
| `AND s.dep_datetime >= '2026-01-26 00:00:00'` | *(removido)* |
| `AND DATE(m.data_insert) = '2026-01-26'` | `AND DATE(m.data_insert) = '2026-01-26'` *(mantido)* |

### Query Corrigida

```sql
AND (
  -- DEP status: espelhado no CCT
  s.`último_status` = 'DEP'
  OR
  -- Post-ARR statuses
  s.`último_status` IN ('ATA', 'NFD', 'AWD', 'DLV', 'POD')
  OR 
  -- ARR/RCF with more than 120 hours
  (s.`último_status` IN ('ARR', 'RCF') 
   AND s.arr_datetime IS NOT NULL 
   AND s.arr_datetime <= NOW() - INTERVAL 120 HOUR
   AND s.data_atraso IS NULL)
)
-- CCT RESET: Filtrar apenas por data_insert em t_master_dados = 26/01
AND DATE(m.data_insert) = '2026-01-26'
```

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| 0 processos (dep_datetime é NULL) | Todos processos de 26/01 com status DEP ou pós-DEP |
| Exigia dep_datetime preenchido | Usa apenas último_status e data_insert |

---

## Passos de Implementação

1. Atualizar `supabase/functions/mariadb-proxy/index.ts` (remover linha 2790)
2. Deploy da Edge Function `mariadb-proxy`
3. Verificar processos em /air/cct
