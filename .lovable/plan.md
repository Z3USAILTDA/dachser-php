

## Corrigir resolução de eventos null no SQL do `fetch-tracking-aereo`

### Diagnóstico

O retorno do select mostra que para o AWB `016-06977736`, os campos `penultimo_des/code/evento`, `antepenultimo_des/code/evento` e `antes_antepenultimo_des/code/evento` vêm **todos null**, mesmo tendo descrições válidas na timeline.

**Causa raiz**: As descrições da `t_fato_aereo` vêm no formato `"Documents Delivered, qty: 11, weight: 166.1"` — sem prefixo `(CODE)` e com sufixo `, qty: ...`. A lógica atual tenta:

1. Extrair código do prefixo `(...)` → falha (não existe prefixo)
2. Fallback via `t_description_eventos` com `b.desc1 LIKE concat(d.description, '%')` → falha porque `"Documents Delivered, qty: 11, weight: 166.1"` começa com `"Documents Delivered"`, mas `t_description_eventos` provavelmente só tem `"Delivered"` (que não bate no início da string)

O `desc0` ("Delivered, qty: 11, weight: 166.1") funciona porque `tde.description = b.desc0` faz match direto no join externo com `t_description_eventos`, e "Delivered" bate com `LIKE 'Delivered%'`. Mas "Documents Delivered" não começa com nenhuma entrada da tabela.

### Solução

Adicionar um terceiro nível de fallback nos subselects: além de tentar o prefixo `(CODE)` e o LIKE direto, também tentar o LIKE contra o texto **antes da primeira vírgula** (`substring_index(b.descN, ',', 1)`). Isso transforma `"Documents Delivered, qty: 11, weight: 166.1"` em `"Documents Delivered"` para matching.

A alteração é mínima — em cada subselect de fallback via `t_description_eventos`, trocar:

```sql
where b.desc1 like concat(d.description, '%')
```

Por:

```sql
where b.desc1 like concat(d.description, '%')
   or substring_index(b.desc1, ',', 1) like concat(d.description, '%')
```

Isso se aplica aos 12 subselects (3 campos × 4 posições: penultimo, antepenultimo, antes_antepenultimo, e o ultimo_evento).

### Arquivo alterado

**`supabase/functions/fetch-tracking-aereo/index.ts`** — somente os subselects de fallback dentro do bloco SQL (linhas 48-269). Nenhum outro arquivo tocado.

### O que NÃO muda

- Estrutura do select (mesmas colunas, mesmos aliases)
- Código JS de normalização (linhas 277-339)
- Nenhum outro arquivo, hook, componente ou tela
- Prioridade de resolução: prefixo `(CODE)` primeiro, depois `t_description_eventos`

