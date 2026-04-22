

## Diagnóstico

O processo `014-24308292` tem RCS como evento mais recente na timeline, mas o card mostra FOH. A causa está na função `pickTopByIATA` (`fetch-tracking-aereo/index.ts`, linhas 567–574):

```ts
const IATA_WEIGHT = {
  ...
  FOH: 33, RCS: 32,   // ← RCS pesa MENOS que FOH
};
```

Quando os 4 slots SQL contêm tanto FOH quanto RCS, FOH vence pela hierarquia, mesmo que RCS seja cronologicamente posterior.

## Causa raiz

A hierarquia IATA está com FOH e RCS na ordem **invertida**. No fluxo IATA outbound real:

```
FWB → FOH → RCS → BKD → DEP → RCF → ARR → NFD → AWD → DLV → POD
```

- **FOH** (Freight on Hand): mercadoria recebida no terminal / armazém do agente
- **RCS** (Received from Shipper): aceitação formal pela companhia aérea, depois do FOH

Portanto **RCS deve ter peso maior que FOH**. O memory `mem://air/tracking/data-mirroring-intent-v2` documenta a hierarquia atual com `FOH=33 > RCS=32`, o que está incorreto na origem.

## Correção (cirúrgica)

### 1. Inverter pesos FOH/RCS em `IATA_WEIGHT`
Em `supabase/functions/fetch-tracking-aereo/index.ts` (linha 571):

```ts
// antes
TRM: 38, TFD: 37, DEP: 36, MAN: 35, BKD: 34, FOH: 33, RCS: 32,

// depois
TRM: 38, TFD: 37, DEP: 36, MAN: 35, BKD: 34, RCS: 33, FOH: 32,
```

### 2. Espelhar a mesma correção em `mariadb-proxy/index.ts`
A função `get_awb_tracking_events` (linhas 7259+) também aplica `pickTopByIATA` para mover o slot eleito para a posição 0 do modal. Buscar o bloco `IATA_WEIGHT` correspondente e aplicar a mesma inversão para garantir consistência card ↔ modal.

### 3. Atualizar memória
`mem://air/tracking/data-mirroring-intent-v2`: atualizar a hierarquia documentada para refletir `RCS=33 > FOH=32`, e adicionar nota: "ordem corrigida conforme fluxo IATA outbound real (RCS = aceitação pela cia aérea, ocorre após FOH)".

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — linha 571
- `supabase/functions/mariadb-proxy/index.ts` — bloco `IATA_WEIGHT` em `get_awb_tracking_events`
- `mem://air/tracking/data-mirroring-intent-v2` — hierarquia corrigida

## Validação
1. Recarregar `/air/tracking-aereo`.
2. Localizar `014-24308292`: card deve mostrar **RCS** (não mais FOH).
3. Abrir o modal de timeline: o slot RCS deve estar na posição 0.
4. Spot-check em processos onde apenas FOH existe (sem RCS) — deve continuar exibindo FOH normalmente.
5. Verificar que processos mais avançados (BKD, DEP, RCF…) seguem inalterados — só a relação FOH↔RCS muda.

## Riscos
- **Sem alteração de schema** — apenas dois números trocados de posição.
- **Sem regressão**: os outros 11 códigos da hierarquia mantêm pesos relativos. A inversão só afeta processos com FOH e RCS simultaneamente nos top-4 slots.
- **Manual overrides** continuam com prioridade absoluta (regra inalterada).

