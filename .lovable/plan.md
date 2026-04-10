

## Plano: Filtrar Histórico de Baixas por TipoPagRec = 1

### Problema

A query atual busca todas as linhas da `tbaixas` com `StatusLan IN (0, 1, 2, 3)`, sem filtrar por `TipoPagRec`. O usuário quer que apenas registros com `TipoPagRec = 1` sejam exibidos.

### Alteração

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`** (linha ~10391)

Adicionar filtro `AND b.TipoPagRec = 1` na cláusula WHERE da query de baixas:

```sql
-- DE:
WHERE b.StatusLan IN (0, 1, 2, 3) ${dateFilter}

-- PARA:
WHERE b.TipoPagRec = 1 AND b.StatusLan IN (0, 1, 2, 3) ${dateFilter}
```

Nenhuma alteração no frontend.

