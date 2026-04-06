

## Plano: Importar todas as NFs de cada ND da planilha

### Problema

O backend usa `LIMIT 1` na query de lookup (linha 3237), retornando apenas 1 NF por ND. Quando a planilha tem um ND com 5 NFs no banco, apenas 1 é inserida na `t_fin_disputas`. As demais linhas com o mesmo ND encontram o mesmo `docKey` já existente e são ignoradas (skipped).

Resultado: 10 linhas na planilha → apenas 4 NFs na tela (1 por ND único).

### Solução

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`** — case `import_disputas_planilha`

Alterar a lógica para que, ao receber um ND, busque **todas** as NFs daquele ND e insira cada uma na `t_fin_disputas`:

1. **Remover `LIMIT 1`** da query `checkSql` (linha 3237)
2. **Iterar sobre todas as NFs retornadas** em vez de processar apenas a primeira
3. Para cada NF do ND:
   - Gerar o `docKey` individual
   - Verificar se já existe na `t_fin_disputas`
   - Inserir/atualizar conforme a lógica atual
4. **Deduplicar NDs na entrada**: como múltiplas linhas da planilha podem ter o mesmo ND, processar cada ND apenas uma vez (agrupar items por ND antes do loop)

### Lógica resumida

```text
// Agrupar items da planilha por ND (evitar reprocessar)
const ndMap = agrupar items por nd (mantém primeiro item de cada nd)

for (nd, item) of ndMap:
  // Buscar TODAS as NFs desse ND (sem LIMIT 1)
  allNfs = SELECT ... FROM t_dados_financeiro_nfs WHERE nd = ?
  
  for cada nf in allNfs:
    docKey = nf.doc_key
    // Verificar se já existe em t_fin_disputas
    // INSERT ou UPDATE conforme lógica existente
    // Propagar observação
```

### Arquivo alterado
- `supabase/functions/mariadb-proxy/index.ts` — case `import_disputas_planilha` (linhas 3220-3360)

