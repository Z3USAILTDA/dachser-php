## Causa raiz

`/fin/disputa` quebra com `TypeError: Cannot read properties of null (reading 'toLocaleString')` em `formatMoney` (`src/pages/FinanceiroDisputa.tsx:204`).

A função assume `val: number` não-nulo:

```ts
const formatMoney = (val: number) =>
  "R$ " + val.toLocaleString("pt-BR", { ... });
```

Mas o log do edge function mostra:
`Disputas CR loaded: 81 (nova=0, legado_casado=28, orfao=53)` — 53 linhas "órfãs" (sem casamento na `v_fin_regua_contas_receber`). Para essas linhas, campos numéricos como `valor` vêm `null` do backend, e o render na linha 1383 chama `formatMoney(r.valor)` direto, estourando.

Esse é o erro pré-existente herdado do cutover (Fase 5.1 já citou que disputas órfãs aparecem sem dados financeiros) — agora ele virou crash porque o número de órfãos cresceu na nova carga.

## Correção proposta (cirúrgica)

Tornar `formatMoney` resiliente a `null`/`undefined`/`NaN`, sem alterar nenhum outro fluxo, layout, texto ou endpoint.

**Arquivo alterado**: somente `src/pages/FinanceiroDisputa.tsx`, linhas 203-205.

```ts
const formatMoney = (val: number | null | undefined) => {
  const n = typeof val === "number" && Number.isFinite(val) ? val : 0;
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
```

Comportamento:
- Linhas órfãs (valor `null`) exibem `R$ 0,00` em vez de quebrar a tela.
- Nenhum efeito em linhas com valor numérico válido.
- Nenhuma alteração no backend, view, endpoints `_cr`, ou demais módulos.

## Fora de escopo

- Não tratar o problema de fundo das 53 disputas órfãs (já registrado como pendência da migração).
- Não alterar `vencimento`, `data_emissao`, datas, ou qualquer outro formatter.
- Não tocar em endpoints, view, RLS, layout, textos, rotas, permissões.

## Rollback

Reverter as 3 linhas alteradas em `formatMoney`.

## Validação após implementação

1. Recarregar `/fin/disputa` — tela carrega sem ErrorBoundary.
2. Conferir que linhas com `valor` válido continuam formatadas corretamente.
3. Conferir que linhas órfãs exibem `R$ 0,00` sem quebrar.
4. Console limpo de `Cannot read properties of null`.
