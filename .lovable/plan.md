## Diagnóstico

Processo **BRE-16429822** tem timeline com 5 eventos, ordem cronológica DESC: **ENTREGUE (23/04 17:06)** → BLOQUEIO (17/04 09:30) → RECEPCIONADO (17/04 03:05) → CHEGADA INFORMADA (16/04) → MANIFESTADO (11/04).

O detalhe está correto (mostra `Entregue` no header). O dashboard está errado em **dois pontos**:

### Bug 1 — Override de bloqueio sobrepõe o status final

`src/hooks/useCCTData.ts` linhas 256–266:

```ts
const hasBloqueio = (row.teve_bloqueio || '').trim() !== '' && !== 'sem retorno cct' && ...;
const finalStatus = hasBloqueio ? 'BLOQUEIO' : effectiveStatus;
```

Esse override é incondicional — ignora se o bloqueio já foi resolvido por eventos posteriores (RECEPCIONADO, ENTREGUE). Como `t_cct_dashboard_cache.teve_bloqueio` guarda o **histórico** ("teve" bloqueio em algum momento), o dashboard marca `BLOQUEIO` mesmo depois da entrega.

O detalhe (`ProcessoTimeline.tsx`, linha 71–75) **não** faz esse override — usa só `getLatestTimelineStatus(eventos)`. Por isso diverge.

A própria timeline já contém o evento `BLOQUEIO`, então o resolver detectaria bloqueio sozinho **se ele fosse o último evento**. Como há eventos posteriores (RECEPCIONADO + ENTREGUE), o status correto é `ENTREGUE`.

### Bug 2 — SLA não detecta cumprimento via eventos

`src/utils/cctSLA.ts` recebe `status: finalStatus` (que está corrompido para `BLOQUEIO`) e `dataManifestacao: null`. A função `isFulfilledByStatus('BLOQUEIO')` retorna `false` porque `BLOQUEIO` não está em `STATUS_ORDER`. Logo, calcula horas restantes a partir da decolagem (FRA, voo longo) e mostra `-308.5h VENCIDO`.

Mesmo se o `finalStatus` fosse corrigido para `ENTREGUE`, o SLA funcionaria pelo `STATUS_ORDER.ENTREGUE = 7 ≥ MANIFESTADA_INDEX`. Mas há um caso colateral: quando o status atual for `BLOQUEIO` legítimo (último evento), o SLA deveria considerar **se já houve manifestação anterior na timeline** para marcar `CUMPRIDO`. Hoje não considera.

## Mudança proposta (cirúrgica)

### Arquivo 1: `src/hooks/useCCTData.ts`

**Remover o override de bloqueio do status final.** Manter `hasBloqueio` apenas para alimentar `excecoes[]` (aba Exceções continua funcionando com o histórico).

- Linha 266: trocar
  ```ts
  const finalStatus: StatusCCTOficial = hasBloqueio ? 'BLOQUEIO' : effectiveStatus;
  ```
  por
  ```ts
  const finalStatus: StatusCCTOficial = effectiveStatus;
  ```

Resultado: status do dashboard passa a vir 100% da timeline (via `getLatestTimelineStatus`), igual ao detalhe. `BLOQUEIO` só aparece quando for o último evento real (o resolver já mapeia "Bloqueio" → `BLOQUEIO`).

### Arquivo 2: `src/hooks/useCCTData.ts` — passar evidência de manifestação ao SLA

Antes de chamar `computeSLAInfo` (linha 308), derivar:

```ts
const manifestadoEvent = eventos.find(e => {
  const s = (e.descricao || e.codigo_evento || '').toLowerCase();
  return s.includes('manifest') || s.includes('recepc') || s.includes('entreg')
      || s.includes('trans') || s.includes('transfer') || s.includes('troca');
});
const dataManifestacaoFromTimeline = manifestadoEvent?.data_hora_evento || null;
```

Passar `dataManifestacao: dataManifestacaoFromTimeline` para `computeSLAInfo`. Isso garante `CUMPRIDO` sempre que houver qualquer evento ≥ MANIFESTADA na timeline, mesmo que o status corrente seja `BLOQUEIO`.

### Arquivo 3: `.lovable/memory/cct/dashboard-cache-single-source.md`

Acrescentar:

> **Override de `teve_bloqueio` proibido como status final.** A coluna `teve_bloqueio` é histórica e alimenta APENAS a aba "Exceções". O status `BLOQUEIO` só deve ser exibido quando aparecer como último evento da timeline (já tratado pelo `cctStatusResolver`).
>
> **SLA — cumprimento por timeline.** `computeSLAInfo` deve receber `dataManifestacao` derivada do primeiro evento da timeline cujo código/descrição indique manifestação ou estágio posterior (manifest, recepc, transfer, troca, trans terre, entreg). Isso preserva o cumprimento de SLA mesmo quando o status corrente regrediu (ex.: bloqueio após manifestação).

## Resultado esperado para BRE-16429822

- Header dashboard: **Entregue** (igual ao detalhe).
- Badge SLA: **CUMPRIDO** (verde), substituindo `-308.5h`.
- Aba Exceções: continua mostrando "1" (bloqueio histórico preservado).
- Timeline do detalhe: inalterada, continua mostrando os 5 eventos.

## Casos cobertos

| Cenário | Antes | Depois |
|---|---|---|
| Entregue após bloqueio resolvido | BLOQUEIO + SLA vencido | ENTREGUE + CUMPRIDO |
| Bloqueio ativo (último evento) | BLOQUEIO | BLOQUEIO (resolver detecta) |
| Bloqueio ativo após manifestação anterior | BLOQUEIO + SLA vencido | BLOQUEIO + CUMPRIDO |
| Sem qualquer evento, só `teve_bloqueio` | BLOQUEIO | Fallback `situacao_portal_atual` ou `INFORMADA` (com exceção registrada) |

## Arquivos afetados

- `src/hooks/useCCTData.ts` (2 ajustes pontuais em `mapRowToProcessoCCT`)
- `.lovable/memory/cct/dashboard-cache-single-source.md` (acréscimo de regras)
