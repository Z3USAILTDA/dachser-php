## Mudança no filtro de visibilidade de Demurrage

Em vez de exigir match exato MBL↔bl_number entre `t_dachser_demurrage_containers` e `t_dados_maritimo`, vamos restringir a visibilidade apenas pelo **prefixo do MBL do container de demurrage**, considerando os 13 armadores válidos:

```
HLCU, MEDU, ONEY, COSU, ZIMU, MAEU, SUDU,
CMAU, EISU, YMLU, HDMU, PCIU, WHLU
```

### Comportamento

- Remover o `EXISTS` em `t_dados_maritimo` adicionado anteriormente em todas as queries de demurrage.
- Adicionar em todas as queries de demurrage um filtro:
  ```sql
  UPPER(TRIM(dc.mbl)) LIKE 'HLCU%' OR
  UPPER(TRIM(dc.mbl)) LIKE 'MEDU%' OR
  ... (13 prefixos)
  ```
  (implementado como `LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU',...)` para performance/leitura).

### Arquivos afetados

`supabase/functions/mariadb-proxy/index.ts` — nas mesmas 9 actions já tocadas:
1. `demurrage_get_containers`
2. `demurrage_get_stats`
3. `demurrage_get_unique_clients`
4. `demurrage_get_unique_armadores`
5. `demurrage_get_pre_invoices` (sobre `shipment_mbl`)
6. `demurrage_get_alerts` (via join no container)
7. `demurrage_get_disputes` (via join no container)
8. `demurrage_get_dispute_stats` (via join no container)
9. `demurrage_get_containers_by_mbl` (guard por prefixo)

### Constante única

Definir no topo do arquivo:
```ts
const DEMURRAGE_MBL_PREFIXES = ['HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU'];
const DEMURRAGE_PREFIX_FILTER = `LEFT(UPPER(TRIM(dc.mbl)),4) IN (${DEMURRAGE_MBL_PREFIXES.map(p=>`'${p}'`).join(',')})`;
```
e reaproveitar nas 9 queries (com alias ajustado por contexto, ex.: `pi.shipment_mbl` em pre-invoices).

### Sem mudanças

- Sem alteração de schema.
- Sem alteração no frontend.
- Sem mexer em cálculos/SLA.
- Memória `mem://sea/demurrage-visibility-filter-dados-maritimo` será atualizada para refletir o novo critério (prefixo de armador, não `EXISTS` em `t_dados_maritimo`).

### Validação

- `curl` no `mariadb-proxy` para `demurrage_get_stats` e `demurrage_get_containers` e checar:
  - total > 6
  - todos os MBLs retornados começam com um dos 13 prefixos
  - prefixos fora da lista (ex.: `SZP%`, `0001%`) não aparecem
