import { DhlAwbTracking, AlertCategory } from "./TrackingTypes";

export const airlineTrackingLinks: Record<string, string> = {
  "014": "https://www.aircanada.com/cargo/tracking?awbnb=${pr}-${awb}",
  "074": "https://www.latamcargo.com/pt/cargo-status/tracking?awbPrefix=045&awbSuffix=${awb}",
  "145": "https://www.latamcargo.com/pt/cargo-status/tracking?awbPrefix=045&awbSuffix=${awb}",
  "045": "https://www.latamcargo.com/pt/cargo-status/tracking?awbPrefix=045&awbSuffix=${awb}",
  "176": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "020": "https://www.lufthansa-cargo.com/tracking/awb?AWB_PREFIX=020&AWB_SUFFIX=${awb}",
  "695": "https://ecom.klmcargo.com/ecobff/routingInfo?airWaybillPrefix=074&airWaybillSuffix=${awb}&source=trackingSearch",
  "057": "https://www.afklcargo.com/mycargo/shipment/detail/${pr}-${awb}",
  "083": "https://www.cma-cgm.com/ebusiness/tracking/air/${pr}${awb}",
  "127": "https://golfreteselogistica.gollog.com/rastreamento?awb=${pr}${awb}",
  "157": "https://www.qrcargo.com/s/track-your-shipment",
  "618": "https://www.qrcargo.com/tracking?AWB=618-${awb}",
  "125": "https://www.britishairways.com/travel/cargo-tracking/public/en_us?awb=125-${awb}",
  "160": "https://www.cathaycargo.com/en-us/track-and-trace.html",
  "141": "https://www.klmcargo.com/en/tracking/${awb}",
  "180": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "186": "https://www.emirates.com/ae/english/cargo/tracking/?awb=176-${awb}",
  "729": "https://cargoapps.aviancacargo.com/#/e-tracking/details/${formattedAwb}",
  "147": "https://ebooking.champ.aero/trace/AT/trace.asp",
  "605": "https://cargo.skyairline.com/rastreo",
  "996": "https://uxtracking.com/tracking.asp?prefix=996&Serial=${awb}",
   "139": "https://amcargo.aeromexico.com/seguimiento/resultado/${formattedAwb}",
   "172": "https://www.cargolux.com/track-and-Trace#numbers=${pr}-${awb}",
};

export const getAirlinePrefix = (awbNumber: string): string => {
  if (!awbNumber || awbNumber.length < 3) return "";
  const numericPart = awbNumber.replace(/\D/g, "");
  return numericPart.slice(0, 3);
};

export const getFormattedTrackingLink = (awbNumber: string): string | null => {
  const prefix = getAirlinePrefix(awbNumber);
  const numericPart = awbNumber.replace(/\D/g, "");
  const awb = numericPart.slice(-8);

  if (!prefix || !awb) return null;

  const baseUrl = airlineTrackingLinks[prefix];
  if (!baseUrl) return null;

  return baseUrl
    .replace("${pr}", prefix)
    .replace("${awb}", awb)
    .replace("${formattedAwb}", `${prefix}-${awb}`);
};

export const getBugAlertColor = (awb: DhlAwbTracking | null, isSelected: boolean): string => {
  if (!awb) {
    return isSelected ? "bg-muted text-foreground" : "bg-card text-muted-foreground";
  }

  const { status, days_in_transit, nfd_counter } = awb;

  if (awb.bug_alert) {
    return isSelected ? "bg-destructive text-destructive-foreground" : "bg-destructive/80 text-destructive-foreground";
  }

  if (status === "ENTREGUE" || status === "DELIVERED") {
    return isSelected ? "bg-green-700 text-foreground" : "bg-green-800/80 text-green-100";
  }

  if (status === "ALERTA" || status === "DELAYED") {
    if (days_in_transit !== null && days_in_transit !== undefined && days_in_transit > 10) {
      return isSelected ? "bg-destructive text-destructive-foreground" : "bg-destructive/80 text-destructive-foreground";
    }

    if (nfd_counter !== null && nfd_counter !== undefined && nfd_counter > 2) {
      return isSelected ? "bg-orange-700 text-foreground" : "bg-orange-800/80 text-orange-100";
    }

    return isSelected ? "bg-primary/90 text-primary-foreground" : "bg-primary/70 text-primary-foreground";
  }

  if (days_in_transit !== null && days_in_transit !== undefined && days_in_transit > 15) {
    return isSelected ? "bg-destructive text-destructive-foreground" : "bg-destructive/80 text-destructive-foreground";
  }

  return isSelected ? "bg-muted text-foreground" : "bg-card text-muted-foreground";
};

export const getBugAlertDescription = (awb: DhlAwbTracking | null): string => {
  if (!awb) return "Nenhuma AWB selecionada";

  const issues = [];

  if (awb.bug_alert) {
    issues.push("Essa carga possui BUG ALERT no sistema.");
  }

  if (awb.days_in_transit !== null && awb.days_in_transit !== undefined && awb.days_in_transit > 15) {
    issues.push(`A carga está há ${awb.days_in_transit} dias em trânsito, o que é considerado muito acima do normal.`);
  }

  if (awb.nfd_counter !== null && awb.nfd_counter !== undefined && awb.nfd_counter > 2) {
    issues.push(`Já foram registrados ${awb.nfd_counter} eventos de NFD para essa carga, indicando possíveis problemas recorrentes.`);
  }

  if (awb.status === "ALERTA" || awb.status === "DELAYED") {
    issues.push("Essa AWB está atualmente em status de ALERTA no rastreio.");
  }

  if (issues.length === 0) {
    return "Nenhum alerta crítico identificado para essa AWB.";
  }

  return issues.join(" ");
};

export const getAlertCategory = (awb: DhlAwbTracking): AlertCategory => {
  if (awb.bug_alert || (awb.days_in_transit ?? 0) > 15 || (awb.nfd_counter ?? 0) > 2) {
    return "critical";
  }

  if (awb.status === "ALERTA" || awb.status === "DELAYED" || (awb.days_in_transit ?? 0) > 10) {
    return "delayed";
  }

  return "on_time";
};

export const getStatusBadgeColor = (awb: DhlAwbTracking) => {
  if (awb.bug_alert || (awb.days_in_transit ?? 0) > 15 || (awb.nfd_counter ?? 0) > 2) {
    return "bg-destructive/20 border border-destructive/60 text-destructive";
  }

  if (awb.status === "ALERTA" || awb.status === "DELAYED") {
    return "bg-primary/20 border border-primary/60 text-primary";
  }

  if (awb.status === "ENTREGUE" || awb.status === "DELIVERED") {
    return "bg-green-900/70 border border-green-500/60 text-green-300";
  }

  return "bg-muted border border-border text-muted-foreground";
};

export const getStatusLabel = (awb: DhlAwbTracking) => {
  if (awb.bug_alert) return "BUG ALERT";
  if ((awb.days_in_transit ?? 0) > 20) return "ACIMA DE 20 DIAS";
  if ((awb.days_in_transit ?? 0) > 15) return "ACIMA DE 15 DIAS";
  if ((awb.days_in_transit ?? 0) > 10) return "ACIMA DE 10 DIAS";
  if ((awb.nfd_counter ?? 0) > 3) return "> 3 NFDs";
  if ((awb.nfd_counter ?? 0) > 1) return "> 1 NFD";
  return awb.status || "EM ANDAMENTO";
};

export const getStatusTextColor = (status: string | null) => {
  switch (status) {
    case "ENTREGUE":
    case "DELIVERED":
      return "text-green-400";
    case "ALERTA":
    case "DELAYED":
      return "text-primary";
    case "CRÍTICO":
    case "CRITICAL":
      return "text-destructive";
    default:
      return "text-foreground";
  }
};

export const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return value;
  }
};

export const formatDate = (value: string | null) => {
  if (!value) return "-";
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(date);
  } catch {
    return value;
  }
};

export const formatAwbForDisplay = (awbNumber: string | null) => {
  if (!awbNumber) return "-";
  const numericPart = awbNumber.replace(/\D/g, "");
  if (numericPart.length < 11) return awbNumber;

  const prefix = numericPart.slice(0, 3);
  const number = numericPart.slice(3);
  return `${prefix}-${number}`;
};
