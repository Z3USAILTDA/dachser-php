

## Por que a coluna "Último Evento" está mostrando localização (FRA, FCO, GRU) em vez de código IATA

### Causa raiz — confirmada no código

A `pickTopByIATA` em `fetch-tracking-aereo/index.ts` (linhas 432-447) **descarta o `code` resolvido** quando devolve o vencedor — ela retorna o objeto `{code, desc, loc, date, idx}`, mas a inicialização do `winner` na linha 440 (`let winner = slots[0]`) e o resultado final mantêm a estrutura. Olhando em detalhe o fluxo posterior (linhas 462-482):

1. `top = pickTopByIATA(row)` → retorna o slot eleito com seu `code` resolvido.
2. `codeFromTimeline = top.code` → ok, pega o código.
3. `finalCode = codeFromTimeline || lastStatusCode || null` → ok.
4. `awb.last_event = finalCode` (linha 540) → grava o código.

Isso parece correto. Mas o problema real está em **`getStatusCode` no front** (`src/pages/air/TrackingAereo.tsx` linhas 41-54):

```ts
if (knownStatusCodes.includes(upperEvent)) return upperEvent;
if (lastEvent.includes(" - ")) return lastEvent.split(" - ")[0];
return lastEvent.substring(0, 3).toUpperCase();   // ← FALLBACK PERIGOSO
```

Quando `last_event` chega **vazio ou com a descrição completa** (não o código IATA), o fallback final pega os **3 primeiros caracteres** da string. Aconteceu o seguinte com o novo `pickTopByIATA`:

- Para AWBs onde **nenhum slot tem código IATA reconhecível** (regex falha + `resolveCode` falha), `top.code` vem `null`.
- Cai no `lastStatusCode` cru de `t_fato_aereo`.
- Em vários AWBs IBS/American esse campo está com **a string de localização** ou **descrição livre** começando por `"FRA"`, `"FCO"`, `"GRU"`.
- O front faz `substring(0,3).toUpperCase()` → exibe `FRA`, `FCO`, `GRU`.

Confirma-se com a screenshot: AWB `020-07276242` (CARL ZEISS, GRU→FRA) mostra `FCO` em "Último Evento" — `FCO` é Roma Fiumicino, **localização**, não código de evento. Provavelmente `last_status_code` está com `"FCO Arrived"` ou similar, e o fallback de substring captura `"FCO"`.

### Por que regrediu agora

Antes do `pickTopByIATA`, o front recebia `last_event` de `desc0` (descrição completa do `$[0]` do JSON), e a `getStatusCode` tentava casar com `knownStatusCodes` ou caía no substring. Agora `last_event` vem de `finalCode` (que já deveria ser código IATA puro), mas quando `pickTopByIATA` falha em resolver código (slots sem `status_code` nativo, sem regex `| Code XXX |`, sem regex `(XXX)`), o `finalCode` cai no `lastStatusCode` cru — e ali está vindo localização porque o crawler dessas AWBs grava o aeroporto no campo de status.

### Correção

**1. Sanitizar `finalCode` em `fetch-tracking-aereo`** (linhas 467-482): só aceitar `lastStatusCode` como fallback se ele bater com a lista de códigos IATA válidos (mesma lista do `IATA_WEIGHT` + alguns extras: `OFLD`, `NIL`, `NIF`, `DIS`, `TFD`, `RCT`, etc.). Se não bater, devolver `null` → o front mostra "Aguardando consulta" / "Falha do Rastreio" em vez de inventar código a partir de localização.

```ts
const VALID_IATA = new Set([...Object.keys(IATA_WEIGHT), 'OFLD','NIL','NIF','DIS','TFD','RCT','TRM','POD']);
const sanitized = (lastStatusCode || '').toUpperCase().trim();
finalCode = codeFromTimeline 
  || (VALID_IATA.has(sanitized) ? sanitized : null);
```

**2. Endurecer `getStatusCode` no front** (`src/pages/air/TrackingAereo.tsx`): remover o fallback `substring(0,3)` que inventa código. Se `lastEvent` não bater com `knownStatusCodes`, retornar `"UNK"` (já está na lista) — nunca devolver pedaço de string que pode ser localização.

```ts
if (knownStatusCodes.includes(upperEvent)) return upperEvent;
if (upperEvent.startsWith("ARR - ")) return upperEvent;
return "UNK";   // sem inventar código a partir de substring
```

Aplicar a mesma mudança no `getStatusCode` espelhado em `src/pages/Index.tsx` (mesma assinatura, usado pela rota `/`).

**3. Melhorar `resolveCodeFromSlot` em `fetch-tracking-aereo`** para AWBs onde `desc` começa direto com o código IATA (formato muito comum no Lufthansa/IBS):

```ts
// Início da descrição é o próprio código: "RCF Received from Flight ..."
const startCode = desc.trim().match(/^([A-Z]{2,5})\b/);
if (startCode && IATA_WEIGHT[startCode[1].toUpperCase()] !== undefined) {
  return startCode[1].toUpperCase();
}
```

Inserir esse check **entre** o regex IBS `| Code XXX |` e o regex Lufthansa `(XXX)`.

### Validação

1. AWBs `020-07276242` (várias linhas da screenshot) → coluna passa de `FCO` (errado, é localização) para o código IATA real do último evento ou `UNK`/badge "Falha do Rastreio".
2. AWB `020-07276290` → continua `RCF`.
3. AWB `020-01256754` → continua `NFD`.
4. AWB `083-60697394` → coluna passa de `GRU` (errado) para código IATA real.
5. Nenhum AWB exibe sigla de aeroporto na coluna "Último Evento".

### Não muda

- SQL Q3 (continua simples com `JSON_EXTRACT($[0..3])`).
- Schema de retorno, hierarquia IATA, `MANUAL_OVERRIDES`, SLA, CTE de discrepância, `mariadb-proxy.get_awb_tracking_events`, modal de timeline.

### Memória a atualizar

`mem://air/tracking/data-mirroring-intent-v2`: registrar que `last_status_code` cru só é usado como fallback quando bate com lista branca de códigos IATA válidos, e o front nunca infere código a partir de substring da descrição.

