

## Plano: Reativar conexão ao banco em /air/tracking-aereo

### Problema
A função `fetchData` (linhas 328-355) está completamente comentada, retornando `setAwbsData([])`. O mapeamento original foi perdido.

### Solução
Reconstruir o `fetchData` descomentando e implementando o mapeamento correto baseado na resposta real do edge function `fetch-tracking-aereo` (confirmado via network requests).

### Mapeamento dos campos (response → AWBData)

| Edge Function field | AWBData field |
|---|---|
| `awb_number` | `awb` |
| `hawb_number` | `hawb` |
| `LEFT(awb_number, 3)` | `airline_code` |
| `consignee_nome` | `consignee_name` |
| `clerk` | `nome_analista` |
| `origin` | `origem` |
| `destination` | `destino` |
| `last_event` | `last_event` + `status` (via `getStatusCode`) |
| `last_event_date` | `last_event_date` |
| `last_event_location` | `last_event_location` |
| `penultimate_location` | `penultimate_location` |
| `timeline_json` | `timeline_json` |

### Lógica adicional
- Deduplicação por chave `awb|hawb`, mantendo o registro com `last_event_date` mais recente
- Enriquecimento com `checkTimelineDiscrepancy` para sinalizar discrepâncias de peças
- Detecção de `tracking_failed` quando `last_event` é null/vazio

### Arquivo alterado
- `src/pages/air/TrackingAereo.tsx` — função `fetchData` (linhas 328-355)

