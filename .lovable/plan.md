

# Plano: Interpretar "Received" como RCF na timeline e na resolução de status

## Problema

A descrição "Received MAD GHA" não é reconhecida por nenhum regex existente. Os padrões atuais cobrem "received from flight" (→ RCF) e "received from shipper" (→ RCS), mas "Received" sozinho (comum em companhias como a 996) não tem correspondência. Resultado:

1. **Timeline (mariadb-proxy)**: `extractStatusCode` retorna `'UNK'` → evento aparece com sigla UNK
2. **Coluna último status (fetch-status-aereo)**: `resolveUnkFromTimeline` não resolve "Received" → cai no fallback e pega um evento anterior (DEP)

## Solução

Adicionar regex `\breceived\b` → `'RCF'` em **3 locais** (os dois arquivos que fazem parsing de descrições):

### 1. `supabase/functions/mariadb-proxy/index.ts` — `extractStatusCode` (~linha 6462)

Adicionar antes do `return 'UNK'`:
```typescript
[/\breceived\b/i, 'RCF'],
```

### 2. `supabase/functions/fetch-status-aereo/index.ts` — `descPatterns` em `resolveUnkFromTimeline` (~linha 230)

Adicionar após a linha de `\bdeparted\b`:
```typescript
[/\breceived\b/i, 'RCF'],
```

### 3. `supabase/functions/fetch-status-aereo/index.ts` — `statusMap` (~linha 174)

Adicionar entrada para "RECEIVED":
```typescript
'RECEIVED': 'RCF',
```

**Ordem importa**: os padrões mais específicos ("received from flight", "received from shipper") já vêm antes na lista, então serão testados primeiro. O `\breceived\b` genérico só será atingido quando não houver match mais específico.

## Resultado esperado

- "Received MAD GHA" → sigla **RCF** na timeline (em vez de UNK)
- Coluna "último status" → **RCF** (em vez de DEP do evento anterior)

