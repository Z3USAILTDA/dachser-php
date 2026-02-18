
# Classificar status UNK a partir dos eventos da timeline

## Entendimento do problema

Quando a `t_aereo_ws` retorna um `last_status_code` como `"UNK"` (ex.: Delta Airlines com código proprietário `"4 P"`), o sistema não sabe qual é o status real do processo. Mas a `timeline_json` desse mesmo AWB contém eventos com campos `status`, `Status`, `description`, `Description` — que trazem os códigos ou descrições reais dos eventos mais recentes (ex.: `"AWD"`, `"RCF"`, `"DLV"`, etc.).

A solução é: **quando o `last_status_code` for `"UNK"`, percorrer a `timeline_json` em ordem decrescente (evento mais recente primeiro) e tentar mapear o status do primeiro evento válido para um código IATA reconhecido**.

## Onde implementar

A lógica fica na **edge function `fetch-status-aereo/index.ts`**, no Passo 3 (Merge em memória), logo após o `classifyArrival`. Isso garante que o campo `último_status` já chega corrigido ao frontend — sem alterar nada no frontend.

## Lógica de de-para (mapeamento)

Será adicionada uma função `resolveUnkFromTimeline(timelineJson, awb)` que:

1. Faz parse do `timeline_json`
2. Itera pelos eventos (que chegam DESC — mais recente primeiro)
3. Para cada evento, lê `status || Status` e `description || Description`
4. Aplica um de-para (tabela abaixo) para mapear para código IATA
5. Retorna o primeiro código IATA válido encontrado, ou `null` se nenhum mapear

### Tabela de de-para (de-para de status → IATA)

| Valor bruto do evento | Código IATA |
|---|---|
| `DLV`, `DELIVERED` | `DLV` |
| `DEP`, `DEPARTED` | `DEP` |
| `ARR`, `ARRIVED` | `ARR` |
| `RCF`, `RECEIVED FROM FLIGHT` | `RCF` |
| `RCS`, `RECEIVED FROM SHIPPER` | `RCS` |
| `MAN`, `MANIFESTED` | `MAN` |
| `NFD`, `NOTIFIED FOR DELIVERY` | `NFD` |
| `AWD`, `AWAITING DELIVERY`, `AVAILABLE FOR DELIVERY` | `AWD` |
| `DIS`, `DISCREPANCY` | `DIS` |
| `OFLD`, `OFFLOADED` | `OFLD` |
| `NIL` | `NIL` |
| `FOH`, `FREIGHT ON HAND` | `FOH` |
| `BKD`, `BOOKED` | `BKD` |
| `PRE`, `PRE-ADVISED` | `PRE` |
| `TFD`, `TRANSFERRED` | `TFD` |

A função também verifica a `description` do evento com regex simples (ex.: `description.includes('DELIVERED')` → `DLV`).

## Alteração no Passo 3

```typescript
// Antes — classifiedStatus pode permanecer "UNK"
const classifiedStatus = classifyArrival(rawStatus, timelineStr, ...);

// Depois — se ainda for UNK, tenta resolver pela timeline
let finalStatus = classifiedStatus;
if (!finalStatus || finalStatus.toUpperCase() === 'UNK') {
  const resolvedFromTimeline = resolveUnkFromTimeline(timelineStr, awb);
  if (resolvedFromTimeline) {
    finalStatus = resolvedFromTimeline;
    console.log(`[resolveUNK] ${awb}: UNK → ${resolvedFromTimeline} (via timeline)`);
  }
}

const baseRow = {
  ...
  último_status: finalStatus || null,
  ...
};
```

## Benefício

- O AWB `006-52943645` (Delta Airlines, código `"4 P"`) que tinha status `UNK` vai passar a exibir o código IATA real do seu último evento (ex.: `AWD`, `RCF`, `DLV`)
- Todos os outros AWBs com `UNK` de companhias com códigos proprietários também se beneficiam
- Nenhuma alteração no frontend — o badge `UNK` só aparecerá em casos onde genuinamente não há informação na timeline

## Arquivo a editar

- `supabase/functions/fetch-status-aereo/index.ts` — adicionar função `resolveUnkFromTimeline` e chamá-la no Passo 3 quando `classifiedStatus === 'UNK'`
