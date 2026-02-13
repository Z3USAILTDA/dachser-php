

# Corrigir Deteccao de Transbordo: Apenas "Full Transshipment Discharged/Loaded"

## Problema
O processo MEDUWA505645 mostra a origem "Qingdao China" como escala porque:
1. Na linha 2694, eventos com `eventCode === 'DISCHARGED'` ou `eventCode === 'LOADED'` sao tratados como transbordo -- mas esses sao eventos normais de carga/descarga na origem/destino
2. O filtro de exclusao na linha 2701 usa comparacao exata (`!==`), entao "Qingdao" vs "Qingdao China" nao sao reconhecidos como iguais

## Solucao

O usuario confirmou que transbordo so deve ser detectado quando o evento contiver explicitamente **"Full Transshipment Discharged"** ou **"Full Transshipment Loaded"**.

### Mudancas no arquivo `supabase/functions/olimpo-proxy/index.ts`

**1. Restringir event codes na deteccao de eventos (linhas ~2690-2706)**

Remover `eventCode === 'DISCHARGED'` e `eventCode === 'LOADED'` da condicao. Manter apenas:
- `eventCode` contendo `TRANSSHIP`, `TSP`, ou `T/S`
- Adicionar verificacao no `event.description` / `event.container_status` para "FULL TRANSSHIPMENT DISCHARGED" e "FULL TRANSSHIPMENT LOADED"

Logica revisada:
```
const eventCode = (event.event_code || ...).toUpperCase();
const eventDesc = (event.description || event.event_description || '').toUpperCase();
const eventStatus = (event.container_status || '').toUpperCase();
const allText = eventCode + ' ' + eventDesc + ' ' + eventStatus;

if (allText.includes('FULL TRANSSHIPMENT') || 
    eventCode.includes('TRANSSHIP') || 
    eventCode.includes('TSP') || 
    eventCode.includes('T/S')) {
  // ... adicionar loc como transshipment
}
```

**2. Melhorar exclusao de origem/destino com fuzzy matching (linha ~2701)**

Substituir comparacao exata por comparacao do primeiro token:
```
const locFirst = locUpper.split(/[\s,]+/)[0];
const origemFirst = origemUpper.split(/[\s,]+/)[0];
const destinoFirst = destinoUpper.split(/[\s,]+/)[0];
const storedOrigemFirst = (row.origem || '').toUpperCase().trim().split(/[\s,]+/)[0];
const storedDestinoFirst = (row.destino || '').toUpperCase().trim().split(/[\s,]+/)[0];

if (locFirst && locFirst !== origemFirst && locFirst !== destinoFirst 
    && locFirst !== storedOrigemFirst && locFirst !== storedDestinoFirst) {
  transshipmentSources.push(loc);
}
```

**3. Permitir limpeza de dados falsos (linha ~2763)**

Mudar de:
```sql
transshipment_port = COALESCE(?, transshipment_port)
```
Para:
```sql
transshipment_port = CASE WHEN ? IS NOT NULL THEN ? ELSE transshipment_port END
```
Isso permite que quando a deteccao corrigida nao encontra transbordo, o valor anterior permanece (para nao perder dados legitimos de outras CTEs). Porem, adicionamos uma logica: se o valor atual for igual a origem, limpar para NULL.

**4. Limpeza automatica pos-deploy**

Adicionar no inicio do `refresh_sea_tracking` uma query de limpeza one-time:
```sql
UPDATE dados_dachser.t_tracking_sea ts
SET transshipment_port = NULL
WHERE transshipment_port IS NOT NULL
  AND UPPER(TRIM(SUBSTRING_INDEX(transshipment_port, ' ', 1))) = 
      UPPER(TRIM(SUBSTRING_INDEX(COALESCE(origem, ''), ' ', 1)))
  AND UPPER(TRIM(SUBSTRING_INDEX(transshipment_port, ' ', 1))) != ''
```
Isso limpa todos os falsos positivos onde o transshipment_port e igual a origem.

## Resumo do Impacto
- Eventos normais de DISCHARGED/LOADED nao serao mais confundidos com transbordo
- Apenas eventos explicitamente contendo "Full Transshipment Discharged/Loaded" ou codes TRANSSHIP/TSP/T/S serao considerados
- Fuzzy matching previne falsos positivos por variacoes de formatacao
- MEDUWA505645 sera corrigido automaticamente no proximo refresh

## Arquivo modificado
- `supabase/functions/olimpo-proxy/index.ts`
