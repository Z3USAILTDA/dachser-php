

# Plano: Filtrar status inválidos da timeline

## Problema

Na função `get_awb_tracking_events` em `supabase/functions/mariadb-proxy/index.ts`, o `extractStatusCode` (linha 6467) tem um fallback `upper.substring(0, 3)` que gera códigos inválidos como `"KK,"`. Esses eventos aparecem na timeline do modal mesmo não sendo status IATA válidos.

## Solução

Duas alterações no mesmo arquivo:

### 1. `extractStatusCode` — fallback para 'UNK' em vez de substring arbitrária (linha 6467)

```typescript
// De:
return upper.substring(0, 3) || 'UNK';
// Para:
return 'UNK';
```

### 2. Filtrar eventos com código inválido antes de retornar ao frontend (após linha 6523)

Adicionar um filtro usando a mesma whitelist de códigos IATA válidos, removendo da timeline eventos cujo `codigo_evento` não seja reconhecido:

```typescript
const VALID_IATA_CODES = new Set([
  'DEP', 'ARR', 'RCF', 'DLV', 'NFD', 'MAN', 'BKD', 'RCS', 'DIS', 'NIL',
  'OFLD', 'FOH', 'TRM', 'PRE', 'AWD', 'CCD', 'TGC', 'DDL', 'AWR', 'POD',
  'TFD', 'RCT', 'RCP', 'LOF', 'TDE', 'ASN', 'MIS', 'TFS', 'BKF', 'FWB',
  'CAN', 'NIF', 'UNK'
]);

const filteredEvents = validEvents.filter((e: any) =>
  VALID_IATA_CODES.has((e.codigo_evento || '').toUpperCase())
);
```

Usar `filteredEvents` no restante do fluxo (ETD filter, resultado final). Eventos com status inválido são removidos da visualização da timeline, mas o processo continua aparecendo normalmente se tiver outros eventos válidos.

## Arquivo a modificar

1. `supabase/functions/mariadb-proxy/index.ts` — linhas 6467 e 6523

