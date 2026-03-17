

## Plano: Remover filtro de exclusão de processos ENTREGUE no cron

### Problema
Na query `get_cct_pending_hawbs` do `mariadb-proxy`, quando `prioritize_pending=true` (modo usado pelo cron), existe este filtro na linha 13091:

```sql
AND COALESCE(cct.status_cct_oficial, '') != 'ENTREGUE'
```

Isso impede que processos já marcados como ENTREGUE sejam reconsultados.

### Solução

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`

Remover a condição `!= 'ENTREGUE'` do bloco `prioritizePending`. O trecho:

```typescript
if (prioritizePending) {
  extraWhere = `AND COALESCE(cct.status_cct_oficial, '') != 'ENTREGUE'`;
  orderBy = `ORDER BY m.data_insert ASC`;
}
```

Passa a ser:

```typescript
if (prioritizePending) {
  // Continuous polling: query ALL processes, including delivered
  extraWhere = '';
  orderBy = `ORDER BY m.data_insert ASC`;
}
```

Isso garante que **todos** os processos ativos na janela de 30 dias do firecrawl sejam reconsultados continuamente, independentemente do status CCT.

### Deploy
- Redeploy `mariadb-proxy`

