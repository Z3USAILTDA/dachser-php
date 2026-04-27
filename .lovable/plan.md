## Problema

AWB **045-21167952** está exibindo **BKD** como evento mais recente, quando deveria ser **RCT** (Received From Carrier — 26/04/2026 17:28). A timeline real é:

```text
$[0] 28/04 02:10  BKD  Booked FOR -> GRU
$[1] 27/04 19:20  BKD  Booked LIS -> FOR
$[2] 26/04 17:28  RECE Received From Carrier   <-- deveria vencer
$[3] 26/04 14:48  RCF  Received from Flight
```

## Causa raiz

Há duas falhas combinadas no resolvedor de códigos (`fetch-tracking-aereo` e `fetch-status-aereo`):

1. **A descrição "Received From Carrier" não tem mapeamento.** As funções resolvem apenas:
   - `RECEIVED FROM FLIGHT` → RCF
   - `RECEIVED FROM SHIPPER` → RCS
   
   Não existe regra para `RECEIVED FROM CARRIER` → **RCT**. Resultado: o slot $[2] resolve para `code = null`.

2. **Cascata do bug:** com `code = null`, o slot escapa do filtro `isBkd()` (que só remove "BKD"/"BKG"/"BOOKED") e permanece no pool. Como sua data 26/04 17:28 é a mais recente entre os não-BKD, ele "vence" no `pickTopByIATA` — mas com `code = null`. O fallback então usa `last_status_code` da linha SQL, que é `BKD`, exibindo BKD no card.

3. **Peso IATA invertido:** `IATA_WEIGHT.RCT = 11` está abaixo de `BKD = 32` em `fetch-tracking-aereo`. RCT (handover ao carrier) é operacionalmente mais avançado que BKD (reserva), então o peso precisa ser maior. Em `fetch-status-aereo` o IATA_HIERARCHY já tem RCT(11) > BKD(1), correto.

## Correção (cirúrgica)

### `supabase/functions/fetch-tracking-aereo/index.ts`

- Em `resolveCode` (linha ~553), adicionar antes da linha de "RECEIVED FROM SHIPPER":
  ```ts
  if (upper.includes("RECEIVED FROM CARRIER")) return "RCT";
  ```
- Em `IATA_WEIGHT` (linha ~582), reposicionar **RCT** acima de BKD:
  - `RCT: 34` (acima de BKD=32, no nível de RCS=34, refletindo handover de origem). 

### `supabase/functions/fetch-status-aereo/index.ts`

- Em `getEventStatusCode` (linha ~49), adicionar antes da regra de SHIPPER:
  ```ts
  if (/\bRECEIVED\s+FROM\s+CARRIER\b/.test(upper)) return 'RCT';
  ```
- Em `statusMap` (linha ~292), adicionar:
  ```ts
  'RECEIVED FROM CARRIER': 'RCT',
  ```
- Em `descPatterns` (linha ~344), adicionar antes do shipper:
  ```ts
  [/\breceived?\s+from\s+carrier\b/i, 'RCT'],
  ```

## Resultado esperado

Após o próximo refetch:
- AWB **045-21167952** passa a exibir **RCT — Received From Carrier (26/04 17:28)** como evento mais recente.
- O modal de timeline marcará "MAIS RECENTE" no evento RECE, não no BKD.
- Qualquer outro processo com "Received From Carrier" na timeline (LATAM/GOL/etc.) também passa a refletir RCT corretamente em vez de cair em BKD por fallback.

## Arquivos alterados

- `supabase/functions/fetch-tracking-aereo/index.ts` (2 pontos: `resolveCode` + `IATA_WEIGHT`)
- `supabase/functions/fetch-status-aereo/index.ts` (3 pontos: `getEventStatusCode` + `statusMap` + `descPatterns`)
