
Diagnóstico

- O problema não é mais só “soft delete”. O bug principal agora é que o fluxo de disputas está usando chaves diferentes para representar a mesma NF.
- Isso explica exatamente o que os logs mostraram:
  - `check_disputas_planilha`: `new=10, existing=0`
  - `import_disputas_planilha`: `0 new, 11 skipped`

Por que isso acontece

- No `check_disputas_planilha` (~3110-3156), o backend procura a disputa usando uma chave “simples”:
  - `COALESCE(NULLIF(documento,''), NULLIF(nd,''), NULLIF(numero_nf,''))`
  - e ainda usa `LIMIT 1`
- Já no `import_disputas_planilha` (~3237-3338), a importação processa todas as NFs do ND e usa outra chave:
  - `CONCAT(COALESCE(documento,''), '|', COALESCE(numero_nf,''))`
- No `get_disputas` (~2771-2795), a tela continua lendo/joinando pela chave simples.
- No front (`FinanceiroDisputa.tsx`), exclusão individual e em lote também enviam a chave simples (`r.doc_key`).

Resultado prático

```text
pré-check -> usa chave simples -> diz “novo”
importação -> usa chave composta -> acha registro antigo -> “skipped”
exclusão no front -> tenta apagar chave simples
t_fin_disputas -> continua com registro salvo na chave composta
```

Ou seja: as NFs seguem sendo ignoradas porque o sistema está inconsistente entre:
- checagem
- importação
- listagem da tela
- exclusão individual/em lote

Plano de correção

1. Padronizar uma chave canônica única para disputa em todo o fluxo.
   - A melhor candidata é a chave composta por NF, porque ela diferencia múltiplas NFs do mesmo ND.

2. Corrigir `check_disputas_planilha`.
   - Remover a lógica de `LIMIT 1` por ND.
   - Buscar todas as NFs do ND.
   - Verificar existência usando a mesma chave canônica da importação.

3. Corrigir `get_disputas`.
   - Fazer o `JOIN` com `t_fin_disputas` usando a mesma chave canônica.
   - Retornar `doc_key` no mesmo formato usado pela importação.
   - Assim o front passa a selecionar/excluir exatamente o mesmo identificador salvo no banco.

4. Corrigir exclusões e edições.
   - Atualizar `delete_disputa` e `bulk_delete_disputas` para apagar pela mesma chave canônica.
   - Atualizar também `update_disputa_observacoes`, `update_disputa_responsavel` e resolução para não criarem/alterarem registros com chave diferente.

5. Tratar legado já salvo.
   - Adicionar limpeza de registros antigos gravados com a chave antiga.
   - Na prática, durante importação/exclusão, procurar e remover tanto o formato antigo quanto o novo até a base ficar consistente.

6. Validar ponta a ponta.
   - Importar uma planilha com ND que tenha várias NFs.
   - Confirmar que todas aparecem na tela.
   - Excluir em lote.
   - Reimportar a mesma planilha.
   - Verificar que a contagem do pré-check bate com a contagem da importação.

Detalhes técnicos

- Arquivo principal: `supabase/functions/mariadb-proxy/index.ts`
- Pontos que precisam ser alinhados:
  - `case 'check_disputas_planilha'`
  - `case 'import_disputas_planilha'`
  - `case 'get_disputas'`
  - `case 'delete_disputa'`
  - `case 'bulk_delete_disputas'`
  - `case 'update_disputa_observacoes'`
  - `case 'update_disputa_responsavel'`

Resultado esperado

- A mesma NF passa a ter o mesmo identificador em todo o sistema.
- A exclusão em lote passa a realmente excluir o que foi importado.
- A reimportação deixa de marcar NFs como “ignoradas” por causa de registros antigos com outra chave.
