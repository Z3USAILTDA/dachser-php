## Problema

O AWB **996-14374721** não exibe a conexão na rota. A causa raiz está em `supabase/functions/fetch-tracking-aereo/index.ts:1486`:

```ts
const rawConexao = routeEntry ? (routeEntry.conexoes || null) : conexao;
```

Quando o `routeEntry` (do cache `air_tracking_cache.route`, alimentado pela CTE SQL) existe mas tem `conexoes = null` — situação comum quando o aeroporto de trânsito não é resolvido nos LEFT JOINs com `t_iata_airports` — o `conexao` extraído via JS (que varre o timeline completo, linhas 1392-1426) é **descartado silenciosamente**. Resultado: backend devolve `conexao: null` e o frontend não renderiza o nó de conexão.

## Correção

**Arquivo:** `supabase/functions/fetch-tracking-aereo/index.ts` (linha 1486)

Trocar:
```ts
const rawConexao = routeEntry ? (routeEntry.conexoes || null) : conexao;
```
Por:
```ts
const rawConexao = (routeEntry?.conexoes) || conexao;
```

Isso faz o `conexao` extraído via JS funcionar como fallback quando o `routeEntry` existe mas a CTE não conseguiu resolver o IATA do aeroporto de trânsito. Custo zero — `conexao` já é calculado logo acima.

## Validação

1. Deploy da edge function `fetch-tracking-aereo`.
2. Forçar refresh do cache de rota e checar a resposta para `996-14374721` — deve voltar com `conexao` preenchida.
3. Confirmar visualmente que o nó de conexão aparece na linha do AWB na tela de Tracking Aéreo.

## Fora de escopo

- Não vamos mexer na CTE SQL nem na tabela `t_iata_airports` agora — fix mínimo e cirúrgico conforme preferência registrada em memória. Se outros AWBs tiverem o mesmo sintoma, o fallback JS já cobre.
