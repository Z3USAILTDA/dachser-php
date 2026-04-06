

## Plano: Corrigir importação para ignorar registros soft-deleted

### Problema

Na `import_disputas_planilha` (linha 3265), a query de existência verifica apenas:
```sql
SELECT id FROM ai_agente.t_fin_disputas WHERE nf = ? LIMIT 1
```

Sem filtrar registros que foram soft-deleted. Se a exclusão em lote anterior (antes do fix) deixou registros na `t_fin_disputas`, ou se há registros na `t_financeiro_soft_delete`, a importação os trata como existentes e pula (skipped).

### Solução

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`** — case `import_disputas_planilha` (~linha 3265)

1. **Alterar a query de existência** para incluir `NOT EXISTS` contra `t_financeiro_soft_delete`:
```sql
SELECT id FROM ai_agente.t_fin_disputas fd
WHERE fd.nf = ?
AND NOT EXISTS (
  SELECT 1 FROM ai_agente.t_financeiro_soft_delete sd 
  WHERE sd.documento = fd.nf AND sd.active = 0
)
LIMIT 1
```

2. **Antes de inserir um novo registro**, limpar possíveis resíduos soft-deleted:
```sql
-- Remover registro fantasma da t_fin_disputas
DELETE FROM ai_agente.t_fin_disputas WHERE nf = ?;
-- Remover marcador de soft-delete para permitir reinserção
DELETE FROM ai_agente.t_financeiro_soft_delete WHERE documento = ?;
```

Isso garante que itens previamente excluídos sejam tratados como novos na reimportação.

### Arquivo alterado
- `supabase/functions/mariadb-proxy/index.ts` — case `import_disputas_planilha` (~linha 3265)

