

## Diagnosticar e corrigir ausência de MSC/HMM/ONE/ZIM no histórico de fees

### Diagnóstico

A função `get_fee_changes` carrega dados de 6 pares de tabelas (main + history). A função conecta com sucesso mas não há logs indicando "Tables not found", "No data", nem "Error processing pair" — o que sugere duas possibilidades:

1. **Timeout**: a função expira antes de processar todos os pares (carrega tabelas inteiras sem WHERE)
2. **Key mismatch**: o campo `empresa` pode estar vazio ou diferente entre tabela main e history, fazendo `keyOf()` não encontrar correspondência

### Alteração proposta

**1 arquivo:** `supabase/functions/mariadb-proxy/index.ts` — apenas no `case 'get_fee_changes'`

**Mudanças:**

1. **Adicionar logs diagnósticos** em cada etapa do loop de pares:
   - Após verificar existência das tabelas: log com contagem de rows de cada tabela
   - Após matching: log com quantas alterações foram encontradas por par
   - Log do valor de `empresa` do primeiro registro de cada tabela (para detectar campo vazio)

2. **Limitar a query** com `ORDER BY data_atualizacao DESC LIMIT 5000` em ambas as queries (main e history) para evitar timeout em tabelas muito grandes

3. **Fallback de empresa**: se `empresa` estiver vazio na history, usar o nome do armador derivado do nome da tabela (ex: `t_local_charge_msc_history` → `MSC`)

### Detalhes técnicos

No loop `for (const pair of pairs)` (linha 1901):

```typescript
// Após as queries (linha 1924), adicionar:
console.log(`[fee_changes] ${pair.main}: ${currRows.length} current rows, ${pair.hist}: ${histRows.length} history rows`);
if (currRows.length > 0) {
  console.log(`[fee_changes] ${pair.main} sample empresa: "${currRows[0].empresa}"`);
}
if (histRows.length > 0) {
  console.log(`[fee_changes] ${pair.hist} sample empresa: "${histRows[0].empresa}"`);
}

// Após o loop de matching (após linha 2001), adicionar:
console.log(`[fee_changes] ${pair.main}: found ${changesForPair} fee changes`);
```

Na query das tabelas (linhas 1913-1924), adicionar `LIMIT 10000` para evitar timeout:
```sql
SELECT ... FROM ${pair.main} ORDER BY data_atualizacao DESC LIMIT 10000
SELECT ... FROM ${pair.hist} ORDER BY data_atualizacao DESC LIMIT 10000
```

No `keyOf`, adicionar fallback do nome da empresa baseado no nome da tabela quando `empresa` está vazio.

### O que NÃO muda

- Nenhum arquivo frontend
- Nenhuma outra lógica do mariadb-proxy
- Layout, filtros, paginação da tela de Alterações de Fee

