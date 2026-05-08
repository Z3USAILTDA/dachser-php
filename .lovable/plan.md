## Problema

O frontend já libera o botão de "Importar SPO em Lote" para todos os usuários, mas o backend (`mariadb-proxy/index.ts`) ainda bloqueia com 403 "Acesso negado. Funcionalidade permitida apenas para ADMIN.", causando o erro `Edge Function returned a non-2xx status code` exibido na planilha.

## Causa

Em `supabase/functions/mariadb-proxy/index.ts` (linhas ~18098-18123), o bloco que trata as actions:
- `preview_voucher_batch_import`
- `create_voucher_batch_import`
- `upload_batch_document`
- `bind_batch_document_to_voucher`
- `unbind_batch_document`
- `get_batch_import_status`
- `finalize_batch_import`

faz uma checagem `is_admin = 1` em `t_users_dachser` e retorna 403 se não for admin.

## Mudança

Remover a checagem de `is_admin`, mantendo apenas a validação de que `requesterId` existe (usuário autenticado). O `adminUserName` passa a ser obtido do username do próprio usuário (sem exigir admin).

Pseudocódigo do trecho ajustado:

```ts
const requesterId = body.userId ?? body.user_id;
if (!requesterId) return 403 "Usuário não autenticado";

const userCheck = await client.query(
  'SELECT username FROM ai_agente.t_users_dachser WHERE id = ?',
  [requesterId]
);
if (!userCheck?.length) return 403 "Usuário não encontrado";

const adminUserName = body.user_name || userCheck[0].username || 'user';
```

Nenhuma outra alteração — fluxo, validações, gates de documentos e regras de promoção permanecem intactos.

## Arquivos

- `supabase/functions/mariadb-proxy/index.ts` (apenas o bloco de guard ADMIN, ~18105-18123)
