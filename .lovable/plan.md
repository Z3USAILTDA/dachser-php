
## Diagnóstico (causa real do problema)

A tela `/fin/disputa`, ao adicionar uma disputa via modal:

1. Chama `lookup_documento_cr` (mariadb-proxy:3548) passando o ND/NF/documento digitado.
2. A query roda contra `dados_dachser.v_fin_regua_contas_receber` e pode retornar **N linhas** quando uma mesma ND está vinculada a múltiplas NFs / parcelas (cada linha = um `doc_key` distinto, formado por `documento|numero_nf`).
3. `FinanceiroDisputa.tsx:253` pega **apenas `lookupRows[0].doc_key`** e chama `save_disputa_cr` só para essa primeira linha.

Resultado: só uma das NFs daquela ND vira disputa em `ai_agente.t_fin_disputas`. As demais NFs continuam "limpas" no contas a receber e entram normalmente no disparo de cobrança — exatamente o sintoma relatado.

O `save_disputa_cr` em si está correto (lê título da view, grava cliente/vencimento/valor/tipo, faz insert ou update por `nf = doc_key`). O bug é a tela mandar gravar só 1 dos N.

A importação por planilha (`import_disputas_planilha_cr`) já trata corretamente todos os doc_keys de uma ND — confirma que a regra de negócio esperada é "uma ND = todas as suas NFs em disputa".

## Mudança

Corrigir a gravação da disputa para cobrir **todas** as linhas retornadas pelo lookup, mantendo idempotência.

### Backend (`supabase/functions/mariadb-proxy/index.ts`)

Adicionar nova ação `save_disputa_cr_bulk` que recebe um array de `doc_keys` (mais `responsavel`, `observacoes`, `departamento`, `escalation`) e, em transação por item, executa o mesmo insert/update já presente em `save_disputa_cr` para cada `doc_key`. Retorna `{ success, inserted, updated, failed: [{doc_key, message}] }`.

Não alterar `save_disputa_cr` atual (continua servindo para chamadas single — `bulk_resolve`, edições por linha, etc.).

### Frontend (`src/pages/FinanceiroDisputa.tsx`, função `handleAddDispute` ~ linhas 233–281)

Substituir:

```ts
const docKey = lookupRows[0].doc_key;
await invoke("save_disputa_cr", { doc_key: docKey, ... });
```

por:

```ts
const docKeys = lookupRows.map(r => r.doc_key).filter(Boolean);
await invoke("save_disputa_cr_bulk", { doc_keys: docKeys, responsavel, observacoes });
```

Ajustar o toast para mostrar quantos títulos entraram em disputa:
- 1 título → "Disputa adicionada"
- N>1 → "N títulos da ND `<ND>` colocados em disputa"

Em caso de `failed.length > 0`, exibir aviso com a contagem e logar os erros no console; não bloquear o fluxo.

## Fora de escopo

- Disparo de e-mail / régua / `regua-send-emails` — intocados.
- View vs tabela base — sem mudança.
- Schema de `t_fin_disputas` — sem mudança.
- Demais ações (`resolve`, `delete`, `bulk_*`, importação por planilha, edição de observação/responsável) — sem mudança.

## Validação

1. Pegar uma ND real que hoje tem ≥2 NFs no contas a receber.
2. Adicionar disputa pela tela usando essa ND.
3. Confirmar no log do edge function: `[save_disputa_cr_bulk] nd_count=N inserted=X updated=Y failed=0`.
4. Recarregar `/fin/disputa` e confirmar que **todas** as NFs daquela ND aparecem listadas como em disputa.
5. Repetir a operação (clicar adicionar de novo na mesma ND) e confirmar idempotência: `inserted=0 updated=N`.
6. Resolver/excluir uma das linhas e confirmar que as demais permanecem.
