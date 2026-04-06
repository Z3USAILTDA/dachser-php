

## Plano: Corrigir query `get_disputas` para mostrar todas as NFs importadas

### Problema

A query `get_disputas` filtra por `t.disputa = 1` na tabela fonte (`t_dados_financeiro_nfs`). Porém, o UPDATE que marca `disputa = 1` durante a importação usa `WHERE documento = ? AND numero_nf = ?`, que falha quando esses campos estão vazios/nulos para alguns NDs. Resultado: 11 registros foram inseridos na `t_fin_disputas`, mas apenas 4 têm `disputa = 1` na tabela fonte.

### Solução (duas correções)

#### 1. Corrigir o UPDATE na importação (linha ~3287)

Trocar o WHERE de `documento = ? AND numero_nf = ?` para `nd = ?`, garantindo que todas as NFs do ND recebam `disputa = 1`:

```sql
-- De:
UPDATE ... WHERE documento = ? AND numero_nf = ?
-- Para:
UPDATE ... WHERE nd = ?
```

#### 2. Corrigir a query `get_disputas` (linha ~2763)

Alterar o WHERE para incluir NFs que existam na `t_fin_disputas`, mesmo que `disputa` não esteja marcada na tabela fonte. Trocar o LEFT JOIN por uma condição que também traga registros da `t_fin_disputas`:

```sql
WHERE (t.disputa = 1 OR fd.nf IS NOT NULL) AND COALESCE(sd.active, 1) = 1
```

Isso garante que qualquer NF importada via planilha apareça na tela, independentemente do flag `disputa` na tabela fonte.

### Arquivo alterado
- `supabase/functions/mariadb-proxy/index.ts` — case `get_disputas` (~linha 2763) e case `import_disputas_planilha` (~linha 3287)

