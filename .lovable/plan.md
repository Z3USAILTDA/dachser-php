
Diagnóstico

O cadastro não está falhando. O que falha é a releitura imediata da lista logo depois do cadastro.

Evidências que encontrei:
- `18:25:14` — `client-freetime-crud` `action:"create"` respondeu `200` e criou o registro
- `18:25:15` — a chamada `action:"list"` respondeu `503` com `max_user_connections`
- `18:25:15` — `demurrage-recalc` respondeu `200`
- `18:25:19` e `18:25:21` — novas chamadas `action:"list"` responderam `200`
- Nessas respostas de sucesso, o registro novo já aparece com `tipo_conteiner:"20DV,40RF"`

Ou seja: o dado foi salvo no banco; o erro aconteceu na atualização da tela logo em seguida.

Do I know what the issue is? Sim.

Causa raiz

Há 2 problemas combinados:

1. Explosão de chamadas logo após salvar
- `useCreateClientFreeTime` já faz `invalidateQueries(['client-free-time'])`
- a página `DemurrageFreeTimes.tsx` ainda chama `refetch()` manualmente no `onSuccess`
- a mesma página dispara `recalcMutation.mutate()` logo em seguida
- resultado: após um único cadastro, a aplicação abre várias operações quase ao mesmo tempo contra o MariaDB

2. O retry do backend está no lugar errado
- em `supabase/functions/client-freetime-crud/index.ts`, o retry atual envolve `new Client().connect()`
- mas o erro registrado ocorre em `Client.query`, não no `connect`
- o stack mostra `ConnectionPool.pop` / `Client.query`, então o driver está tentando pegar conexão efetivamente na hora do `query/execute`
- por isso, mesmo com `connectWithRetry`, a função ainda pode estourar `max_user_connections` na primeira query real

Arquivos envolvidos
- `src/pages/demurrage/DemurrageFreeTimes.tsx`
- `src/components/demurrage/DemurrageFreeTimeDialog.tsx`
- `src/hooks/useClientFreeTime.ts`
- `src/hooks/useDemurrageData.ts`
- `supabase/functions/client-freetime-crud/index.ts`
- secundariamente: `supabase/functions/demurrage-recalc/index.ts`

Plano de correção

1. Eliminar refresh duplicado na tela de Free Time
- remover o `refetch()` manual do `onSuccess` em `DemurrageFreeTimes.tsx`
- deixar a lista atualizar por um único caminho: `invalidateQueries` do hook
- isso reduz uma chamada extra de `list` imediatamente após o `create`

2. Serializar a recalculação
- não disparar `demurrage-recalc` em paralelo com o refresh da lista
- executar a recalculação só depois que a atualização da lista terminar, ou desacoplar isso para rodar em segundo plano
- isso evita concorrência entre `client-freetime-crud` e `demurrage-recalc` no mesmo instante

3. Corrigir a resiliência real no backend
- criar helpers como `queryWithRetry` e `executeWithRetry` dentro de `client-freetime-crud`
- envolver todos os `client.query(...)` e `client.execute(...)` com retry para `max_user_connections`, `Too many connections`, `ETIMEDOUT`, `Connection reset`
- manter `close()` em `finally`/cleanup seguro
- isso resolve o ponto onde o erro realmente acontece hoje

4. Evitar multiplicação de retries no frontend
- `useClientFreeTime.ts` já tem `invokeWithRetry`
- reduzir ou desabilitar o retry automático adicional do React Query nessa listagem, para não transformar 1 erro transitório em várias rajadas de requests
- objetivo: manter retry suficiente, mas sem amplificar carga

5. Aplicar o mesmo padrão em `demurrage-recalc`
- essa função já teve o mesmo erro antes
- embora neste caso ela tenha respondido `200`, vale alinhar a mesma estratégia de retry no ponto de `query/execute`
- assim os dois fluxos ficam consistentes

Resultado esperado após a correção
- o cadastro continua salvando normalmente
- a tela atualiza sem gerar rajada desnecessária de conexões
- erros 503 por `max_user_connections` caem drasticamente
- quando houver pico momentâneo, o retry passa a atuar no ponto correto da falha

Resumo objetivo
Hoje o problema não é “o create falhou”. O problema é: depois do create, a tela dispara leituras/recalculo em sequência/paralelo, e o `client-freetime-crud` ainda não faz retry no ponto onde a conexão realmente é consumida (`query/execute`).
