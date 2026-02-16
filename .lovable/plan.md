
# Hapag Fallback para Processos PENDENTE e Rastreamento

## Problema

Processos maritimos da Hapag-Lloyd com container='PENDENTE' ficam presos em "Aguardando" porque:
1. O `enrich_sea_containers` usa a API JsonCargo para descobrir containers a partir do MBL
2. A JsonCargo frequentemente retorna "Prefix not found" para MBLs Hapag (prefixos HLCU, HLXU, SAHL, etc.)
3. O `hapag_fallback_track` so processa containers que ja existem e tem erro "Prefix not found" -- nunca toca em PENDENTE

Resultado: MBLs Hapag com container='PENDENTE' nunca sao enriquecidos nem rastreados.

## Solucao

Adicionar um fallback Hapag dentro do fluxo de `enrich_sea_containers` que, ao detectar um MBL Hapag cujo JsonCargo falhou, consulta a API Hapag-Lloyd (`api.hlag.com/hlag/external/v2/events/?transportDocumentReference=MBL`) para:
- **Descobrir containers**: extrair `equipmentReference` dos eventos retornados
- **Rastrear simultaneamente**: extrair status, vessel, ETA, ETD, portos, etc. dos mesmos eventos

Isso elimina o gargalo de dois passos (enriquecer + rastrear) para Hapag, fazendo tudo em uma unica chamada API.

## Detalhes Tecnicos

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts`

### Mudanca 1 -- Detectar Hapag e chamar fallback no `enrich_sea_containers`

No loop de `enrich_sea_containers` (apos a chamada JsonCargo falhar ou retornar vazio, linha ~3497-3550), adicionar:

```text
// Apos JsonCargo falhar para MBL Hapag:
if (containers.length === 0 && effectiveShippingLine === 'HAPAG_LLOYD') {
  // Tentar API Hapag via transportDocumentReference
  const hapagContainers = await hapagEnrichByMbl(mblId, hapagClientId, hapagApiKey);
  if (hapagContainers.length > 0) {
    containers = hapagContainers.map(c => c.containerNo);
    // Bonus: atualizar tracking data diretamente
    hapagTrackingData = hapagContainers;
    successVariation = mblId;
  }
}
```

### Mudanca 2 -- Funcao `hapagEnrichByMbl`

Criar uma funcao auxiliar que:
1. Chama `GET https://api.hlag.com/hlag/external/v2/events/?transportDocumentReference={mbl}`
2. Extrai containers unicos (`equipmentReference`) dos eventos
3. Para cada container, extrai o ultimo status, vessel, ETA, ETD, origem, destino
4. Retorna um array com containers e seus dados de tracking

```text
async function hapagEnrichByMbl(mbl, clientId, apiKey) {
  const res = await fetch(
    `https://api.hlag.com/hlag/external/v2/events/?transportDocumentReference=${mbl}`,
    { headers: { 'X-IBM-Client-Id': clientId, 'X-IBM-Client-Secret': apiKey, 'Accept': 'application/json' } }
  );
  // Parse events, extract unique containers with tracking data
  // Return [{ containerNo, status, vessel, eta, etd, origem, destino }]
}
```

### Mudanca 3 -- Atualizar t_tracking_sea com dados Hapag

Quando o fallback Hapag retorna containers, alem de substituir 'PENDENTE' pelo numero do container (logica existente), tambem atualizar as colunas de tracking:
- `container_status`, `last_event`, `vessel_name`, `eta`, `etd`, `origem`, `destino`, `shipping_line`
- Marcar `last_check = NOW()` e `last_error = NULL`
- Definir `shipping_line = 'HAPAG-LLOYD'`

Isso faz com que o container ja saia do status "Aguardando" imediatamente apos o enriquecimento.

### Mudanca 4 -- Integrar no `sea-tracking-cron`

O cron ja chama `enrich_sea_containers` indiretamente via `sea_seed_smart`. As mudancas acima serao ativadas automaticamente no proximo ciclo. Nenhuma mudanca adicional necessaria no cron.

## Resultado Esperado

- MBLs Hapag com container='PENDENTE' serao enriquecidos via API Hapag-Lloyd
- Containers descobertos ja terao dados de tracking (status, vessel, ETA) preenchidos
- Uma unica chamada API Hapag resolve tanto o enriquecimento quanto o rastreamento
- Os demais armadores continuam usando JsonCargo normalmente (sem impacto)
