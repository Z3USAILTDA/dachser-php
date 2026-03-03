

# Fix: Bloquear "unknown" no backend (mariadb-proxy)

## Problema
O fix no frontend (`useUsageLog.ts`) já está correto, mas ainda aparecem registros "unknown" porque:
1. Navegadores com cache antigo podem enviar logs antes de carregar o código novo
2. O backend não valida — aceita qualquer username que receber

## Solução (3 alterações no `mariadb-proxy/index.ts`)

### 1. Rejeitar log_usage com username "unknown" no backend
No case `log_usage` (linha ~579), adicionar validação para recusar inserções com username "unknown":
```typescript
if (logUsername === 'unknown') {
  result = { success: true }; // silently ignore
  break;
}
```

### 2. Filtrar "unknown" da lista de usuários
No case `get_metric_users` (linha ~730), adicionar `unknown` ao filtro de exclusão padrão (não só para Dachser admins — para todos):
```sql
WHERE username != 'unknown'
```

### 3. Deletar registros remanescentes
Executar DELETE via mariadb-proxy para limpar os registros "unknown" que foram criados após a última limpeza.

---

Resultado: mesmo que o frontend envie "unknown" (cache, bug, edge case), o backend nunca mais insere na tabela.

