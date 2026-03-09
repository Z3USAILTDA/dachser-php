

## Diagnóstico: Eventos RFB não aparecem na timeline CCT

### Problema Identificado

A junção de eventos LeadComex + RFB na timeline **não está funcionando** devido a um bug de matching no `get_cct_events`.

**Causa raiz:** Na linha 6232 do `mariadb-proxy/index.ts`, a query busca `t_aereo_cct.identificacao = ?` usando o **HAWB** (ex: `BKK-69914726`), mas `t_aereo_cct.identificacao` armazena o **MAWB** (ex: `020-17606035`). O resultado é que a query nunca encontra correspondência, e os eventos RFB nunca são adicionados à timeline.

```text
Frontend envia:  get_cct_events { awb: "BKK-69914726" }  ← HAWB
Query busca:     WHERE identificacao = "BKK-69914726"     ← HAWB
Tabela contém:   identificacao = "020-17606035"           ← MAWB
Resultado:       0 linhas → 0 eventos RFB na timeline
```

Enquanto isso, o `get_cct_shipments` (Step 2.5, linha 3148) faz o lookup **correto** usando a lista de MAWBs. Os dados RFB estão no dashboard (peso, volume, etc.), mas **não aparecem na timeline de eventos**.

### Correção Proposta

1. **`get_cct_events` no mariadb-proxy** (linhas 6226-6277):
   - Receber também o MAWB como parâmetro (o frontend já tem essa informação no `ProcessoCCT.shipment.master`)
   - Alterar a query RFB para usar o MAWB: `WHERE identificacao = ?` com o valor do master
   - Fallback: se MAWB não for passado, fazer lookup na `t_master_dados` para descobrir o MAWB a partir do HAWB

2. **`useCCTEvents` no frontend** (`src/hooks/useCCTData.ts`, ~linha 175):
   - Passar o `master` (MAWB) junto com o `awb` (HAWB) na chamada da edge function
   - Atualizar a assinatura do hook para aceitar `{ awb, master }` em vez de apenas `awb`

3. **Componente que chama `useCCTEvents`** (provavelmente `ProcessoTimeline.tsx`):
   - Passar o MAWB disponível no `ProcessoCCT.shipment.master` para o hook

### Resultado Esperado

Após a correção, os processos que têm dados na `t_aereo_cct` (19 MAWBs atualmente) terão seus eventos de `partesEstoque` (MANIFESTADO, INFORMADA, RECEPCIONADO, etc.) exibidos na timeline junto com os eventos do LeadComex, resultando em timelines com múltiplos eventos.

