

# Plano: Adicionar mapeamento completo de nomes de eventos para siglas IATA

## Problema

Descrições como "Notified" (sem "for delivery") não são reconhecidas e resultam em UNK. O mesmo pode acontecer com outras palavras isoladas como "Departed", "Manifested", etc. que já têm regex, mas faltam entradas no `statusMap` e casos como "Notified" sozinho não estão cobertos.

## Solução

Adicionar mapeamentos em **3 locais** nos 2 arquivos:

### 1. `supabase/functions/fetch-status-aereo/index.ts` — `statusMap` (~linha 170)

Adicionar todas as palavras isoladas que faltam:
```typescript
'NOTIFIED': 'NFD',
'DEPARTED': 'DEP',
'ARRIVED': 'ARR',          // já existe
'MANIFESTED': 'MAN',       // já existe
'TRANSFERRED': 'TFD',      // já existe (TFD)
'OFFLOADED': 'OFLD',       // já existe
'CANCELLED': 'CAN',
'CANCELED': 'CAN',
```

### 2. `supabase/functions/fetch-status-aereo/index.ts` — `descPatterns` (~linha 214)

Adicionar regex para "notified" sozinho (antes do pattern mais específico "notified for delivery"):
```typescript
[/\bnotified\b/i, 'NFD'],
[/\bcancell?ed\b/i, 'CAN'],
[/\bnot\s+found\b/i, 'NIF'],
[/\bproof\s+of\s+delivery\b/i, 'POD'],
```

### 3. `supabase/functions/mariadb-proxy/index.ts` — `descPatterns` (~linha 6444)

Adicionar o mesmo regex `\bnotified\b` → NFD (após o pattern específico "notified for delivery"):
```typescript
[/\bnotified\b/i, 'NFD'],
```

### Resumo dos mapeamentos adicionados

| Descrição | Sigla |
|-----------|-------|
| Notified | NFD |
| Cancelled/Canceled | CAN |
| Not found | NIF |
| Proof of delivery | POD |

Os patterns específicos ("notified for delivery", "received from flight") continuam vindo antes na lista, garantindo que sejam testados primeiro. As palavras isoladas servem como fallback genérico.

