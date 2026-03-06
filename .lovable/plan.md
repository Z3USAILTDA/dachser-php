

# Padronizar códigos de evento na timeline aérea

## Problema

A função `extractStatusCode` no `mariadb-proxy/index.ts` (linha 6174-6193) tem um fallback problemático na linha 6192:

```typescript
return upper.substring(0, 3) || 'UNK';
```

Quando a descrição é algo como "Booked", nenhum dos códigos conhecidos é encontrado via `startsWith` ou `includes` (porque "BKD" não aparece na string "BOOKED"), então o fallback trunca para os 3 primeiros caracteres: "BOO". O mesmo pode acontecer com outras descrições em inglês como "Departed" → "DEP" (funciona por acaso), mas "Arrived" → "ARR" (funciona), "Delivered" → "DEL" (deveria ser "DLV"), etc.

## Correção

### 1. `supabase/functions/mariadb-proxy/index.ts` — função `extractStatusCode` (linhas 6174-6193)

Adicionar um mapeamento de palavras em inglês/português para códigos IATA **antes** do fallback `substring(0,3)`:

```typescript
const descPatterns: Array<[RegExp, string]> = [
  [/\bbooked\b/i, 'BKD'],
  [/\bdelivered\b/i, 'DLV'],
  [/\barrived?\b/i, 'ARR'],
  [/\bdeparted?\b/i, 'DEP'],
  [/\breceived?\s+from\s+flight\b/i, 'RCF'],
  [/\breceived?\s+from\s+shipper\b/i, 'RCS'],
  [/\bmanifested?\b/i, 'MAN'],
  [/\bnotified?\s+(for\s+)?delivery\b/i, 'NFD'],
  [/\bawaitin[g]?\s+delivery\b/i, 'AWD'],
  [/\bavailable\s+for\s+delivery\b/i, 'AWD'],
  [/\bdocuments?\s+available\b/i, 'AWD'],
  [/\bdiscrepancy\b/i, 'DIS'],
  [/\boffloaded?\b/i, 'OFLD'],
  [/\bfreight\s+on\s+hand\b/i, 'FOH'],
  [/\btransferred?\b/i, 'TFD'],
  [/\bproof\s+of\s+delivery\b/i, 'POD'],
  [/\bnot\s+found\b/i, 'NIF'],
  [/\bcancell?ed\b/i, 'CAN'],
];
```

Inserir este bloco **após** as checagens de `knownCodes` e **antes** do fallback `substring(0,3)`. Iterar os patterns e retornar o código correspondente se houver match.

### 2. Escopo

- Apenas o backend (`mariadb-proxy/index.ts`) precisa ser alterado
- O frontend (`AwbTimelineModal.tsx`) já exibe o `codigo_evento` que vier do backend — não precisa de mudança
- Isso alinha o `extractStatusCode` do mariadb-proxy com os `descPatterns` já existentes no `fetch-status-aereo/index.ts` (linhas 214-231)

