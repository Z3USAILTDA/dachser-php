

## Diagnóstico
Na tela `/air/tracking-aereo`, a coluna **Rota** nunca destaca conexão (escala) porque o backend **não envia o campo `conexao`** no payload. O frontend (`TrackingAereo.tsx` linha 803) lê `awb.conexao`, que é sempre `undefined` → `conexoes = []` → nenhum aeroporto intermediário é renderizado.

A correção anterior foi feita na função errada: `fetch-status-aereo` (usada pelo dashboard `/air/tracking`). A tela `/air/tracking-aereo` consome **`fetch-tracking-aereo`**, que monta o objeto `normalized` (linhas 754–779 de `index.ts`) com apenas `origin`/`destination` — sem `conexao`. Confirmado pelo network log: payload retornado tem `origin`, `destination`, mas zero campo `conexao`.

## Causa raiz
`supabase/functions/fetch-tracking-aereo/index.ts` (linhas 754–779):
- Não extrai aeroportos intermediários do `timeline_json`.
- Não popula `conexao` na resposta.
- A timeline já vem completa (vide network response: eventos com `location: "MIA"`, `"DFW"`, etc. para AWB com origem PVG / destino GRU — ou seja, MIA e DFW são escalas reais que deveriam aparecer).

Exemplo concreto do payload atual (AWB 001-23076616, PVG→GRU):
- Timeline contém eventos em **MIA** e **DFW** (escalas reais).
- Resposta atual: `origin:"PVG"`, `destination:"GRU"`, sem `conexao` → frontend mostra só `PVG → GRU`.
- Esperado: `conexao:"DFW,MIA"` → frontend mostra `PVG → DFW → MIA → GRU`.

## Correção (cirúrgica)

### 1. `supabase/functions/fetch-tracking-aereo/index.ts` — adicionar extração de conexões antes do `normalized`

Inserir, logo antes da linha 754 (`const normalized = {...}`), um bloco que percorre `timeline` em ordem cronológica (mais antigo → mais recente) e coleta IATAs distintos da rota física, removendo origem e destino:

```ts
// Extract intermediate airports (conexões) from timeline
const originIATA = extractIATA(row.ORIGEM || "");
const destinIATA = extractIATA(row.DESTINO || "");
const stopWords = new Set([
  'NIL','NIF','DIS','OFD','OFL','BUP','RDP','LAT','TKG','SCR','ECC',
  'TFD','TRM','RFC','DMG','RET','AWB','PRE','DEP','ARR','RCF','RCS',
  'MAN','NFD','DLV','POD','BKD','FOH','AWD','CCD','ASN','MOV',
  // event prefixes that may appear standalone
]);

const seenAirports: string[] = [];
const seenSet = new Set<string>();

if (timeline && timeline.length > 0) {
  // Iterate chronologically (timeline is DESC; reverse to ASC)
  const chronological = [...timeline].reverse();
  for (const evt of chronological) {
    const candidates: string[] = [];
    const loc = extractIATA(evt.location || "");
    if (loc) candidates.push(loc);

    const desc = (evt.description || "").toUpperCase();
    // "<EVT> <AAA>" pattern (DEP MAD, RCF GRU)
    const evtPrefix = desc.match(/^\s*(?:DEP|ARR|RCF|RCS|MAN|NFD|DLV|TRM|TFD|FOH|AWD)\s+([A-Z]{3})\b/);
    if (evtPrefix) candidates.push(evtPrefix[1]);
    // "from/to/at/in <AAA>"
    const prepMatch = desc.match(/\b(?:FROM|TO|IN|AT|DEPARTED|ARRIVED)\s+([A-Z]{3})\b/);
    if (prepMatch) candidates.push(prepMatch[1]);
    // "AAA -> BBB" / "AAA-BBB" inline route segments
    const routeMatches = desc.matchAll(/\b([A-Z]{3})\s*(?:->|-|→|\/)\s*([A-Z]{3})\b/g);
    for (const m of routeMatches) { candidates.push(m[1]); candidates.push(m[2]); }
    // "(AAA)" or "AAA" at end
    const parenMatch = desc.match(/\(([A-Z]{3})\)/);
    if (parenMatch) candidates.push(parenMatch[1]);

    for (const apt of candidates) {
      if (!apt || apt.length !== 3) continue;
      if (stopWords.has(apt)) continue;
      if (apt === originIATA || apt === destinIATA) continue;
      if (seenSet.has(apt)) continue;
      seenSet.add(apt);
      seenAirports.push(apt);
    }
  }
}

const conexao = seenAirports.length > 0 ? seenAirports.join(',') : null;
```

Depois, adicionar `conexao,` na resposta `normalized` (logo após `destination`):
```ts
destination: row.DESTINO || "",
conexao,
timeline_json: timeline,
```

### 2. Memória persistente
Atualizar `mem://air/tracking/route-logic-and-highlighting`:
> "Para a tela `/air/tracking-aereo` (endpoint `fetch-tracking-aereo`), a extração de conexões é feita JS-side a partir do `timeline_json` antes de montar a resposta. Itera em ordem cronológica (`[...timeline].reverse()`), coleta IATAs do `location` + 4 padrões regex no `description` (`<EVT> <AAA>`, `from/to/at/in <AAA>`, `AAA -> BBB`, `(AAA)`), filtra origem/destino e stop-words. Resultado vai no campo `conexao` (CSV), consumido pelo frontend em `awb.conexao.split(',')`."

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — ~35 linhas adicionadas antes do `normalized` + 1 linha no objeto.
- `mem://air/tracking/route-logic-and-highlighting` — atualização.

## Validação pós-deploy
1. Recarregar `/air/tracking-aereo`.
2. Localizar AWB **001-23076616** (PVG→GRU) → coluna **Rota** deve exibir `PVG → DFW → MIA → GRU` com a escala correta destacada conforme o status atual.
3. Conferir o JSON retornado pelo endpoint (network tab): cada item deve agora ter `conexao: "DFW,MIA"` (ou similar).
4. Confirmar que AWBs diretos (sem escala real na timeline) seguem com `conexao: null` → coluna mostra apenas `ORIGEM → DESTINO`.

## Riscos e mitigações
- **Falso positivo de aeroporto**: stop-words bloqueia códigos de status (NIL, OFD, BUP, etc.); origem e destino são removidos.
- **Sem regressão**: o frontend já trata `conexoes = []` quando o campo é vazio/null — comportamento atual de AWBs diretos não muda.
- **Performance**: extração é O(n) por AWB sobre a timeline já carregada — sem queries extras.

