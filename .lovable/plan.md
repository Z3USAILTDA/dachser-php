## Problema

Os eventos vêm de `t_tracking_sea_history` por container — quando um MBL tem N containers, cada evento "real" do navio aparece N vezes (mesma data/hora, mesmo `event_code`, mesma `location`, mesma `event_description`), variando só o campo `container`. Na tela isso vira a duplicação visível no print (DCH 2x, TSP 2x, ARR 2x, CRG 4x para 2 containers etc.). Além disso, a linha agregada (índice 0) e a primeira linha de histórico (índice 1) podem representar exatamente o mesmo evento de containers diferentes.

## Solução (frontend, cirúrgica)

Deduplicar `mblEvents` antes de renderizar, sem mexer em edge function nem em banco.

### Mudança única em `src/pages/ContainerTracking.tsx`

Dentro do bloco da sub-tabela expandida (linhas ~2807-2856), criar uma versão deduplicada dos eventos antes de calcular `latestEv` e `histRows`:

```ts
// chave de unicidade do evento (ignora o container)
const dedupKey = (e: any) => [
  e.event_datetime ?? '',
  (e.event_code ?? '').toUpperCase(),
  (e.event_description ?? '').toUpperCase().trim(),
  (e.location ?? '').toUpperCase().trim(),
].join('|');

const dedupedEvents = (() => {
  const map = new Map<string, any>();
  for (const ev of mblEvents) {
    const k = dedupKey(ev);
    const prev = map.get(k);
    if (!prev) {
      // mantém o evento + lista de containers que o produziram
      map.set(k, { ...ev, containers: ev.container ? [ev.container] : [] });
    } else if (ev.container && !prev.containers.includes(ev.container)) {
      prev.containers.push(ev.container);
    }
  }
  return Array.from(map.values()); // já vem ordenado DESC do backend
})();

const latestEv = dedupedEvents[0];
const histRows = dedupedEvents.slice(1);
```

Na coluna `Container` das linhas históricas, se `ev.containers?.length > 1`, mostrar todos como chips (mesmo padrão da linha agregada), em vez do `ev.container` único. Se for apenas 1, manter o comportamento atual.

### Critério de aceite

- Cada evento aparece **uma única vez** na sub-tabela, mesmo quando o MBL tem múltiplos containers.
- A coluna `Container` da linha histórica lista todos os containers que tiveram aquele evento (chips), igual à linha agregada quando aplicável.
- A linha agregada não duplica o evento mais recente como primeira linha de histórico.
- Ordem cronológica decrescente e todas as outras colunas permanecem iguais.

### Não muda

- `get_tracking_history` / `get_sea_tracking` / qualquer SQL.
- Estrutura/colunas da sub-tabela.
- `fetchMblContainers`, `VesselFinderMap`, paginação, filtros.
