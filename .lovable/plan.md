

# Correção: Busca por Número Inteiro no Modal de Voucher Master

## Problema

No modal de criação de Voucher Master, ao buscar vouchers para consolidar, a query SQL só procura nos campos `numero_spo` e `fornecedor`. Quando o usuário digita o número inteiro do voucher (ex: o ID numérico), a busca não retorna resultados porque esse campo não está incluído na consulta.

## Solução

Expandir a query SQL na action `search_vouchers_for_master` do `mariadb-proxy` para incluir também os campos `id` e `id_rm` na busca, permitindo encontrar vouchers pelo número inteiro.

## Detalhes Técnicos

### Arquivo: `supabase/functions/mariadb-proxy/index.ts`

Na action `search_vouchers_for_master` (linha ~8608), alterar a query SQL de:

```sql
WHERE (numero_spo LIKE ? OR fornecedor LIKE ?)
```

Para:

```sql
WHERE (numero_spo LIKE ? OR fornecedor LIKE ? OR CAST(id AS CHAR) = ? OR CAST(id_rm AS CHAR) = ?)
```

Isso permite que o usuário encontre um voucher digitando:
- O numero_spo parcial (ex: "SPO-123")
- O nome do fornecedor
- O ID numérico exato do voucher
- O ID do RM

Os parâmetros da query serão ajustados para passar o valor de busca também como match exato para os campos numéricos.
