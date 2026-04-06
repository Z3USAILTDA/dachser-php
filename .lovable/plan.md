

## Plano: Corrigir reimportação de disputas excluídas

### Problema

Existem **dois bugs** que impedem a reimportação:

1. **`bulk_delete_disputas`** (exclusão em lote) apenas insere na `t_financeiro_soft_delete`, mas **NÃO** deleta os registros da `t_fin_disputas`. Diferente do `delete_disputa` (exclusão individual) que faz ambos.

2. **`check_disputas_planilha`** verifica se o registro existe na `t_fin_disputas` para classificar como "existente", mas não verifica se foi soft-deleted. Como os registros permanecem na `t_fin_disputas` após bulk delete, são classificados como "existing".

### Solução

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`**

#### 1. Corrigir `bulk_delete_disputas` (~linha 14371)

Adicionar `DELETE FROM ai_agente.t_fin_disputas` para cada `docKey`, igual ao `delete_disputa` individual:

```sql
-- Após INSERT IGNORE em t_financeiro_soft_delete:
DELETE FROM ai_agente.t_fin_disputas WHERE nf = ?
```

Também resetar `disputa = 0` na tabela fonte para os documentos excluídos.

#### 2. Corrigir `check_disputas_planilha` (~linha 3147)

Adicionar verificação da `t_financeiro_soft_delete` para ignorar registros soft-deleted:

```sql
SELECT id FROM ai_agente.t_fin_disputas fd
WHERE fd.nf = ?
AND NOT EXISTS (
  SELECT 1 FROM ai_agente.t_financeiro_soft_delete sd 
  WHERE sd.documento = fd.nf AND sd.active = 0
)
LIMIT 1
```

### Arquivo alterado
- `supabase/functions/mariadb-proxy/index.ts` — cases `bulk_delete_disputas` e `check_disputas_planilha`

