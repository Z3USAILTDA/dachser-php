

# Plano: Priorizar timeline para `último_status`

## Problema

A hierarquia atual de resolução de status é:
1. `t_aereo_api.ultimo_status` (autoritativo)
2. Timeline (derivado dos eventos)
3. `ws.last_status_code` (fallback do banco)

Porém, o `last_status_code` gravado no banco pode estar desatualizado (evento anterior), e até o `t_aereo_api.ultimo_status` pode não refletir o evento mais recente. A timeline é sempre a fonte mais confiável.

## Solução

**Arquivo**: `supabase/functions/fetch-status-aereo/index.ts` — linhas 847-878

Inverter a hierarquia: se a timeline tiver um status válido, usá-lo sempre. Os demais fontes servem apenas como fallback quando a timeline não retorna nada.

### Nova hierarquia

```
1. timelineStatus (derivado da timeline — PRIORIDADE MÁXIMA)
2. t_aereo_api.ultimo_status (fallback)
3. ws.last_status_code (último recurso)
```

### Alteração

```typescript
let finalStatus: string | null;

if (timelineStatus) {
  // Timeline é sempre a fonte mais precisa — priorizar
  finalStatus = classifyArrival(timelineStatus, timelineStr, destForClassify, origForClassify, awb);
  console.log(`[timelinePrimary] ${awb}: timeline="${timelineStatus}" → "${finalStatus}"`);
} else if (apiStatusValid) {
  // Sem status na timeline — usar t_aereo_api como fallback
  finalStatus = classifyArrival(apiStatus!, timelineStr, destForClassify, origForClassify, awb);
  console.log(`[apiFallback] ${awb}: t_aereo_api.ultimo_status="${apiStatus}" → "${finalStatus}"`);
} else if (rawStatus && !invalidStatuses.has(rawStatusUpper) && rawStatusUpper !== 'UNK') {
  // Sem timeline nem API — fallback para ws.last_status_code
  finalStatus = classifyArrival(rawStatus, timelineStr, destForClassify, origForClassify, awb);
  console.log(`[wsFallback] ${awb}: ws.last_status_code="${rawStatus}" → "${finalStatus}"`);
} else {
  // Último recurso: tentar extrair da descrição
  // (código existente do bloco de descrição permanece igual)
}
```

O restante da lógica (re-classificação ARR, validação IATA, etc.) permanece inalterado. Apenas a ordem de prioridade das fontes muda.

