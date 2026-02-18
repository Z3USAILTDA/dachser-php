
# Sempre preferir o status da timeline sobre o last_status_code

## Entendimento da solicitação

O usuário quer dois comportamentos:

1. **Prefixo `014` (Air China Cargo):** Sempre usar o código IATA correspondente ao **último evento da timeline**, independentemente do `last_status_code` armazenado — porque a Air China usa códigos proprietários que nunca mapeiam corretamente.

2. **Todos os outros prefixos:** Fazer uma **validação cruzada**: se o `last_status_code` e o último evento da timeline divergem, **preferir o da timeline**. Isso corrige casos onde o scraper capturou um status desatualizado mas a timeline tem o evento mais recente correto.

## Comportamento atual

No Passo 3 do `fetch-status-aereo/index.ts`, o fluxo é:

```
rawStatus (last_status_code)
  → classifyArrival()  [só age se status = ARR]
  → se UNK: resolveUnkFromTimeline()  [só age se UNK]
  → finalStatus
```

O problema: `resolveUnkFromTimeline()` só é chamada quando o status é `UNK` ou nulo. Para outros casos (ex.: `last_status_code = "DEP"` mas timeline mostra `DLV` como evento mais recente), a divergência é ignorada — o status desatualizado vence.

## Solução

### 1. Para prefixo `014` — sempre usar timeline

Adicionar lógica antes do `classifyArrival`:

```typescript
const awbPrefix = awb.substring(0, 3);

// Para prefixo 014 (Air China): sempre resolver status pela timeline
if (awbPrefix === '014') {
  const resolvedFromTimeline = resolveUnkFromTimeline(timelineStr, awb);
  if (resolvedFromTimeline) {
    finalStatus = resolvedFromTimeline;
    console.log(`[prefix014] ${awb}: last_status_code="${rawStatus}" → ${resolvedFromTimeline} (forced timeline)`);
  } else {
    finalStatus = rawStatus ? classifyArrival(rawStatus, ...) : null;
  }
}
```

### 2. Para todos os outros prefixos — validação cruzada

Após calcular o `classifiedStatus`, verificar se a timeline tem um status diferente e mais recente:

```typescript
// Para prefixos não-014: validação cruzada entre last_status_code e timeline
if (awbPrefix !== '014' && classifiedStatus && classifiedStatus.toUpperCase() !== 'UNK') {
  const timelineStatus = resolveUnkFromTimeline(timelineStr, awb);
  if (timelineStatus && timelineStatus !== classifiedStatus) {
    // Timeline diverge — prefere o da timeline
    finalStatus = timelineStatus;
    console.log(`[crossCheck] ${awb}: last_status="${classifiedStatus}" vs timeline="${timelineStatus}" → prefer timeline`);
  } else {
    finalStatus = classifiedStatus;
  }
}
```

**Exceção importante**: se o `classifiedStatus` já for `ARR - DESTINO` ou `ARR - CONEXAO` (resultado do `classifyArrival`), a função `resolveUnkFromTimeline` pode retornar apenas `ARR` e regredir o status. Será adicionado um guard para não sobrescrever classificações mais específicas com classificações mais genéricas:

```typescript
// Não regredir de "ARR - DESTINO" para "ARR"
const isMoreSpecific = (current: string, candidate: string): boolean => {
  if (current === 'ARR - DESTINO' && candidate === 'ARR') return false;
  if (current === 'ARR - CONEXAO' && candidate === 'ARR') return false;
  return true;
};
```

## Fluxo completo revisado (Passo 3)

```
rawStatus (last_status_code do t_aereo_ws)
  ↓
Se prefixo 014:
  → resolveUnkFromTimeline() diretamente
  → (fallback: classifyArrival se timeline vazia)

Se outros prefixos:
  → classifyArrival() [como hoje]
  → crossCheck: resolveUnkFromTimeline()
  → Se timeline diverge E não é regressão → prefere timeline
  → Senão mantém classifiedStatus

Se UNK (qualquer prefixo):
  → resolveUnkFromTimeline() [lógica já existente, mantida como fallback final]
```

## Arquivo a editar

- `supabase/functions/fetch-status-aereo/index.ts`
  - Adicionar helper `isMoreSpecific()` (evita regressões de ARR - DESTINO → ARR)
  - Refatorar bloco do Passo 3 (linhas 505–517) para separar o tratamento por prefixo
  - Redeploy automático
