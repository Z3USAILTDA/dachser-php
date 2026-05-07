## Objetivo

Evitar o erro 500 `Duplicate entry '...' for key 'uq_voucher_rm_spo'` no `create_voucher_batch_import` detectando, **antes do envio**, linhas da planilha que repetem o par `id_rm + numero_spo` (ou `id_rm + spo` quando ainda não há `numero_spo` resolvido). Linhas duplicadas devem aparecer como **ERROR** no preview, com mensagem clara, e ficar de fora da seleção elegível para criação.

## Diagnóstico

A planilha do usuário traz o mesmo SPO em múltiplas linhas de "Quebra" (ex.: `105-292848 DIM-BY` aparece nas Quebras 2 e 4). Como `t_vouchers` tem índice único `uq_voucher_rm_spo` em `(id_rm, numero_spo)`, a 1ª inserção passa e a 2ª aborta o batch inteiro.

A validação atual em `BatchImportVoucherDialog.validate` é **por linha** — não enxerga colisões cruzadas. Precisamos de uma passada **cross-row** que conte ocorrências do par chave e marque a 2ª+ como duplicada.

## Mudanças

### 1. `src/components/esteira/BatchImportPreviewTable.tsx`
- Adicionar à interface `PreviewItem`:
  ```ts
  id_rm?: string | number | null;
  is_duplicate?: boolean;
  duplicate_of_row?: number | null;
  ```

### 2. `src/components/esteira/BatchImportVoucherDialog.tsx`

**a) Nova função `markDuplicates(list)`** (helper puro):
- Constrói um `Map<string, number[]>` indexando por `${id_rm ?? ''}|${(spo||'').trim().toUpperCase()}`.
- Ignora chaves vazias (`!id_rm || !spo`).
- Para cada grupo com `length > 1`: a primeira linha permanece como está; as demais recebem:
  - `is_duplicate = true`
  - `duplicate_of_row = <row_index da primeira>`
  - `status = "ERROR"`
  - `validation_message` ganha o sufixo `"SPO duplicado nesta planilha (linha #X já usa o mesmo SPO+RM)"` (preservando mensagens existentes).
- Linhas únicas: `is_duplicate = false`, `duplicate_of_row = null` (sem alterar status).

**b) Aplicar `markDuplicates` em três pontos**:
- Após `setItems(it)` no `handleFile` (envolver: `setItems(markDuplicates(it))`).
- No final de `applyFillAndContinue`, depois do `prev.map(... validate)`: `return markDuplicates(updated)`.
- No final de `applyBulk` e em qualquer outro `setItems(prev => ... )` que rode `validate` (procurar todos os pontos onde `validate` é chamado — incluir o salvar do `BatchImportRowEditor` via `onSave`).

Para centralizar, criar:
```ts
const revalidate = (list: any[]) => markDuplicates(list.map(validate));
```
e substituir os locais que hoje fazem `prev.map(it => validate(...))` por `revalidate(prev.map(...))`.

**c) Bloquear envio de duplicatas** (defense-in-depth):
- Onde monta o payload de `create_voucher_batch_import`, filtrar itens com `is_duplicate === true` (não devem ir mesmo se o usuário marcar). Se um selecionado for duplicado, exibir toast: "Existem SPOs duplicados na seleção. Remova-os ou edite o SPO antes de criar o lote."

### 3. `src/components/esteira/BatchImportPreviewTable.tsx` — UI de duplicata
- Na linha do preview, quando `is_duplicate`, adicionar um pequeno badge vermelho ao lado do SPO: `Duplicado` (tooltip: "Mesma combinação SPO + RM da linha #X").
- A linha já vai aparecer como ERROR pelo `status`; o badge só ajuda o usuário a localizar visualmente.

### 4. `src/components/esteira/BatchImportRowEditor.tsx`
- Sem mudança funcional. O usuário pode editar o SPO; ao salvar, `revalidate` roda novamente e a duplicata se desfaz se o conflito for resolvido.

## Fora de escopo

- **Sem mudanças no `mariadb-proxy`**: o handler continua intacto; a defesa é no frontend (preview).
- Sem mudanças de schema ou no índice único.
- Não tratar duplicidade contra o que **já existe no banco** (o handler já retornaria erro se isso ocorresse — o caso reportado é duplicidade dentro da própria planilha).
- Sem alteração nas regras automáticas de urgência/etapa.

## Critérios de aceite

1. Subir a mesma planilha que disparou o erro: linhas com SPO `105-292848 DIM-BY` (Quebras 2 e 4), `105-292847 DIM-BY` (3 e 5), etc. devem aparecer como ERROR no preview com mensagem `"SPO duplicado nesta planilha"`.
2. O contador de erros no header do preview reflete o aumento.
3. Tentar criar o lote ignorando o aviso (selecionando uma duplicata) é bloqueado por toast — não chega a chamar o edge function.
4. Editar o SPO de uma das duplicatas no `BatchImportRowEditor` e salvar → o badge some e o `status` volta a `VALID` (se demais campos OK).
5. Planilhas sem duplicatas seguem fluxo normal sem regressão.
