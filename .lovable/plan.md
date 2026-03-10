

# Fix: "Último Status" diverge da Timeline para CGN-16368970

## Diagnóstico

O AWB **020-21762370** (HAWB CGN-16368970) tem dois eventos com o **mesmo timestamp** (2026-03-08T14:56:00):
- **RCF** — "Received from flight"
- **NFD** — "Notified for delivery"

O campo `último_status` usa a **hierarquia IATA** que escolhe o status mais avançado → **NFD** (ordem 8 > RCF ordem 6). Correto.

Porém o campo `status_info` usa `extractLastEventDescription` que retorna a descrição do evento **cronologicamente mais recente**. Com timestamps iguais, a ordenação por string é instável e retorna "Received from flight" (RCF) em vez de "Notified for delivery" (NFD).

**Resultado na tela**: coluna "Último Status" mostra NFD, mas coluna "Último Evento" mostra "Received from flight" — contradição visual.

## Correção

### Arquivo: `supabase/functions/fetch-status-aereo/index.ts`

**Alterar `extractLastEventDescription`** (linhas ~397-450): quando múltiplos eventos têm o mesmo timestamp, usar a hierarquia IATA como desempate para retornar a descrição do evento mais avançado (consistente com o status resolvido).

Lógica:
1. Após filtrar e ordenar eventos por data DESC, agrupar eventos que compartilham o mesmo timestamp.
2. Dentro do grupo de mesmo timestamp, aplicar `IATA_HIERARCHY` para selecionar o evento com maior prioridade.
3. Retornar a descrição desse evento.

Isso garante que `status_info` sempre corresponda ao `último_status` quando os timestamps coincidem.

### Impacto
- 1 arquivo editado
- Sem alterações no frontend
- Corrige a inconsistência visual para todos os AWBs com eventos simultâneos

