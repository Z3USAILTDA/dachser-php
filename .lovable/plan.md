

## Sincronizar URLs de rastreio externo: `/air/tracking` → `/air/tracking-aereo`

### Problema

A tela `/air/tracking-aereo` tem apenas 8 companhias mapeadas no `getTrackingUrl`, enquanto `/air/tracking` (Index.tsx) tem ~30 companhias. Muitas companhias ficam sem o botão de abrir site externo.

### Alteração

**1 arquivo:** `src/pages/air/TrackingAereo.tsx` (linhas 91-100)

Substituir o `urlBuilders` atual (8 entradas) pelo mapa completo do `Index.tsx` (todas as ~30 companhias):

```typescript
const urlBuilders: Record<string, (iata: string, awb: string) => string> = {
  "001": (i,a) => `https://www.aacargo.com/mobile/tracking-details.html?awb=${i}${a}`,
  "014": (i,a) => `https://cargo.aircanada.com/Tracking?shipmentCode=${i}${a}`,
  "006": (i,a) => `https://www.deltacargo.com/Cargo/home/trackShipment?awbNumber=${i}${a}&timeZoneOffset=180&t=${Date.now()}`,
  "016": (i,a) => `https://www.unitedcargo.com/en/us/track/awb/${i}-${a}`,
  "020": (i,a) => `https://www.lufthansa-cargo.com/en/eservices/etracking/tracking/-/awb/${i}/${a}`,
  "045": (i,a) => `https://www.latamcargo.com/en/trackshipment?docNumber=${a}&docPrefix=${i}&soType=MAWB`,
  "047": () => `https://www.tapcargo.com/en/e-tracking-results`,
  "055": (i,a) => `https://booking.ita-airways-cargo.com/trackAndTrace?awbno=${i}${a}`,
  "057": (i,a) => `https://www.afklcargo.com/mycargo/shipment/detail/${i}-${a}`,
  "074": (i,a) => `https://www.afklcargo.com/mycargo/shipment/detail/${i}-${a}`,
  "075": (i,a) => `https://www.iagcargo.com/iagcargo/portlet/en/html/601/main/search?frame=true&awb.cia=${i}&awb.cod=${a}`,
  "083": () => `https://saa.ibsplc.aero/icargoneoportal/app/main/#/app`,
  "125": (i,a) => `https://ui.tracking.iagcargo.com/en/${i}-${a}?frame=true&loggedIn=false`,
  "127": (i,a) => `https://golfreteselogistica.gollog.com/rastreamento?awb=${i}${a}`,
  "139": (i,a) => `https://amcargo.aeromexico.com/seguimiento/resultado/${i}-${a}`,
  "147": () => `https://ebooking.champ.aero/trace/AT/trace.asp`,
  "157": () => `https://www.qrcargo.com/s/track-your-shipment`,
  "160": () => `https://www.cathaycargo.com/en-us/track-and-trace.html`,
  "172": (i,a) => `https://www.cargolux.com/track-and-Trace#numbers=${i}-${a}`,
  "176": (i,a) => `https://eskycargo.emirates.com/app/offerandorder/#/shipments/list?type=D&values=${i}${a}`,
  "235": (i,a) => `https://www.turkishcargo.com/en/online-services/shipment-tracking?quick=True&awbInput=${i}-${a}`,
  "369": (i,a) => `https://jumpseat.atlasair.com/aa/tracktracehtml/TrackTrace.html?pe=${i}&se=${a}`,
  "549": (i,a) => `https://www.latamcargo.com/en/trackshipment?docNumber=${a}&docPrefix=${i}&soType=MAWB`,
  "577": (i,a) => `https://azulcargoexpress.smartkargo.com/FrmAWBTracking.aspx?AWBPrefix=${i}&AWBno=${a}`,
  "605": () => `https://cargo.skyairline.com/rastreo`,
  "615": (i,a) => `https://aviationcargo.dhl.com/track/${i}-${a}`,
  "724": (i,a) => `https://offerandorder.swissworldcargo.com/app/offerandorder/#/shipments/list?type=D&values=${i}${a}`,
  "729": (i,a) => `https://cargoapps.aviancacargo.com/#/e-tracking/details/${i}-${a}`,
  "881": (i,a) => `https://www.condor.com/eu/en/cargo/tracking.jsp?awb=${i}${a}`,
  "996": (i,a) => `https://uxtracking.com/tracking.asp?prefix=${i}&Serial=${a}`,
};
```

Nenhuma outra alteração necessária -- o botão que renderiza o link externo já existe no componente, apenas faltavam os mapeamentos.

