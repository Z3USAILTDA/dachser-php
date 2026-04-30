## Causa raiz

A action `login` cai no pool **DEFAULT** do `mariadb-proxy`, que após a migração aponta para o usuário restrito **`ops_dachser`**. Esse usuário não tem permissão na tabela de credenciais (banco financeiro `dados_dachser`), então o MariaDB devolve:

```
Access denied for user 'ops_dachser'@'<aws-host>' (using password: YES)
```

→ HTTP 500 → toast "Usuário ou Senha incorretos".

## Correção

Em `supabase/functions/mariadb-proxy/index.ts`, adicionar ao `FIN_ACTIONS` todas as actions de autenticação, sessão e gestão de usuários, para que usem o pool **`MARIADB_FIN_*`** (que tem acesso à tabela de credenciais):

- `login`, `logout`, `change_password`
- `forgot_password`, `verify_reset_code`, `reset_password`, `reset_password_by_email`
- `log_usage`, `get_active_connections`, `kill_active_connection`
- `get_user_by_email`, `get_users`, `create_user`, `update_user`, `delete_user`
- `reset_user_password`, `toggle_user_active`, `update_user_role`

Nenhuma outra mudança. Roteamento OPS/AIR/SEA/CHARGES permanece igual.

## Resultado esperado

- Login volta a funcionar imediatamente.
- "Esqueci a senha", troca de senha e gestão de usuários (admin) também voltam a funcionar.
