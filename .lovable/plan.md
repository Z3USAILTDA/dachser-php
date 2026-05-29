## Contexto

O AWB `045-20656764` aparece na tela como `FRA → GRU` (sem conexão, com status `RCF`). Você confirmou que o **valor correto em `t_fato_aereo` é `FRA → LIS → GRU`**.

Diagnóstico feito até agora:

- A edge function `fetch-tracking-aereo` lê de `t_fato_aereo` (`tdaf`) e, para este AWB, está devolvendo: `origin=FRA`, `destination=GRU`, `conexao=LIS`, `route_status=null`, `last_event=RCF`, `last_event_location=GRU`.
- O `route_status=null` indica que o "route map" autoritativo (CTE SQL pesada que roda em background) ainda não classificou esta rota — por isso caiu no fallback que usa `tdaf.origin`/`tdaf.destination` direto.
- Em `src/pages/air/TrackingAereo.tsx` existe uma segunda camada (`applyRouteFix`, linhas 396–472) que recalcula origem/destino a partir da `timeline_json` no cliente. Para este AWB a timeline mais antiga começa em `LIS` (eventos "Booking Confirmed"), então essa função pode estar sobrescrevendo o `FRA` autoritativo do banco por algo derivado da timeline — e/ou eliminando a conexão.
- A coluna "conexão" aparentemente não está sendo exibida na linha da tabela (o screenshot mostra só origin/destination).

Ou seja, há duas camadas de "correção de rota" rodando em sequência (SQL no servidor + `applyRouteFix` no cliente). Quando o backend já entrega o valor correto vindo de `t_fato_aereo`, a camada client está deturpando.

## Objetivo

Garantir que a tela Tracking Aéreo exiba **exatamente** o que está em `t_fato_aereo` (origin, destino, conexão e status), respeitando a regra "Tracking Truth: dados devem espelhar o DB precisamente".

## Mudanças

1. **Frontend — `src/pages/air/TrackingAereo.tsx`**
   - Remover/neutralizar a sobrescrita do `applyRouteFix` quando o backend já trouxe `origin` e `destination` válidos (i.e., não vazios). Manter o cálculo apenas como *fallback* para registros sem origin/dest no DB.
   - Em `mapItems` (linhas ~526–578), inverter a precedência:
     ```ts
     origem: item.origin || route.origin || "",
     destino: item.destination || route.destination || "",
     conexao: item.conexao ?? route.conexao ?? "",
     ```
   - Não tocar em status: `last_event` já vem do backend e segue intacto.

2. **Backend — `supabase/functions/fetch-tracking-aereo/index.ts`**
   - Confirmar que o fallback de leitura prefere `tdaf.origin`/`tdaf.destination` quando estão preenchidos (já é o caso: linha 1282–1283). Nenhuma mudança necessária aqui se o teste manual mostrar `FRA/GRU/LIS` consistentemente após o redeploy.

3. **Validação manual**
   - Após deploy, abrir a tela `Tracking Aéreo`, localizar `045-20656764` e confirmar `FRA / LIS / GRU` com status real do último evento.
   - Rodar um varredor pontual em alguns AWBs onde `tdaf.origin` e o "primeiro evento da timeline" são aeroportos diferentes (ex.: outros impostos com pré-rota terrestre/ferry) para confirmar que não introduzimos regressão. Vou comparar via console log temporário no cliente listando `awb / item.origin / route.origin / item.destination / route.destination` durante uma carga e remover o log no fim.

## Aspectos técnicos

- A função `applyRouteFix` foi originalmente criada para corrigir AWBs onde `t_fato_aereo` gravava `origin == destination` (caso documentado em comentário no edge function, linha 1278). Esse caso vai continuar sendo corrigido pelo backend (linhas 1284–1303 da edge function fazem exatamente isso). Portanto, podemos desativar com segurança o `applyRouteFix` do cliente quando o backend já entrega valores válidos.
- Nenhuma migration de banco. Nenhuma mudança em RLS. Mudança cirúrgica conforme a memória de projeto.
- Sem alteração no SQL pesado da CTE de `routeSql` (esse continua útil para AWBs com `tdaf.origin = tdaf.destination` ou nulos).

## Critérios de aceite

- `045-20656764` aparece na tela com `FRA / LIS / GRU` e status reflectindo o último evento real (`RCF` ou o que estiver em `t_fato_aereo`/timeline).
- Nenhum AWB que antes tinha rota correta passa a exibir rota errada (verificação por amostragem via console).
- Não exibimos banner/erro de conexão; comportamento silencioso preservado.
