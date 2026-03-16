

## Correção: Inferência de tipo_processo pelo destino

### Problema
O campo `destino` da `t_tracking_sea` pode conter tanto códigos de porto (`BRSSZ`, `BRNVT`) quanto nomes de cidades (`Santos`, `Navegantes, SC, Brazil`). Checar apenas `LIKE 'BR%'` não pega nomes de cidades brasileiras.

### Solução

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts` — linha 1908

Trocar a lógica do COALESCE do `tipo_processo` para usar uma lista exaustiva de padrões brasileiros no fallback:

```sql
COALESCE(
  NULLIF(MAX(mdn.tipo_processo), ''),
  CASE 
    WHEN UPPER(COALESCE(MAX(ts.destino), '')) REGEXP 'BR[A-Z]{3}|SANTOS|PARANAGU|ITAJA|NAVEGANTES|ITAPOA|RIO GRANDE|RIO DE JANEIRO|VITORIA|SALVADOR|SUAPE|PECEM|MANAUS|SAO FRANCISCO|IMBITUBA|SAO LUIS|BELEM|FORTALEZA|RECIFE|PORTO ALEGRE|FLORIANOPOLIS|CURITIBA|BRAZIL|BRASIL'
    THEN 'SEA IMPORT'
    WHEN COALESCE(MAX(ts.destino), '') = '' 
    THEN 'SEA IMPORT'
    ELSE 'SEA EXPORT'
  END
) as tipo_processo,
```

A expressão `REGEXP` cobre:
- Códigos UN/LOCODE brasileiros (padrão `BR` + 3 letras maiúsculas)
- Nomes das principais cidades portuárias do Brasil
- Strings contendo "BRAZIL" ou "BRASIL"
- Se destino vazio, assume importação como fallback

Mesma lógica será aplicada na linha 2241 (sync de candidatos).

Nenhuma outra alteração no arquivo.

