## Problema

A mudança anterior introduziu o estado `etapaFilterTouched` para destravar a visão restrita de role quando o usuário interage com o filtro de Etapa. Porém, o estado **só é setado quando o valor do filtro muda** (`newFilters.etapa !== filters.etapa`).

O valor inicial de `filters.etapa` é `"all"`. Quando um usuário FISCAL abre a tela e clica em **"Todas Etapas"** no select, o valor selecionado também é `"all"` — ou seja, igual ao valor anterior. Resultado: `etapaFilterTouched` permanece `false`, a restrição de role não é desligada, e o usuário continua sem ver os cards `A_PROCESSAR` e o restante do pipeline.

## Causa raiz

`EsteiraIndex.tsx`, callback `onFilterChange` do `<VoucherTable>` (~linha 2181):

```ts
if (newFilters.etapa !== filters.etapa) setEtapaFilterTouched(true);
```

Essa condição assume que selecionar "Todas Etapas" muda o valor — mas como `"all"` já é o default, não muda nada na primeira interação.

## Correção (cirúrgica, 1 arquivo)

**Arquivo:** `src/pages/esteira/EsteiraIndex.tsx`

Trocar o callback do `<VoucherTable>` para marcar `etapaFilterTouched = true` **sempre que o usuário tocar no filtro de etapa**, comparando contra o estado anterior do `newFilters` em vez de usar uma condição de mudança de valor. Como `VoucherTable` chama `onFilterChange` apenas quando o usuário interage com algum filtro, basta detectar que `newFilters.etapa` foi explicitamente fornecido e marcar como tocado.

Mudança no callback (~linha 2181):

```ts
onFilterChange={(newFilters) => {
  // Qualquer chamada vinda do VoucherTable significa interação manual.
  // Se a chave 'etapa' está presente no payload, considere o filtro de etapa "tocado",
  // mesmo que o valor escolhido seja igual ao default ("all").
  if (Object.prototype.hasOwnProperty.call(newFilters, "etapa")) {
    setEtapaFilterTouched(true);
  }
  setFilters(newFilters);
  setDrillDownFilter("all");
}}
```

Como o `VoucherTable` sempre envia o objeto inteiro de filtros (spread `{ ...filters, etapa: v }`), a chave `etapa` está sempre presente. Isso poderia ser muito agressivo (qualquer mudança em qualquer filtro destravaria role).

**Solução mais precisa:** envolver o `<Select>` de etapa para detectar a interação. Como o select de etapa fica dentro do `VoucherTable`, a forma mais limpa sem refatorar é manter a comparação por valor, mas também marcar como tocado quando o usuário **abre/seleciona** o select com o mesmo valor. Para evitar mexer em `VoucherTable`, ajustar a heurística:

```ts
onFilterChange={(newFilters) => {
  // Marca como tocado se: (1) valor mudou, OU (2) o usuário escolheu "all" 
  // explicitamente após não ter tocado ainda (caso típico do FISCAL que 
  // abre a tela e clica em "Todas Etapas")
  if (newFilters.etapa !== filters.etapa || (!etapaFilterTouched && newFilters.etapa === "all")) {
    setEtapaFilterTouched(true);
  }
  setFilters(newFilters);
  setDrillDownFilter("all");
}}
```

Isso resolve o caso reportado sem afetar os demais.

**Alternativa mais robusta** (recomendada): não depender de "tocar" o filtro. Em vez disso, **sempre** mostrar o pipeline completo quando `filters.etapa === "all"` para qualquer role — voltando à lógica anterior, mas invertida: a restrição de role só se aplica quando o usuário **não** está pedindo "todas".

```ts
// Em roleFilteredVouchers (linha 1235), trocar:
if (etapaFilterTouched) return vouchers;
// por:
if (filters.etapa === "all") return vouchers;
```

E **remover** todo o estado `etapaFilterTouched` (declaração ~linha 609, set no callback, set no "Limpar Todos", e da lista de dependências do `useMemo`).

**Trade-off:** com essa alternativa, a "visão padrão restrita ao role" deixa de existir — qualquer usuário sempre verá o pipeline completo por default. Se isso for aceitável, é a solução mais simples e sem ambiguidade.

## Recomendação

Ir com a **alternativa robusta**: `if (filters.etapa === "all") return vouchers;` e remover `etapaFilterTouched`. Razão: o comportamento "restringir por role na visão default" estava criando confusão, e a regra fica clara — "Todas Etapas" mostra todas, qualquer outra etapa mostra só ela.

## Comportamento resultante (alternativa robusta)

| Ação | FISCAL puro vê | SUPERVISOR puro vê |
|---|---|---|
| Abre a tela (etapa = "all" default) | pipeline completo, inclusive `A_PROCESSAR` | pipeline completo |
| Seleciona etapa específica (ex: "FISCAL") | só FISCAL | só aquela etapa |
| Clica "Limpar Todos" → volta a "all" | pipeline completo de novo | pipeline completo |

Permissões de ação (editar/deletar/aprovar) seguem inalteradas.

## Memória

Atualizar `mem://vouchers/ui-spec-and-access-v4` removendo a regra de "etapa filter touch bypass" e substituindo por:

> A visibilidade da grid é controlada pelo filtro de Etapa: quando `filters.etapa === "all"`, qualquer role vê o pipeline completo (inclusive cards virtuais `A_PROCESSAR` vindos do RM); quando uma etapa específica é selecionada, mostra apenas vouchers daquela etapa. Permissões de ação continuam controladas por role.
