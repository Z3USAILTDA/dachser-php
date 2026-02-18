
# Aplicar filtro de logs do "admin" para o usuário "metricas"

## Contexto

O filtro de visibilidade já existe e está implementado na action `get_metrics` do `mariadb-proxy`. Ele usa dois arrays:

- `DACHSER_ADMIN_USERS` — usuários que **não** veem os logs dos usuários ocultos
- `HIDDEN_LOG_USERS` — usuários cujos logs são ocultados (`["admin", "teste.test3"]`)

Atualmente `DACHSER_ADMIN_USERS` contém apenas: `["ana.tozzo", "danilo.pedroso", "teste.test3"]`.

O usuário `metricas` acessa a tela via flag `metrics_only = 1`, e já envia `requesterUsername` corretamente no body da chamada — só falta incluí-lo no array de filtro.

Há também um segundo ponto de atenção: a action `get_metric_users` (que popula o dropdown de seleção de usuário nos filtros) **não aplica nenhum filtro** — ou seja, mesmo que os logs de `admin` sejam ocultados na tabela principal, o usuário `metricas` ainda veria `"admin"` como opção no dropdown. Isso precisa ser corrigido também.

---

## Alterações necessárias

### `supabase/functions/mariadb-proxy/index.ts`

**Ponto 1 — `get_metrics` (linha 608):**

Adicionar `"metricas"` ao array `DACHSER_ADMIN_USERS`:

```typescript
// Antes:
const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3"];

// Depois:
const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3", "metricas"];
```

**Ponto 2 — `get_metric_users` (linha 723):**

A action atualmente faz um `SELECT DISTINCT username` sem nenhum filtro. Precisamos:

1. Receber o `requesterUsername` do body
2. Se o requester estiver em `DACHSER_ADMIN_USERS`, excluir `HIDDEN_LOG_USERS` da query

```typescript
case 'get_metric_users': {
  const { requesterUsername } = body;
  const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3", "metricas"];
  const HIDDEN_LOG_USERS = ["admin", "teste.test3"];
  
  const isDachserUser = requesterUsername && DACHSER_ADMIN_USERS.includes(requesterUsername);
  
  let usersQuery = `SELECT DISTINCT username FROM ai_agente.t_dachser_usage_logs`;
  let usersParams: string[] = [];
  
  if (isDachserUser) {
    usersQuery += ` WHERE username NOT IN (${HIDDEN_LOG_USERS.map(() => '?').join(', ')})`;
    usersParams = [...HIDDEN_LOG_USERS];
  }
  
  usersQuery += ` ORDER BY username ASC`;
  
  const usersResult = await client.query(usersQuery, usersParams);
  const users = usersResult.map((row: { username: string }) => row.username);
  result = { success: true, users };
  break;
}
```

### `src/pages/MetricsUsage.tsx`

O `requesterUsername` já é enviado corretamente na chamada `get_metrics` (linha 143). Porém, a chamada `get_metric_users` (linha 96) ainda não envia o `requesterUsername`. Precisamos passá-lo:

```typescript
const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
  body: {
    action: "get_metric_users",
    requesterUsername: parsedUser?.username,  // NOVO
  },
});
```

Como o `fetchAvailableUsers` roda no primeiro `useEffect` (antes do `user` ser setado), a chamada precisa ser movida para dentro do segundo `useEffect` que depende de `user`, ou ler o username diretamente do `localStorage` dentro do fetch — tal como já é feito em outros hooks do projeto.

---

## Resumo do impacto

| Quem acessa | Vê logs de "admin"? | Vê "admin" no dropdown? |
|---|---|---|
| `ana.tozzo`, `danilo.pedroso`, `teste.test3` | Não (já existente) | Não (ponto 2 corrige) |
| `metricas` | Não (ponto 1 corrige) | Não (ponto 2 corrige) |
| Outros admins internos (ex: z3us) | Sim | Sim |

## Arquivos a editar

- `supabase/functions/mariadb-proxy/index.ts` — duas alterações cirúrgicas nas actions `get_metrics` e `get_metric_users`
- `src/pages/MetricsUsage.tsx` — passar `requesterUsername` na chamada `get_metric_users`
