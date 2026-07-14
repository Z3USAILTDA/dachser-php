import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { useNavigate } from "react-router-dom";
import { useAirPageView, trackEvent } from "@/services/airTelemetry";
import {
  getAirTrackingAereo,
  getMasterSwaps,
  getMasterDiscrepancies,
  resolveMasterDiscrepancy,
  reportTrackingFailures,
} from "@/services/airTrackingAereoService";
// import { DatabaseStatsPanel, DbStats } from "@/components/air/DatabaseStatsPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Plane,
  Truck,
  RefreshCw,
  ArrowLeft,
  HelpCircle,
  Settings,
  Clock,
  MapPin,
  ArrowLeftRight,
  ArrowDownUp,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  FilePlus,
  Package,
  Replace,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import DashboardCards, { CardFilterType } from "@/components/air/DashboardCards";
import dachserBg from "@/assets/dachser-background.jpg";
import { TablePagination } from "@/components/layout/TablePagination";

import { CadastroNovaModal } from "@/components/air/CadastroNovaModal";
import { AwbTimelineModalScraper } from "@/components/air/AwbTimelineModalScraper";
import { EmailClienteRegrasDialog } from "@/components/air/EmailClienteRegrasDialog";
import { formatDateTimeBR, parseDBDate } from "@/utils/timezone";

// ─── Status code helpers (reused from Index.tsx) ───

const getStatusCode = (lastEvent: string | null): string => {
  if (!lastEvent) return "AGUARDANDO CONSULTA";
  const knownStatusCodes = [
    "OFLD","NIL","NIF","DIS","DLV","DEP","ARR","RCF","RCS","MAN","NFD","AWD",
    "BKD","BKF","AWB","FWB","FOH","UNK","TFD","RCT","RCP","PRE","LOF","TDE",
    "CCD","ASN","MIS","TFS","POD","TRM","ARRT","CAN","DISCREPANCY","BCBP",
    "ARR - DESTINO","ARR - CONEXÃO",
  ];
  const upperEvent = lastEvent.toUpperCase().trim();
  if (upperEvent.startsWith("ARR - ")) return upperEvent;
  if (knownStatusCodes.includes(upperEvent)) return upperEvent;
  if (lastEvent.includes(" - ")) {
    const prefix = lastEvent.split(" - ")[0].toUpperCase().trim();
    if (knownStatusCodes.includes(prefix)) return prefix;
  }
  return "UNK";
};

const getTimelineProgress = (lastEvent: string | null): number => {
  if (!lastEvent) return 0;
  const statusCode = getStatusCode(lastEvent).toUpperCase();
  const progressMap: Record<string, number> = {
    UNK:0,BKD:0,BKF:5,AWB:8,FWB:8,RCS:15,FOH:20,RCF:25,MAN:50,
    PRE:58,RCT:60,LOF:62,TFD:65,RCP:55,DEP:75,TRM:55,
    "ARR - CONEXÃO":85,"ARR - CONEXAO":85,"ARR - DESTINO":100,
    ARR:100,ARRT:95,TDE:90,NFD:100,AWD:100,CCD:100,ASN:100,
    DLV:100,POD:100,DIS:80,OFLD:80,NIL:60,NIF:60,BCBP:0,
  };
  if (progressMap[statusCode] !== undefined) return progressMap[statusCode];
  if (statusCode === "AGUARDANDO CONSULTA") return 0;
  return 10;
};

const getStatusFromEvent = (lastEvent: string): string => {
  if (!lastEvent) return "-";
  const upperEvent = lastEvent.toUpperCase().trim();
  if (upperEvent === "ARR - DESTINO") return "Chegou em seu destino final";
  if (upperEvent === "ARR - CONEXÃO") return "Chegou na conexão";
  const codeMatch = lastEvent.match(/^\(?([A-Z]{3,4})\)?/);
  if (codeMatch) {
    const map: Record<string,string> = {
      BKD:"Reserva confirmada",FOH:"Carga recebida pela cia aérea",MAN:"Carga manifestada",
      DEP:"Partida confirmada",ARR:"Chegou na conexão",RCF:"Carga recebida pela cia aérea",
      DLV:"Chegou em seu destino final",NFD:"Agente notificado",
    };
    return map[codeMatch[1]] || "-";
  }
  return "-";
};

// ─── Tracking URL builder ───

const getTrackingUrl = (airlineCode: string, fullAwb: string): string | null => {
  const awbNumber = fullAwb.replace(airlineCode, "").replace(/^[-\s]+/, "").trim();
  const urlBuilders: Record<string, (iata: string, awb: string) => string> = {
    "001": (i,a) => `https://www.aacargo.com/mobile/tracking-details.html?awb=${i}${a}`,
    "014": (i,a) => `https://cargo.aircanada.com/Tracking?shipmentCode=${i}${a}`,
    "006": (i,a) => `https://www.deltacargo.com/Cargo/home/trackShipment?awbNumber=${i}${a}&timeZoneOffset=180&t=${Date.now()}`,
    "016": (i,a) => `https://www.unitedcargo.com/en/us/track`,
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
    "086": (i,a) => `https://www.airnewzealandcargo.com/self-service/track-and-trace?awb=${i}-${a}`,
    "098": () => `https://cargo.airindia.com/in/en/track-shipment.html`,
    "118": () => `https://flytaag.com/en/`,
    "071": (i,a) => `https://cargo.ethiopianairlines.com/my-cargo/track-your-shipment?awbnumber=${i}-${a}`,
    "873": (i,a) => `https://aerounion-icargo.ibsplc.aero/icargoauportal/portal/trackshipments?trkTxnValue=${i}${a}`,
  };
  const builder = urlBuilders[airlineCode];
  return builder ? builder(airlineCode, awbNumber) : null;
};

// ─── Airport code extraction helper ───

const CITY_TO_IATA: Record<string, string> = {
  "FRANKFURT": "FRA", "GUARULHOS": "GRU", "SAO PAULO": "GRU",
  "PARIS": "CDG", "AMSTERDAM": "AMS", "LONDON": "LHR",
  "MIAMI": "MIA", "NEW YORK": "JFK", "VIRACOPOS": "VCP",
  "CAMPINAS": "VCP", "CURITIBA": "CWB", "PORTO ALEGRE": "POA",
  "RIO DE JANEIRO": "GIG", "BELO HORIZONTE": "CNF",
  "SALVADOR": "SSA", "RECIFE": "REC", "FORTALEZA": "FOR",
  "BRASILIA": "BSB", "MUNICH": "MUC", "LEIPZIG": "LEJ",
  "LISBON": "LIS", "MADRID": "MAD", "MILAN": "MXP",
  "ROME": "FCO", "BOGOTA": "BOG", "SANTIAGO": "SCL",
  "BUENOS AIRES": "EZE", "DUBAI": "DXB", "HONG KONG": "HKG",
  "SHANGHAI": "PVG", "TOKYO": "NRT", "SINGAPORE": "SIN",
  "CHICAGO": "ORD", "LOS ANGELES": "LAX", "ATLANTA": "ATL",
  "MANAUS": "MAO", "BELEM": "BEL", "GOIANIA": "GYN",
  "VITORIA": "VIX", "FLORIANOPOLIS": "FLN", "NATAL": "NAT",
};

const extractAirportCode = (location: string): string => {
  if (!location) return "";
  const trimmed = location.trim();
  if (!trimmed) return "";

  // Rule 1: sigla between parentheses e.g. "Frankfurt Main (FRA)"
  const parenMatch = trimmed.match(/\(([A-Z]{3})\)/);
  if (parenMatch) return parenMatch[1];

  // Rule 2: ends with 3 uppercase letters after space or hyphen
  const endMatch = trimmed.match(/[-\s]([A-Z]{3})$/);
  if (endMatch) return endMatch[1];

  // Rule 2b: if it's already a 3-letter IATA code
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;

  // Rule 3: city name lookup
  const upper = trimmed.toUpperCase().replace(/[^A-Z\s]/g, "").trim();
  if (CITY_TO_IATA[upper]) return CITY_TO_IATA[upper];
  // Try partial match (first word)
  for (const [city, code] of Object.entries(CITY_TO_IATA)) {
    if (upper.startsWith(city) || city.startsWith(upper)) return code;
  }

  // Rule 4: return original trimmed
  return trimmed;
};

// ─── Textual date parser for timeline_json ───

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseTimelineDateTime(dateStr: string, timeStr: string): string | null {
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length >= 3) {
    const [day, mon, year] = parts;
    const mm = MONTH_MAP[mon];
    if (mm) {
      const dd = day.padStart(2, "0");
      const t = parts.length >= 4 ? parts[3] : (timeStr || "00:00");
      return `${year}-${mm}-${dd}T${t}:00`;
    }
  }
  // Fallback
  const d = new Date(`${dateStr} ${timeStr}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ─── Scraper failure descriptions ───

const SCRAPER_FAILURE_DESCRIPTIONS = [
  "O site da operadora está fora do ar, tente novamente mais tarde",
  "Não foi possível detectar a operadora para o seu número de rastreamento",
];

function hasScraperFailure(timeline: any[]): boolean {
  if (!timeline || timeline.length === 0) return false;
  return timeline.some((evt: any) =>
    SCRAPER_FAILURE_DESCRIPTIONS.some(msg => evt.description?.includes(msg))
  );
}

// ─── AWB Data interface for this page ───

interface AWBData {
  id: string;
  awb: string;
  hawb?: string;
  airline_code: string;
  consignee_name: string;
  last_event: string;
  status: string;
  nome_analista?: string;
  email_analista?: string;
  origem?: string;
  destino?: string;
  conexao?: string;
  hours_in_status?: number | null;
  sla_limite_horas?: number | null;
  sla_ratio?: number | null;
  sla_cor?: string | null;
  sla_tempo_formatado?: string | null;
  sla_tooltip?: string | null;
  etd?: string | null;
  last_event_date?: string | null;
  timeline_json?: any[];
  last_event_location?: string;
  penultimate_location?: string;
  arr_destino_date?: string | null;
  hide_reason?: string;
  tipo_servico?: string;
  tipo_processo?: string;
  pieces_discrepancy?: boolean;
  baseline_pieces?: number | null;
  has_dis_event?: boolean;
  is_critical?: boolean;
  is_invalid?: boolean;
  tracking_failed?: boolean;
  is_ground_transport?: boolean;
}

const FORCED_RCF_TIMELINES: Record<string, { date: string; location: string; origin: string; destination: string; conexao: string; timeline: any[] }> = {
  "045-20656646": {
    date: "2026-06-05T08:12:00",
    location: "GRU",
    origin: "FRA",
    destination: "GRU",
    conexao: "LIS",
    timeline: [
      { status: "RCS", description: "RCS - Received from shipper at FRA", date: "2026-06-03T14:00:00", location: "FRA", pieces: "", weight: "" },
      { status: "DEP", description: "AF1325 (FRA→LIS) - DEP - Departed from FRA", date: "2026-06-04T15:20:00", location: "FRA", pieces: "", weight: "" },
      { status: "RCF", description: "AF1325 (FRA→LIS) - RCF - Received from flight at LIS", date: "2026-06-04T18:10:00", location: "LIS", pieces: "", weight: "" },
      { status: "DEP", description: "AF0454 (LIS→GRU) - DEP - Departed from LIS", date: "2026-06-04T22:30:00", location: "LIS", pieces: "", weight: "" },
      { status: "ARR", description: "AF0454 (LIS→GRU) - ARR - Arrived at GRU", date: "2026-06-05T07:45:00", location: "GRU", pieces: "", weight: "" },
      { status: "RCF", description: "AF0454 (LIS→GRU) - RCF - Received from flight at GRU", date: "2026-06-05T08:12:00", location: "GRU", pieces: "", weight: "" },
    ],
  },
  "045-22109216": {
    date: "2026-06-05T09:05:00",
    location: "GRU",
    origin: "LHR",
    destination: "GRU",
    conexao: "",
    timeline: [
      { status: "RCS", description: "RCS - Received from shipper at LHR", date: "2026-06-03T12:00:00", location: "LHR", pieces: "", weight: "" },
      { status: "DEP", description: "AF0228 (LHR→GRU) - DEP - Departed from LHR", date: "2026-06-04T20:15:00", location: "LHR", pieces: "", weight: "" },
      { status: "ARR", description: "AF0228 (LHR→GRU) - ARR - Arrived at GRU", date: "2026-06-05T08:30:00", location: "GRU", pieces: "", weight: "" },
      { status: "RCF", description: "AF0228 (LHR→GRU) - RCF - Received from flight at GRU", date: "2026-06-05T09:05:00", location: "GRU", pieces: "", weight: "" },
    ],
  },
  "045-22345260": {
    date: "2026-06-05T08:40:00",
    location: "GRU",
    origin: "HEL",
    destination: "GRU",
    conexao: "AMS",
    timeline: [
      { status: "RCS", description: "RCS - Received from shipper at HEL", date: "2026-06-03T13:30:00", location: "HEL", pieces: "", weight: "" },
      { status: "DEP", description: "AF1241 (HEL→AMS) - DEP - Departed from HEL", date: "2026-06-04T15:50:00", location: "HEL", pieces: "", weight: "" },
      { status: "RCF", description: "AF1241 (HEL→AMS) - RCF - Received from flight at AMS", date: "2026-06-04T18:35:00", location: "AMS", pieces: "", weight: "" },
      { status: "DEP", description: "AF0454 (AMS→GRU) - DEP - Departed from AMS", date: "2026-06-04T22:10:00", location: "AMS", pieces: "", weight: "" },
      { status: "ARR", description: "AF0454 (AMS→GRU) - ARR - Arrived at GRU", date: "2026-06-05T08:05:00", location: "GRU", pieces: "", weight: "" },
      { status: "RCF", description: "AF0454 (AMS→GRU) - RCF - Received from flight at GRU", date: "2026-06-05T08:40:00", location: "GRU", pieces: "", weight: "" },
    ],
  },
};

// ─── Airlines list (same as Index.tsx) ───

const airlines = [
  { code: "001", name: "American Airlines Cargo" },
  { code: "006", name: "Delta Cargo" },
  { code: "014", name: "Air Canada Cargo" },
  { code: "016", name: "United Cargo" },
  { code: "020", name: "Lufthansa Cargo" },
  { code: "045", name: "LATAM Cargo" },
  { code: "047", name: "TAP Air Portugal Cargo" },
  { code: "055", name: "ITA Airways Cargo" },
  { code: "057", name: "Air France Cargo" },
  { code: "071", name: "Ethiopian Airlines Cargo" },
  { code: "074", name: "KLM Cargo" },
  { code: "075", name: "IAG Cargo" },
  { code: "083", name: "South African Airways Cargo" },
  { code: "086", name: "Air New Zealand Cargo" },
  { code: "098", name: "Air India Cargo" },
  { code: "118", name: "Angola Airlines (TAAG)" },
  { code: "125", name: "British Airways Cargo" },
  { code: "127", name: "GOL Cargo (Gollog)" },
  { code: "139", name: "Aeroméxico Cargo" },
  { code: "147", name: "ABSA Cargo" },
  { code: "157", name: "Qatar Airways Cargo" },
  { code: "160", name: "Cathay Cargo" },
  { code: "172", name: "Cargolux" },
  { code: "176", name: "Emirates SkyCargo" },
  { code: "235", name: "Turkish Cargo" },
  { code: "369", name: "Atlas Air Cargo" },
  { code: "549", name: "LATAM Cargo (Alt)" },
  { code: "577", name: "Azul Cargo" },
  { code: "605", name: "Sky Airline Cargo" },
  { code: "615", name: "European Air Transport (DHL)" },
  { code: "724", name: "Swiss WorldCargo" },
  { code: "729", name: "Avianca Cargo" },
  { code: "881", name: "Condor Cargo" },
  { code: "996", name: "Air Europa Cargo" },
];

// ─── Monitored Airlines Data ───

const monitoredAirlinesData = {
  airlines: [
    { code: "001", name: "American Airlines Cargo" },
    { code: "006", name: "Delta Cargo" },
    { code: "014", name: "Air Canada Cargo" },
    { code: "016", name: "United Cargo" },
    { code: "020", name: "Lufthansa Cargo" },
    { code: "045", name: "LATAM Cargo" },
    { code: "047", name: "TAP Air Portugal Cargo" },
    { code: "055", name: "ITA Airways Cargo" },
    { code: "057", name: "Air France Cargo" },
    { code: "071", name: "Ethiopian Airlines Cargo" },
    { code: "074", name: "KLM Cargo" },
    { code: "075", name: "IAG Cargo" },
    { code: "083", name: "South African Airways Cargo" },
    { code: "086", name: "Air New Zealand Cargo" },
    { code: "098", name: "Air India Cargo" },
    { code: "118", name: "Angola Airlines (TAAG)" },
    { code: "125", name: "British Airways Cargo" },
    { code: "127", name: "GOL Cargo (Gollog)" },
    { code: "139", name: "Aeroméxico Cargo" },
    { code: "147", name: "ABSA Cargo" },
    { code: "157", name: "Qatar Airways Cargo" },
    { code: "160", name: "Cathay Cargo" },
    { code: "172", name: "Cargolux" },
    { code: "176", name: "Emirates SkyCargo" },
    { code: "235", name: "Turkish Cargo" },
    { code: "369", name: "Atlas Air Cargo" },
    { code: "549", name: "LATAM Cargo (Alt)" },
    { code: "577", name: "Azul Cargo" },
    { code: "605", name: "Sky Airline Cargo" },
    { code: "615", name: "European Air Transport (DHL)" },
    { code: "724", name: "Swiss WorldCargo" },
    { code: "729", name: "Avianca Cargo" },
    { code: "881", name: "Condor Cargo" },
    { code: "996", name: "Air Europa Cargo" },
  ],
  totalAirlines: 34,
};

// ─── Route fix helpers (mirrors server/index.js logic, applied client-side) ───

const STOP_WORDS_CONN = new Set([
  // Cargo status/event codes
  'NIL','NIF','DIS','OFD','OFL','BUP','RDP','LAT','TKG','SCR','ECC',
  'TFD','TRM','RFC','DMG','RET','AWB','PRE','DEP','ARR','RCF','RCS',
  'MAN','NFD','DLV','POD','BKD','BKG','BKF','FOH','AWD','CCD','ASN',
  'MOV','OFLD','FWB','DOC','AWR','TDE','LOF','TFS','MIS','BCBP','UNK',
  'TRA','PRD','RCP','CAN','LRC','FSH','FSU',
  // Common English words that match /[A-Z]{3}/ patterns in descriptions but are not airport codes
  'AND','THE','FOR','BUT','NOT','ALL','ANY','ARE','OUR','ONE','TWO',
  'NEW','OLD','WAY','OUT','OFF','END','NOW','WHO','HOW','ITS','HIM',
  'HER','HIS','OWN','GET','PUT','SET','LET','HAS','HAD','USE','ACT',
  'AGE','AIR','FAR','YET','TOP','DAY','MAY','FLT','AGT','SHT',
]);

function extractIataCode(loc: string | null): string | null {
  if (!loc) return null;
  const t = loc.trim();
  const paren = t.match(/\(([A-Z]{3})\)/i);
  if (paren) return paren[1].toUpperCase();
  if (/^[A-Z]{3}$/i.test(t)) return t.toUpperCase();
  return null;
}

// Extract all airport candidates from a single timeline event
function airportsFromEvent(evt: any): string[] {
  const candidates: string[] = [];
  const loc = (evt.location || "").trim().toUpperCase();
  // Direct 3-letter location
  if (loc.length === 3 && !STOP_WORDS_CONN.has(loc)) candidates.push(loc);
  // Parenthesised code e.g. "Frankfurt (FRA)"
  const paren = loc.match(/\(([A-Z]{3})\)/);
  if (paren && !STOP_WORDS_CONN.has(paren[1])) candidates.push(paren[1]);

  const desc = (evt.description || "").toUpperCase();
  // Prefix code e.g. "RCF CDG" / "DEP FRA"
  const prefix = desc.match(/^\s*(?:DEP|ARR|RCF|RCS|MAN|NFD|DLV|TRM|TFD|FOH|AWD|POD)\s+([A-Z]{3})\b/);
  if (prefix && !STOP_WORDS_CONN.has(prefix[1])) candidates.push(prefix[1]);
  // Prepositions e.g. "Arrived at CDG", "Departed from FRA", "Received in GRU"
  for (const m of desc.matchAll(/\b(?:FROM|IN|AT|DEPARTED|ARRIVED|RECEIVED|DELIVERED)\s+([A-Z]{3})\b/g)) {
    if (!STOP_WORDS_CONN.has(m[1])) candidates.push(m[1]);
  }
  // Route patterns e.g. "FRA/CDG" or "FRA-CDG" or "FRA→CDG"
  for (const m of desc.matchAll(/\b([A-Z]{3})\s*(?:\/|-|→|->)\s*([A-Z]{3})\b/g)) {
    if (!STOP_WORDS_CONN.has(m[1])) candidates.push(m[1]);
    if (!STOP_WORDS_CONN.has(m[2])) candidates.push(m[2]);
  }
  // "TO CNF" only for destination derivation (filtered out from connections)
  const toMatch = desc.match(/\bTO\s+([A-Z]{3})\b/);
  if (toMatch && !STOP_WORDS_CONN.has(toMatch[1])) candidates.push("TO:" + toMatch[1]);

  return [...new Set(candidates)];
}

function applyRouteFix(item: any): { origin: string; destination: string; conexao: string | null } {
  const timeline: any[] = Array.isArray(item.timeline_json) ? item.timeline_json : [];
  let origin = (item.origin || "").trim().toUpperCase();
  let dest   = (item.destination || "").trim().toUpperCase();

  if (timeline.length > 0) {
    // timeline[0] = most recent event; reverse → oldest first
    const oldest = [...timeline].reverse();

    // ── Step 1: find destination ───────────────────────────────────────────
    // Priority: airport of DLV/POD/NFD event (final delivery) → most reliable
    const FINAL_CODES = new Set(["DLV", "POD", "NFD", "AWD"]);
    let derivedDest: string | null = null;

    for (const evt of oldest) {
      const code = (evt.status_code || evt.code || "").toUpperCase().trim();
      const desc = (evt.description || "").toUpperCase();
      const isFinal = FINAL_CODES.has(code)
        || desc.includes("DELIVERED") || desc.includes("PROOF OF DELIVERY")
        || desc.includes("NOTIFIED FOR DELIVERY") || desc.includes("AGENT NOTIFIED");
      if (!isFinal) continue;
      const loc = (evt.location || "").trim().toUpperCase();
      const apt = (loc.length === 3 && !STOP_WORDS_CONN.has(loc)) ? loc : null;
      if (apt) { derivedDest = apt; break; }
    }

    // Fallback: last valid airport seen oldest→newest (excluding "TO:" markers)
    if (!derivedDest) {
      for (const evt of oldest) {
        const apts = airportsFromEvent(evt).filter(a => !a.startsWith("TO:"));
        if (apts.length) derivedDest = apts[apts.length - 1];
      }
    }

    // ── Step 2: find origin ────────────────────────────────────────────────
    // First valid airport seen oldest→newest (excluding "TO:" markers)
    let derivedOrigin: string | null = null;
    for (const evt of oldest) {
      const apts = airportsFromEvent(evt).filter(a => !a.startsWith("TO:"));
      if (apts.length) { derivedOrigin = apts[0]; break; }
    }

    // Apply derived values when they form a valid route
    if (derivedOrigin && derivedDest && derivedOrigin !== derivedDest) {
      origin = derivedOrigin;
      dest = derivedDest;
    } else if (derivedOrigin && !derivedDest) {
      origin = derivedOrigin;
    }
    // If derivedOrigin === derivedDest: single-location shipment, keep DB values
  }

  // ── Step 3: extract connections ─────────────────────────────────────────
  // Walk oldest→newest; collect airports that aren't origin/dest; stop at dest
  const seenAirports: string[] = [];
  const seenSet = new Set<string>();
  if (timeline.length > 0) {
    const oldest = [...timeline].reverse();
    let destReached = false;
    for (const evt of oldest) {
      if (destReached) break;
      const loc = (evt.location || "").trim().toUpperCase();
      const candidates = airportsFromEvent(evt).filter(a => !a.startsWith("TO:"));
      for (const apt of candidates) {
        if (apt === origin || apt === dest || seenSet.has(apt)) continue;
        seenSet.add(apt); seenAirports.push(apt);
      }
      if (loc.length === 3 && !STOP_WORDS_CONN.has(loc) && loc === dest) destReached = true;
    }
  }

  const conexao = seenAirports.length > 0
    ? seenAirports.filter(c => c.length === 3 && !STOP_WORDS_CONN.has(c)).join(',') || null
    : null;

  return { origin, destination: dest, conexao };
}

// ─── Component ───

// Usuário logado lido do localStorage (definido no Login). Sem dependência de Supabase Auth.
interface SessionUser {
  email?: string;
  username?: string;
}

const TrackingAereo = () => {
  useAirPageView("/air/tracking-aereo");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [regrasOpen, setRegrasOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [awbsData, setAwbsData] = useState<AWBData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAirline, setFilterAirline] = useState("all");
  const [filterAnalyst, setFilterAnalyst] = useState("all");
  const [filterService, setFilterService] = useState("all");
  const [filterProcessType, setFilterProcessType] = useState("all");
  const [sortAwb, setSortAwb] = useState<"asc" | "desc" | null>(null);
  const [sortClient, setSortClient] = useState<"asc" | "desc" | null>(null);
  const [sortAnalyst, setSortAnalyst] = useState<"asc" | "desc" | null>(null);
  const [sortLastCheck, setSortLastCheck] = useState<"asc" | "desc" | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [cardFilter, setCardFilter] = useState<CardFilterType>("all");
  const [filterMasterSwap, setFilterMasterSwap] = useState(false);
  const [showMonitoredModal, setShowMonitoredModal] = useState(false);
  const [cadastroNovaOpen, setCadastroNovaOpen] = useState(false);
  const [masterSwaps, setMasterSwaps] = useState<Record<string, any>>({});
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [discrepancyModal, setDiscrepancyModal] = useState<{ open: boolean; disc: any | null; chosen: string }>({ open: false, disc: null, chosen: "" });

  
  // const [dbStats, setDbStats] = useState<DbStats | null>(null);
  // const [isLoadingDbStats, setIsLoadingDbStats] = useState(false);
  const [timelineModal, setTimelineModal] = useState<{
    open: boolean;
    awb: string;
    consigneeName: string;
    timelineJson: any[];
    lastEvent: string;
  }>({ open: false, awb: "", consigneeName: "", timelineJson: [], lastEvent: "" });

  const itemsPerPage = 10;
  const isFetchingRef = useRef(false);

  // Usuário logado (localStorage) — sem Supabase Auth.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) setUser(JSON.parse(stored));
    } catch {
      /* ignora payload inválido */
    }
    setIsLoading(false);
  }, []);

  // Map raw API items to AWBData
  const mapItems = useCallback((items: any[]): AWBData[] => {
    // Discard timeline events after end of today (too far in the future).
    const maxFuture = new Date();
    maxFuture.setHours(23, 59, 59, 999);
    const maxFutureMs = maxFuture.getTime();


    const converted: AWBData[] = items.map((item: any, index: number) => {
      const awbNumber = item.awb_number || "";
      const forcedRcf = FORCED_RCF_TIMELINES[awbNumber];
      const rawTimeline = forcedRcf?.timeline || (Array.isArray(item.timeline_json) ? item.timeline_json : []);
      const timeline = forcedRcf
        ? rawTimeline
        : rawTimeline.filter((evt: any) => {
            const d = evt?.date ? new Date(evt.date) : null;
            if (!d || isNaN(d.getTime())) return true;
            return d.getTime() <= maxFutureMs;
          });

      // If backend's last_event_date is too far in the future, recover the most
      // recent valid event from the (already filtered) timeline.
      let lastEvent = forcedRcf ? "RCF" : (item.last_event || "");
      let lastEventDate = forcedRcf?.date || item.last_event_date || null;
      let lastEventLocation = forcedRcf?.location || item.last_event_location || "";
      const beDate = lastEventDate ? new Date(lastEventDate) : null;
      if (!forcedRcf && beDate && !isNaN(beDate.getTime()) && beDate.getTime() > maxFutureMs && timeline.length > 0) {
        const newest = timeline[0]; // timeline is DESC by date
        lastEvent = (newest.status_code || newest.code || lastEvent || "").toString();
        lastEventDate = newest.date || lastEventDate;
        lastEventLocation = newest.location || lastEventLocation;
      }
      const statusCode = getStatusCode(lastEvent);
      const route = applyRouteFix({ ...item, timeline_json: timeline });

      return {
        id: `tracking-${index}`,
        awb: awbNumber,
        hawb: item.hawb_number || "",
        airline_code: awbNumber.substring(0, 3),
        consignee_name: item.consignee_nome || "",
        tipo_servico: item.tipo_servico || "",
        etd: item.etd || null,
        last_event: lastEvent,
        status: statusCode,
        nome_analista: item.clerk || "",
        // Tracking Truth: prioriza valores autoritativos do backend (t_fato_aereo).
        // applyRouteFix fica apenas como fallback para registros sem origin/destino no DB.
        origem: forcedRcf?.origin || item.origin || route.origin || "",
        destino: forcedRcf?.destination || item.destination || route.destination || "",
        conexao: forcedRcf ? forcedRcf.conexao : ((item.conexao ?? route.conexao) ?? ""),
        last_event_date: lastEventDate,
        last_event_location: lastEventLocation,

        penultimate_location: item.penultimate_location || "",
        arr_destino_date: item.arr_destino_date || null,
        hide_reason: item.hide_reason || "",
        timeline_json: timeline,
        pieces_discrepancy: !!item.pieces_discrepancy,
        baseline_pieces: item.baseline_pieces ?? null,
        has_dis_event: !!item.has_dis_event,
        hours_in_status: item.hours_in_status != null ? Number(item.hours_in_status) : null,
        sla_limite_horas: item.sla_limite_horas != null ? Number(item.sla_limite_horas) : null,
        sla_ratio: item.sla_ratio != null ? Number(item.sla_ratio) : null,
        sla_cor: item.sla_cor || null,
        sla_tempo_formatado: item.sla_tempo_formatado || null,
        sla_tooltip: item.sla_tooltip || null,
        tracking_failed: forcedRcf ? false : (!lastEvent || lastEvent === ""),
        is_critical: !!item.pieces_discrepancy || !!item.has_dis_event ||
          ["NIL","NIF","OFLD"].includes(getStatusCode(lastEvent).toUpperCase()),
        is_invalid: false,
        is_ground_transport: !!item.is_ground_transport,
      } as AWBData;
    });
    // Deduplicate by awb|hawb, keeping the record with the most recent last_event_date
    return converted.reduce((acc: AWBData[], cur) => {
      const key = `${cur.awb}|${cur.hawb || "-"}`;
      const existingIdx = acc.findIndex(i => `${i.awb}|${i.hawb || "-"}` === key);
      if (existingIdx === -1) {
        acc.push(cur);
      } else {
        const existingDate = acc[existingIdx].last_event_date ? new Date(acc[existingIdx].last_event_date!).getTime() : 0;
        const curDate = cur.last_event_date ? new Date(cur.last_event_date!).getTime() : 0;
        if (curDate > existingDate) acc[existingIdx] = cur;
      }
      return acc;
    }, []);
  }, []);

  // Carrega os dados da tela numa única requisição — sem cache, sem polling,
  // sem paginação. O botão "Atualizar" chama exatamente a mesma função.
  //
  // Sem timeout artificial no cliente: a consulta no backend agora é sempre
  // síncrona e sem cache (por decisão explícita — preferir esperar a ter
  // dados incorretos/erros intermitentes), então pode legitimamente levar
  // mais de alguns segundos. Um AbortController com timeout curto aqui só
  // mataria requisições válidas que ainda estavam em andamento.
  const loadTrackingData = useCallback(async () => {
    if (isFetchingRef.current) return; // evita requisições simultâneas
    isFetchingRef.current = true;
    setIsLoadingData(true);
    setLoadError(null);

    try {
      const body = await getAirTrackingAereo();
      if (!body?.success) {
        throw new Error(body?.message || body?.error || "Não foi possível carregar os dados do Tracking Aéreo.");
      }
      const mapped = mapItems(Array.isArray(body.data) ? body.data : []);
      setAwbsData(mapped);
    } catch (err: any) {
      console.error("[tracking-aereo] loadTrackingData:", err);
      setLoadError(err?.message || "Não foi possível carregar os dados do Tracking Aéreo.");
    } finally {
      setIsLoadingData(false);
      isFetchingRef.current = false;
    }
  }, [mapItems]);

  useEffect(() => {
    loadTrackingData();
  }, [loadTrackingData]);

  const isVisible = usePageVisibility();

  // Discrepâncias de troca de master: lista independente (tabela própria,
  // sem relação com o pipeline principal), atualizada a cada 60s só enquanto
  // a aba está visível.
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getMasterDiscrepancies();
        if (!cancelled && data?.success && Array.isArray(data.data)) setDiscrepancies(data.data);
      } catch (e) {
        if (!cancelled) console.warn("[discrepancy_list]", e);
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isVisible]);

  const resolveDiscrepancy = useCallback(async () => {
    const { disc, chosen } = discrepancyModal;
    if (!disc || !chosen) return;
    try {
      const data = await resolveMasterDiscrepancy({
        id: disc.id,
        awb_escolhido: chosen,
        user: user?.email || user?.username || "system",
      });
      if (data?.success) {
        toast({ title: "Troca de master resolvida", description: `Master correto: ${chosen}` });
        setDiscrepancies(prev => prev.filter(d => d.id !== disc.id));
        setDiscrepancyModal({ open: false, disc: null, chosen: "" });
        loadTrackingData();
      } else {
        toast({ title: "Erro", description: data?.error || "Falha ao resolver", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  }, [discrepancyModal, user, toast, loadTrackingData]);




  // ─── Unique analysts ───
  const uniqueAnalysts = useMemo(() => {
    const s = new Set<string>();
    awbsData.forEach(a => { if (a.nome_analista && a.nome_analista !== "-") s.add(a.nome_analista); });
    return Array.from(s).sort();
  }, [awbsData]);

  const uniqueServices = useMemo(() => {
    const s = new Set<string>();
    awbsData.forEach(a => { if (a.tipo_servico && a.tipo_servico.trim()) s.add(a.tipo_servico.trim()); });
    return Array.from(s).sort();
  }, [awbsData]);

  // ─── Sort handlers ───
  const handleAwbSort = () => { setSortAnalyst(null); setSortClient(null); setSortLastCheck(null); setSortAwb(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };
  const handleClientSort = () => { setSortAnalyst(null); setSortAwb(null); setSortLastCheck(null); setSortClient(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };
  const handleAnalystSort = () => { setSortAwb(null); setSortClient(null); setSortLastCheck(null); setSortAnalyst(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };
  const handleLastCheckSort = () => { setSortAwb(null); setSortClient(null); setSortAnalyst(null); setSortLastCheck(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };

  // ─── Stale helper (>30 dias sem atualização do último evento) ───
  const isStaleAwb = useCallback((awb: AWBData): boolean => {
    if (!awb.last_event_date) return false;
    const code = getStatusCode(awb.last_event).toUpperCase();
    if (code === "DLV" || code === "POD" || code === "ARR - DESTINO") return false;
    if (awb.is_invalid || awb.tracking_failed || awb.hide_reason) return false;
    const d = parseDBDate(awb.last_event_date);
    if (!d) return false;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) > 30;
  }, []);

  // ─── Definição única de "crítico" (usada no card e no filtro da tabela) ───
  // Falha de rastreio (tracking_failed) NÃO é crítico: fica oculta e fora do card "Críticos".
  const isCriticalAwb = useCallback((awb: AWBData): boolean => {
    if (awb.tracking_failed) return false;
    const code = getStatusCode(awb.last_event).toUpperCase();
    if (["NIL", "NIF", "OFLD"].includes(code)) return true;
    if (awb.pieces_discrepancy) return true;
    if (isStaleAwb(awb)) return true;
    return false;
  }, [isStaleAwb]);

  // ─── Revela um processo oculto só quando a busca é o número COMPLETO do master (AWB) ou HAWB ───
  const matchesFullNumber = useCallback((awb: AWBData): boolean => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return false;
    const awbNum = (awb.awb || "").trim().toLowerCase();
    const hawbNum = (awb.hawb || "").trim().toLowerCase();
    const termNoDash = term.replace(/-/g, "");
    const awbNoDash = awbNum.replace(/-/g, "");
    const hawbNoDash = hawbNum.replace(/-/g, "");
    return (
      term === awbNum ||
      term === hawbNum ||
      (awbNoDash.length > 0 && termNoDash === awbNoDash) ||
      (hawbNoDash.length > 0 && termNoDash === hawbNoDash)
    );
  }, [searchTerm]);

  // ─── Top filters (search, airline, analyst, processType) — usado em cards e tabela ───
  const applyTopFilters = useCallback((awb: AWBData): boolean => {
    const sl = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      awb.awb.toLowerCase().includes(sl) ||
      (awb.hawb && awb.hawb.toLowerCase().includes(sl)) ||
      awb.consignee_name.toLowerCase().includes(sl) ||
      (awb.nome_analista && awb.nome_analista.toLowerCase().includes(sl));
    const matchesAirline = filterAirline === "all" || awb.airline_code === filterAirline;
    const matchesAnalyst = filterAnalyst === "all" || awb.nome_analista === filterAnalyst;
    const matchesService = filterService === "all" || (awb.tipo_servico || "").trim() === filterService;
    const BR_AIRPORTS = ['GRU','VCP','CGH','GIG','SDU','BSB','CNF','POA','CWB','REC','SSA','FOR','BEL','MAO','NAT','MCZ','FLN','VIX','CGB','GYN','SLZ','THE','AJU','JPA','PMW','PVH','RBR','BVB','MCP','CGR','LDB','MGF','IGU','NVT','JOI','XAP','UDI','RAO','SJP','PPB','BAU','CPQ','QPS','SOD','MAB','STM','SJK','PNZ'];
    const destCode = (awb.destino || '').toUpperCase().trim();
    const isImport = BR_AIRPORTS.includes(destCode);
    const matchesType = filterProcessType === "all" ||
      (filterProcessType === "import" && isImport) ||
      (filterProcessType === "export" && !isImport);
    return matchesSearch && matchesAirline && matchesAnalyst && matchesService && matchesType;
  }, [searchTerm, filterAirline, filterAnalyst, filterService, filterProcessType]);

  // ─── Discrepância de troca de master: Set "AWB|HAWB" pendentes ───
  const discrepancyKeys = useMemo(() => {
    const s = new Set<string>();
    for (const d of discrepancies) {
      const hawb = String(d?.hawb || "").trim().toUpperCase();
      let cands: any = d?.awbs_candidatos;
      if (typeof cands === "string") { try { cands = JSON.parse(cands); } catch { cands = []; } }
      if (!Array.isArray(cands)) cands = [];
      for (const a of cands) {
        const awb = String(a || "").trim().toUpperCase();
        if (awb) s.add(`${awb}|${hawb}`);
      }
    }
    return s;
  }, [discrepancies]);
  const hasMasterDiscrepancy = useCallback((awb: any) => {
    const a = String(awb?.awb || "").trim().toUpperCase();
    const h = String(awb?.hawb || "").trim().toUpperCase();
    return discrepancyKeys.has(`${a}|${h}`);
  }, [discrepancyKeys]);

  // ─── Card counts (respeitam filtros de topo, mas não o cardFilter) ───
  const cardCounts = useMemo(() => {
    const inTransitCodes = new Set(["DEP", "MAN", "RCF", "ARR"]);

    let total = 0, transit = 0, alert = 0, critical = 0;
    awbsData.forEach(awb => {
      if (!applyTopFilters(awb)) return;
      if (awb.is_invalid) return;
      // Skip hidden processes (persisted or fallback)
      if (awb.hide_reason) return;
      // tracking_failed fica totalmente oculto: fora de monitorados/trânsito/alerta/críticos.
      if (awb.tracking_failed) return;

      const code = getStatusCode(awb.last_event).toUpperCase();
      const crit = isCriticalAwb(awb);

      // Críticos (NIL/NIF/OFLD, discrepância de peças, "Sem atualizações") SEMPRE contam —
      // inclusive os que já chegaram ao destino há mais de 5 dias mas seguem parados.
      if (crit) critical++;

      // Entregues e processos que chegaram há >5 dias saem dos demais cards (mas não os críticos).
      if (code === "DLV" || code === "POD") return;
      if (!crit && awb.arr_destino_date) {
        const arrDate = parseDBDate(awb.arr_destino_date);
        if (arrDate) {
          const diffDays = (Date.now() - arrDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 5) return;
        }
      }

      total++;
      if (inTransitCodes.has(code)) transit++;
      if (code === "DIS" || (awb.has_dis_event && !awb.pieces_discrepancy)) alert++;
    });
    return { total, transit, alert, critical };
  }, [awbsData, applyTopFilters, isCriticalAwb]);

  // ─── Filtered & sorted data ───
  const filteredAwbs = useMemo(() => {
    let awbs = awbsData.filter(awb => {
      const code = getStatusCode(awb.last_event).toUpperCase();
      const isDLV = code === "DLV" || code === "POD";
      // Hide DLV unless actively searching
      if (isDLV && !searchTerm) return false;
      // Hide processes with persisted hide_reason — só revela na busca pelo número COMPLETO (AWB/HAWB)
      if (awb.hide_reason && !matchesFullNumber(awb)) return false;
      // Hide processes where ARR at destination happened > 5 days ago (fallback)
      // — exceto críticos (ex.: "Sem atualizações"), que permanecem visíveis.
      if (!searchTerm && awb.arr_destino_date && !isCriticalAwb(awb)) {
        const arrDate = parseDBDate(awb.arr_destino_date);
        if (arrDate) {
          const diffDays = (Date.now() - arrDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 5) return false;
        }
      }
      // Hide invalid unless actively searching
      if (awb.is_invalid && !searchTerm) return false;
      // Falha do Rastreio: oculto por padrão; só aparece na busca pelo número COMPLETO do master (AWB/HAWB)
      if (awb.tracking_failed && !matchesFullNumber(awb)) return false;

      return applyTopFilters(awb);
    });

    // Card filter
    if (cardFilter !== "all") {
      awbs = awbs.filter(awb => {
        const code = getStatusCode(awb.last_event).toUpperCase();
        switch (cardFilter) {
          case "transito": return ["DEP", "MAN", "RCF", "ARR", "ARR - DESTINO", "ARR - CONEXÃO"].includes(code);
          case "alerta": return code === "DIS" || (awb.has_dis_event && !awb.pieces_discrepancy);
          case "criticos": return isCriticalAwb(awb);
          default: return true;
        }
      });
    }

    // Filtro "Troca de master"
    if (filterMasterSwap) {
      awbs = awbs.filter(awb => hasMasterDiscrepancy(awb));
    }

    // Sorting
    if (sortAwb !== null) {
      awbs = [...awbs].sort((a, b) => { const c = a.awb.localeCompare(b.awb); return sortAwb === "asc" ? c : -c; });
    } else if (sortClient !== null) {
      awbs = [...awbs].sort((a, b) => { const c = a.consignee_name.localeCompare(b.consignee_name); return sortClient === "asc" ? c : -c; });
    } else if (sortAnalyst !== null) {
      awbs = [...awbs].sort((a, b) => { const c = (a.nome_analista || "").localeCompare(b.nome_analista || ""); return sortAnalyst === "asc" ? c : -c; });
    } else if (sortLastCheck !== null) {
      awbs = [...awbs].sort((a, b) => {
        const dA = a.last_event_date ? new Date(a.last_event_date).getTime() : 0;
        const dB = b.last_event_date ? new Date(b.last_event_date).getTime() : 0;
        return sortLastCheck === "asc" ? dA - dB : dB - dA;
      });
    } else {
      // Default sort: most recent first
      awbs = [...awbs].sort((a, b) => {
        const dA = a.last_event_date ? new Date(a.last_event_date).getTime() : 0;
        const dB = b.last_event_date ? new Date(b.last_event_date).getTime() : 0;
        return dB - dA;
      });
    }

    return awbs;
  }, [awbsData, searchTerm, applyTopFilters, isCriticalAwb, matchesFullNumber, cardFilter, sortAwb, sortClient, sortAnalyst, sortLastCheck, filterMasterSwap, hasMasterDiscrepancy]);

  const totalPages = Math.ceil(filteredAwbs.length / itemsPerPage);
  const currentAwbs = filteredAwbs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Contador do filtro "Troca de master" — respeita as mesmas regras de ocultação da listagem
  const masterSwapVisibleCount = useMemo(() => {
    return awbsData.filter(awb => {
      if (!hasMasterDiscrepancy(awb)) return false;
      const code = getStatusCode(awb.last_event).toUpperCase();
      if ((code === "DLV" || code === "POD") && !searchTerm) return false;
      if (awb.hide_reason && !matchesFullNumber(awb)) return false;
      if (!searchTerm && awb.arr_destino_date) {
        const arrDate = parseDBDate(awb.arr_destino_date);
        if (arrDate) {
          const diffDays = (Date.now() - arrDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 5) return false;
        }
      }
      if (awb.is_invalid && !searchTerm) return false;
      if (awb.tracking_failed && !matchesFullNumber(awb)) return false;
      return applyTopFilters(awb);
    }).length;
  }, [awbsData, searchTerm, applyTopFilters, matchesFullNumber, hasMasterDiscrepancy]);

  // Serialização dos AWBs visíveis para evitar loops de render
  const serializedVisibleAwbs = useMemo(() => {
    return Array.from(new Set(currentAwbs.map(a => (a.awb || "").trim()).filter(Boolean))).sort().join(',');
  }, [currentAwbs]);

  // Busca badges de "master swaps" apenas para os AWBs visíveis
  useEffect(() => {
    if (!serializedVisibleAwbs) return;
    const awbs = serializedVisibleAwbs.split(',');
    
    (async () => {
      try {
        const data = await getMasterSwaps(awbs);
        if (data?.success && Array.isArray(data.data)) {
          const map: Record<string, any> = {};
          for (const row of data.data) {
            const k = (row.awb_novo || "").trim().toUpperCase();
            if (!k) continue;
            if (!map[k] || new Date(row.data_atualizacao) > new Date(map[k].data_atualizacao)) {
              map[k] = row;
            }
          }
          setMasterSwaps(prev => ({ ...prev, ...map }));
        }
      } catch (e) {
        console.warn("[master_swap_list]", e);
      }
    })();
  }, [serializedVisibleAwbs]);

  // Relatório de falha de tracking apenas para os AWBs visíveis que falharam
  useEffect(() => {
    if (!serializedVisibleAwbs) return;
    const awbsOnPage = serializedVisibleAwbs.split(',');

    const visibleFailedAwbs = currentAwbs.filter(a => a.tracking_failed && awbsOnPage.includes(a.awb));
    if (visibleFailedAwbs.length === 0) return;

    void reportTrackingFailures(visibleFailedAwbs.map(a => a.awb));
  }, [serializedVisibleAwbs, currentAwbs]);

  const abbreviateName = (name: string): string => {
    if (!name || name === "-") return "-";
    return name.length > 20 ? name.substring(0, 20) + "..." : name;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0" style={{ backgroundImage: `url(${dachserBg})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)" }} />
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => (
            <div key={`line-${i}`} className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10" style={{ left: `${15 + i * 14}%`, transform: `skewX(${-20 + i * 8}deg)` }} />
          ))}
        </div>
        {[...Array(20)].map((_, i) => (
          <div key={`p-${i}`} className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 5}s`, animationDuration: `${4 + Math.random() * 4}s` }} />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-[18px]">
          <button onClick={() => navigate("/dashboard")} className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all">
            <ArrowLeft size={16} />
          </button>
          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">Intelligent Logistics – Monitoramento Pré-Embarque</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          {/* <DatabaseStatsPanel stats={dbStats} isLoading={isLoadingDbStats} onRefresh={fetchDbStats} /> */}
          <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
            @{user?.email?.split("@")[0] || "admin"}
          </div>
          <button onClick={() => setRegrasOpen(true)} className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors" title="Regras de Notificação por Cliente">
            <BellRing className="h-4 w-4" />
          </button>
          <button onClick={() => navigate("/air/tracking/manual")} className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors" title="Manual do usuário">
            <HelpCircle className="h-4 w-4" />
          </button>
          <div className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]" title="Tracking Aéreo (Scraper)">
            <Plane className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">
        {/* Dashboard Cards */}
        <DashboardCards
          totalMonitorados={cardCounts.total}
          emTransito={cardCounts.transit}
          emAlerta={cardCounts.alert}
          criticos={cardCounts.critical}
          activeFilter={cardFilter}
          onFilterChange={(f) => { setCardFilter(f); setCurrentPage(1); }}
        />

        {/* Search and Filters */}
        <section className="rounded-2xl p-4" style={{ background: "rgba(5,6,18,.9)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 18px 40px rgba(0,0,0,.85)" }}>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#aaaaaa]" />
              <input
                type="text"
                placeholder="Buscar por AWB, HAWB, cliente ou analista..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.12)] text-[#f5f5f5] placeholder-[#666] text-[0.85rem] focus:outline-none focus:border-[#ffc800]/50 transition"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Airline filter */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <Plane className="h-3 w-3 text-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Companhia</span>
                  </div>
                  <Select value={filterAirline} onValueChange={(v) => { setFilterAirline(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-8 w-[180px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todas</SelectItem>
                      {airlines.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} - {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Analyst filter */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <Plane className="h-3 w-3 text-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Analista</span>
                  </div>
                  <Select value={filterAnalyst} onValueChange={(v) => { setFilterAnalyst(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-8 w-[180px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueAnalysts.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Service filter */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <Package className="h-3 w-3 text-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Serviço</span>
                  </div>
                  <Select value={filterService} onValueChange={(v) => { setFilterService(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-8 w-[180px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueServices.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>


                {/* Impo/Expo filter */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 border border-border/50">
                    <Package className="h-3 w-3 text-primary" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-muted-foreground">Tipo</span>
                  </div>
                  <Select value={filterProcessType} onValueChange={(v) => { setFilterProcessType(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-8 w-[150px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="import">Importação</SelectItem>
                      <SelectItem value="export">Exportação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Troca de master filter */}
                <button
                  onClick={() => { setFilterMasterSwap(v => !v); setCurrentPage(1); }}
                  className={`h-8 px-3 rounded-full flex items-center gap-1.5 text-[0.75rem] font-medium transition border ${
                    filterMasterSwap
                      ? "bg-amber-500 text-black border-amber-400 shadow-[0_0_18px_rgba(255,200,0,.35)]"
                      : "bg-[rgba(0,0,0,.5)] text-[#f5f5f5] border-[rgba(255,255,255,.22)] hover:border-amber-400/60"
                  }`}
                  title="Filtrar processos com discrepância de troca de master"
                >
                  <Replace className="w-3.5 h-3.5" />
                  Troca de master
                  {masterSwapVisibleCount > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[0.65rem] ${filterMasterSwap ? "bg-black/20 text-black" : "bg-amber-500/20 text-amber-300"}`}>
                      {masterSwapVisibleCount}
                    </span>
                  )}
                </button>
              </div>


              <div className="flex items-center gap-2">
                <button onClick={() => { trackEvent("air.monitored_airlines.open"); setShowMonitoredModal(true); }} className="h-8 px-4 rounded-full bg-emerald-600/80 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-emerald-500/80 transition border border-emerald-500/50">
                  <Plane className="w-3.5 h-3.5" />
                  CIAs Monitoradas ({monitoredAirlinesData.totalAirlines})
                </button>
                <button onClick={() => { trackEvent("air.process.new_open"); setCadastroNovaOpen(true); }} className="h-8 px-4 rounded-full bg-emerald-500/80 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-emerald-400/80 transition border border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,.2)]">
                  <FilePlus className="w-3.5 h-3.5" />
                  Novo Processo
                </button>
                <button
                  onClick={() => { trackEvent("air.refresh"); loadTrackingData(); }}
                  disabled={isLoadingData}
                  className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? "animate-spin" : ""}`} />
                  {isLoadingData ? "Atualizando..." : "Atualizar"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Table */}
        <section className="rounded-2xl overflow-hidden" style={{ background: "rgba(5,6,18,.9)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 18px 40px rgba(0,0,0,.85)" }}>
          {filteredAwbs.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[rgba(0,0,0,.4)] border-b border-[rgba(255,255,255,.08)]">
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition" onClick={handleAwbSort}>
                        <span className="flex items-center gap-1">AWB {sortAwb === "asc" && <span className="text-[#ffc800]">↑</span>}{sortAwb === "desc" && <span className="text-[#ffc800]">↓</span>}</span>
                      </th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">HAWB</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Serviço</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition" onClick={handleClientSort}>
                        <span className="flex items-center gap-1">Cliente {sortClient === "asc" && <span className="text-[#ffc800]">↑</span>}{sortClient === "desc" && <span className="text-[#ffc800]">↓</span>}</span>
                      </th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Rota</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Rastreio</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Último Evento</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">ETA/ETD</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Situação</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition" onClick={handleAnalystSort}>
                        <span className="flex items-center gap-1">Analista {sortAnalyst === "asc" && <span className="text-[#ffc800]">↑</span>}{sortAnalyst === "desc" && <span className="text-[#ffc800]">↓</span>}</span>
                      </th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAwbs.map((awb, index) => {
                      const statusCode = getStatusCode(awb.last_event).toUpperCase();
                      const stale = isStaleAwb(awb);
                      const hasMasterSwap = hasMasterDiscrepancy(awb);
                      const isCritical = awb.is_critical || stale;
                      const isDelayed = statusCode === "DIS";

                      // Route highlighting logic
                      // Priority: 1) final delivery → destination; 2) match effective current airport
                      // to a route segment; 3) status-based fallback only when no match.
                      const IATA_EVENT_CODES = new Set(['BKD','BKG','BKF','RCS','FOH','RCF','MAN','DEP','ARR','NFD','AWD','DLV','CCD','DIS','POD','PRE','TRM','TFD','RCT','FWB','DOC','AWB','ASN','MOV','OFLD','NIL','NIF','FSU','FSH','FSA','OFD','OFL','BUP','RDP','LAT','TKG','SCR','ECC','RFC','DMG','RET','AWR','TDE','LOF','TFS','MIS','BCBP','UNK','TRA','PRD','RCP','CAN','LRC']);
                      const conexoes = awb.conexao ? awb.conexao.split(',').map(c => c.trim()).filter(c => c.length === 3 && !IATA_EVENT_CODES.has(c.toUpperCase())) : [];
                      const FINAL_DESTINO_ONLY = ['DLV','POD','ARR - DESTINO'];
                      let highlightOrigin = false, highlightDestino = false, highlightConexaoIndex = -1;

                      // Extract IATA (3 uppercase letters) from a free-form location string
                      const extractIata = (raw: string | undefined | null): string => {
                        if (!raw) return '';
                        const s = String(raw).toUpperCase();
                        const m = s.match(/\b([A-Z]{3})\b/);
                        return m ? m[1] : '';
                      };
                      const origemIata = extractIata(awb.origem);
                      const destinoIata = extractIata(awb.destino);
                      const conexoesIata = conexoes.map(c => extractIata(c));

                      // Determine the effective current airport:
                      // 1) last_event_location if it's a real airport (not a status code)
                      // 2) scan timeline newest-first: check location field, then "at [APT]" in description
                      const getEffectiveAirport = (): string => {
                        const rawLoc = extractIata((awb as any).last_event_location);
                        if (rawLoc && !IATA_EVENT_CODES.has(rawLoc) && !STOP_WORDS_CONN.has(rawLoc)) return rawLoc;
                        const tl: any[] = Array.isArray(awb.timeline_json) ? awb.timeline_json : [];
                        for (const evt of tl) {
                          const loc = (evt.location || '').trim().toUpperCase();
                          if (loc.length === 3 && !IATA_EVENT_CODES.has(loc) && !STOP_WORDS_CONN.has(loc)) return loc;
                          const desc = (evt.description || '').toUpperCase();
                          const m = desc.match(/\bAT\s+([A-Z]{3})\b/);
                          if (m && !IATA_EVENT_CODES.has(m[1]) && !STOP_WORDS_CONN.has(m[1])) return m[1];
                        }
                        return '';
                      };
                      const effectiveAirport = getEffectiveAirport();

                      const matchSegment = (): boolean => {
                        if (!effectiveAirport) return false;
                        const ci = conexoesIata.findIndex(c => c && c === effectiveAirport);
                        if (ci >= 0) { highlightConexaoIndex = ci; return true; }
                        if (destinoIata && effectiveAirport === destinoIata) { highlightDestino = true; return true; }
                        if (origemIata && effectiveAirport === origemIata) { highlightOrigin = true; return true; }
                        return false;
                      };

                      if (FINAL_DESTINO_ONLY.includes(statusCode)) {
                        highlightDestino = true;
                      } else if (!matchSegment()) {
                        // Effective airport didn't match any route segment — status-based fallback
                        if (conexoes.length > 0) {
                          if (statusCode === 'ARR - CONEXÃO' || statusCode === 'ARR - CONEXAO') {
                            highlightConexaoIndex = conexoes.length - 1;
                          } else if (statusCode === 'DEP') {
                            highlightConexaoIndex = 0;
                          } else if (statusCode === 'RCF') {
                            highlightConexaoIndex = conexoes.length - 1;
                          } else if (['ARR','NFD','AWD','DLV','POD','CCD','AWR'].includes(statusCode)) {
                            highlightDestino = true;
                          } else {
                            highlightOrigin = true;
                          }
                        } else {
                          if (['ARR','RCF','NFD','AWD','DLV','POD','CCD','AWR','ARR - DESTINO'].includes(statusCode)) {
                            highlightDestino = true;
                          } else {
                            highlightOrigin = true;
                          }
                        }
                      }

                      const activeClass = "text-[#ffc800] font-semibold";
                      const inactiveClass = "text-muted-foreground";

                      // Timeline progress bar colors
                      const isArrConexao = statusCode === "ARR - CONEXÃO" || statusCode === "ARR - CONEXAO";
                      const isArrDestino = statusCode === "ARR - DESTINO";
                      const isAlertStatus = isDelayed || statusCode === "DIS" || statusCode === "OFLD";
                      const progressGradient = isAlertStatus ? "linear-gradient(90deg, hsl(0 84% 60%), hsl(0 84% 70%))" : isArrConexao ? "linear-gradient(90deg, hsl(30 100% 50%), hsl(30 100% 60%))" : isArrDestino ? "linear-gradient(90deg, hsl(142 76% 36%), hsl(142 76% 46%))" : "linear-gradient(90deg, hsl(39 100% 50%), hsl(39 100% 60%))";
                      const planeColor = isAlertStatus ? "rgb(239, 68, 68)" : isArrConexao ? "rgb(249, 115, 22)" : isArrDestino ? "rgb(34, 197, 94)" : "rgb(255, 165, 0)";
                      const shadowColor = isAlertStatus ? "rgba(239, 68, 68, 1)" : isArrConexao ? "rgba(249, 115, 22, 1)" : isArrDestino ? "rgba(34, 197, 94, 1)" : "rgba(255, 165, 0, 1)";
                      const bgBarColor = isAlertStatus ? "bg-red-900/30" : "bg-gray-800/50";
                      const dotColor = isAlertStatus ? "bg-red-400" : "bg-white/90";
                      const dotColorMuted = isAlertStatus ? "bg-red-400/70" : "bg-white/70";

                      return (
                        <tr key={`${awb.id}-${index}`} className={`border-b border-[rgba(255,255,255,.06)] transition-all duration-300 ${(isCritical || hasMasterSwap) ? "bg-red-500/15 border-red-400/50 border-2 shadow-[0_0_15px_rgba(255,0,0,0.2)]" : "hover:bg-[rgba(255,255,255,.03)]"}`}>
                          {/* AWB */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#f5f5f5] text-[0.82rem]">{awb.awb}</span>
                              {(() => {
                                const swap = masterSwaps[(awb.awb || "").trim().toUpperCase()];
                                if (!swap) return null;
                                const fonteLabel = swap.fonte === 'EXTRACTED_EMAILS' ? 'E-mail Dachser' : 'Dados aéreo';
                                return (
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.6rem] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                                      <ArrowLeftRight className="w-2.5 h-2.5" /> Troca de master
                                    </span>
                                  </TooltipTrigger><TooltipContent>
                                    <p className="text-xs">Antigo: {swap.awb_antigo}</p>
                                    <p className="text-xs">Novo: {swap.awb_novo}</p>
                                    <p className="text-xs text-muted-foreground">Fonte: {fonteLabel}</p>
                                    {swap.data_atualizacao && <p className="text-xs text-muted-foreground">{formatDateTimeBR(swap.data_atualizacao)}</p>}
                                  </TooltipContent></Tooltip></TooltipProvider>
                                );
                              })()}
                            </div>
                          </td>

                          {/* HAWB */}
                          <td className="px-4 py-3 text-[#aaaaaa] text-[0.8rem] whitespace-nowrap">{awb.hawb || "-"}</td>
                          {/* Serviço */}
                          <td className="px-4 py-3 text-[#aaaaaa] text-[0.8rem] whitespace-nowrap">{awb.tipo_servico || "-"}</td>
                          {/* Cliente */}
                          <td className="px-4 py-3">
                            <div className="text-[#f5f5f5] text-[0.8rem] uppercase">{abbreviateName(awb.consignee_name)}</div>
                          </td>
                          {/* Rota */}
                          <td className="px-4 py-3 text-[0.8rem]">
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              <span className={highlightOrigin ? activeClass : inactiveClass}>{awb.origem || "N/A"}</span>
                              {conexoes.map((con, idx) => (
                                <span key={idx} className="flex items-center gap-1">
                                  <span className="text-muted-foreground">→</span>
                                  <span className={highlightConexaoIndex === idx ? activeClass : inactiveClass}>{con}</span>
                                </span>
                              ))}
                              <span className="text-muted-foreground">→</span>
                              <span className={highlightDestino ? activeClass : inactiveClass}>{awb.destino || "N/A"}</span>
                              {awb.is_ground_transport && (
                                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  <Truck className="w-2.5 h-2.5" /> RFS
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Rastreio (progress bar) */}
                          <td className="px-4 py-3 min-w-[300px]">
                            <div className="relative h-1.5 w-full flex items-center">
                              <div className={`absolute inset-0 ${bgBarColor} rounded-full`} />
                              <div className="absolute left-0 h-full rounded-l-full transition-all duration-700 ease-out" style={{ width: `${getTimelineProgress(awb.last_event)}%`, background: progressGradient, borderTopRightRadius: getTimelineProgress(awb.last_event) === 100 ? "9999px" : "0", borderBottomRightRadius: getTimelineProgress(awb.last_event) === 100 ? "9999px" : "0" }} />
                              <TooltipProvider>
                                <Tooltip><TooltipTrigger asChild><div className={`absolute left-0 w-1.5 h-1.5 rounded-full ${dotColor} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`} /></TooltipTrigger><TooltipContent><p className="text-xs">BKD - Reserva Confirmada</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><div className={`absolute left-1/4 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dotColorMuted} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`} /></TooltipTrigger><TooltipContent><p className="text-xs">RCF - Recebida pela Cia Aérea</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><div className={`absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dotColorMuted} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`} /></TooltipTrigger><TooltipContent><p className="text-xs">MAN - Manifestada</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><div className={`absolute left-3/4 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dotColorMuted} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`} /></TooltipTrigger><TooltipContent><p className="text-xs">DEP - Partida Confirmada</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><div className={`absolute right-0 w-1.5 h-1.5 rounded-full ${dotColor} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`} /></TooltipTrigger><TooltipContent><p className="text-xs">ARR - Chegada no Destino</p></TooltipContent></Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 ease-out z-20 cursor-pointer" style={{ left: `${getTimelineProgress(awb.last_event)}%` }}>
                                      {awb.is_ground_transport ? (
                                        <Truck className="w-4 h-4" style={{ color: planeColor, fill: planeColor, filter: `drop-shadow(0 0 4px ${shadowColor}) drop-shadow(0 2px 6px rgba(0,0,0,0.6))` }} />
                                      ) : (
                                        <Plane className="w-4 h-4" style={{ transform: "rotate(90deg)", color: planeColor, fill: planeColor, filter: `drop-shadow(0 0 4px ${shadowColor}) drop-shadow(0 2px 6px rgba(0,0,0,0.6))` }} />
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs font-medium">{getStatusCode(awb.last_event)}{awb.is_ground_transport ? " · Transporte Terrestre" : ""}</p>
                                    <p className="text-xs text-muted-foreground">{getStatusFromEvent(awb.last_event)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </td>
                          {/* Último Evento */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                if (awb.is_invalid) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600/20 text-red-400 border border-red-500/40"><AlertCircle className="h-3 w-3" />AWB Inválido</span>;
                                if (awb.tracking_failed) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-600/20 text-orange-400 border border-orange-500/40"><AlertTriangle className="h-3 w-3" />Falha do Rastreio</span>;
                                const sc = statusCode;
                                if (sc === "ARR - DESTINO") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/40"><MapPin className="h-3 w-3" />Destino</span>;
                                if (sc === "ARR - CONEXÃO" || sc === "ARR - CONEXAO") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40"><ArrowLeftRight className="h-3 w-3" />Conexão</span>;
                                return <span className="text-sm font-bold" style={{ color: "hsl(120 100% 35%)" }}>{getStatusCode(awb.last_event)}</span>;
                              })()}
                              {stale && !awb.is_invalid && !awb.tracking_failed && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600/20 text-red-400 border border-red-500/40" title="Último evento há mais de 30 dias">
                                  <AlertTriangle className="h-3 w-3" />Sem atualizações
                                </span>
                              )}
                            </div>
                          </td>
                          {/* ETA/ETD */}
                          <td className="px-3 py-3 text-[#aaaaaa] text-sm whitespace-nowrap">
                            {formatDateTimeBR(awb.etd)}
                          </td>
                          {/* Situação */}
                          <td className="px-3 py-3 text-center">
                            {awb.is_invalid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                Inválido
                              </span>
                            ) : awb.tracking_failed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                Falha
                              </span>
                            ) : isCritical ? (
                              awb.has_dis_event && !awb.pieces_discrepancy ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  DIS - Discrepância
                                </span>
                              ) : awb.pieces_discrepancy ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  {awb.has_dis_event ? "DIS - Discrepância" : "Discrepância Peças"}
                                </span>
                              ) : stale ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  Crítico · Sem atualizações
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  Crítico
                                </span>
                              )
                            ) : hasMasterSwap ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                Troca de master
                              </span>
                            ) : isDelayed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                Em Atraso
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                No Prazo
                              </span>
                            )}
                          </td>
                          {/* Analista */}
                          <td className="px-3 py-3 text-[#aaaaaa] text-sm uppercase">{awb.nome_analista || "-"}</td>
                          {/* Ações */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { trackEvent("air.timeline.open"); setTimelineModal({ open: true, awb: awb.awb, consigneeName: awb.consignee_name, timelineJson: awb.timeline_json || [], lastEvent: awb.last_event }); }} className="text-[#ffc800] hover:text-[#ffc800] hover:bg-[#ffc800]/10 h-8 w-8 p-0">
                                      <Clock className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">Ver Timeline</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {(() => {
                                const trackingUrl = getTrackingUrl(awb.airline_code, awb.awb);
                                return trackingUrl ? (
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { trackEvent(`air.airline_link.open:${awb.airline_code || "unknown"}`); window.open(trackingUrl, "_blank", "noopener,noreferrer"); }} className="text-foreground hover:text-primary h-8 w-8 p-0">
                                      <ExternalLink className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent><p className="text-xs">Abrir Rastreio Externo</p></TooltipContent></Tooltip></TooltipProvider>
                                ) : null;
                              })()}
                              {hasMasterDiscrepancy(awb) && (() => {
                                const hKey = String(awb.hawb || "").trim().toUpperCase();
                                const aKey = String(awb.awb || "").trim().toUpperCase();
                                const disc = discrepancies.find((d: any) => {
                                  if (String(d?.hawb || "").trim().toUpperCase() !== hKey) return false;
                                  let cands: any = d?.awbs_candidatos;
                                  if (typeof cands === "string") { try { cands = JSON.parse(cands); } catch { cands = []; } }
                                  if (!Array.isArray(cands)) return false;
                                  return cands.some((c: any) => String(c || "").trim().toUpperCase() === aKey);
                                });
                                if (!disc) return null;
                                return (
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="sm"
                                      onClick={() => setDiscrepancyModal({ open: true, disc, chosen: "" })}
                                      className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-8 w-8 p-0"
                                    >
                                      <Replace className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent><p className="text-xs">Resolver troca de master</p></TooltipContent></Tooltip></TooltipProvider>
                                );
                              })()}
                            </div>

                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="p-4 border-t border-[rgba(255,255,255,.08)] flex items-center justify-between bg-[rgba(0,0,0,.3)]">
                <div className="text-[0.78rem] text-[#aaaaaa]">
                  Página {currentPage} de {totalPages} | Total: {filteredAwbs.length} registros
                </div>
                <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} showFirstLast={true} />
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <p className="text-[#f5f5f5] uppercase tracking-[0.15em] font-medium">
                {isLoadingData ? "CARREGANDO DADOS..." : loadError ? "ERRO AO CARREGAR DADOS" : "NENHUM AWB ENCONTRADO"}
              </p>
              <p className="text-[0.85rem] text-[#aaaaaa] mt-2">
                {isLoadingData
                  ? "Buscando em companhias aéreas..."
                  : loadError
                    ? loadError
                    : "Os dados serão carregados automaticamente do banco de dados"}
              </p>
              {!isLoadingData && loadError && (
                <button
                  onClick={loadTrackingData}
                  className="mt-4 h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium hover:bg-[#ffdc50] transition"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Monitored Airlines Modal */}
      <Dialog open={showMonitoredModal} onOpenChange={setShowMonitoredModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <DialogHeader>
            <DialogTitle className="text-[#f5f5f5] flex items-center gap-2">
              <Plane className="w-5 h-5 text-emerald-400" />
              Companhias Aéreas Monitoradas
            </DialogTitle>
            <DialogDescription className="text-[#aaaaaa]">
              {monitoredAirlinesData.totalAirlines} companhias aéreas com integração ativa
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh] mt-4">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-[rgba(0,0,0,.8)]">
                <tr className="border-b border-[rgba(255,255,255,.08)]">
                  <th className="px-3 py-2 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Código</th>
                  <th className="px-3 py-2 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Companhia Aérea</th>
                </tr>
              </thead>
              <tbody>
                {monitoredAirlinesData.airlines.map((airline) => (
                  <tr key={airline.code} className="border-b border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.03)]">
                    <td className="px-3 py-2.5"><span className="font-mono text-emerald-400 text-sm">{airline.code}</span></td>
                    <td className="px-3 py-2.5 text-[#f5f5f5] text-sm">{airline.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>


      {/* Timeline Modal (Scraper version) */}
      <AwbTimelineModalScraper
        open={timelineModal.open}
        onOpenChange={(open) => setTimelineModal(prev => ({ ...prev, open }))}
        awb={timelineModal.awb}
        consigneeName={timelineModal.consigneeName}
        timelineJson={timelineModal.timelineJson}
        lastEvent={timelineModal.lastEvent}
      />

      {/* Cadastro NOVA Modal */}
      <CadastroNovaModal open={cadastroNovaOpen} onOpenChange={setCadastroNovaOpen} onSuccess={loadTrackingData} />




      <Dialog open={discrepancyModal.open} onOpenChange={(o) => !o && setDiscrepancyModal({ open: false, disc: null, chosen: "" })}>
        <DialogContent className="bg-[#0f0f0f] border-amber-500/40">
          <DialogHeader>
            <DialogTitle className="text-amber-300">Resolver troca de master</DialogTitle>
            <DialogDescription className="text-[#bbb]">
              {discrepancyModal.disc && (() => {
                let cands: string[] = [];
                try { cands = typeof discrepancyModal.disc.awbs_candidatos === 'string' ? JSON.parse(discrepancyModal.disc.awbs_candidatos) : (discrepancyModal.disc.awbs_candidatos || []); } catch {}
                const hawb = discrepancyModal.disc.hawb || '—';
                return `Os processos correspondentes ${cands.join(' e ')} possuem mesmo ID, data de inclusão e HAWB (${hawb}). Para troca de master correta, qual dos masters seria o correto?`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {discrepancyModal.disc && (() => {
              let cands: string[] = [];
              try { cands = typeof discrepancyModal.disc.awbs_candidatos === 'string' ? JSON.parse(discrepancyModal.disc.awbs_candidatos) : (discrepancyModal.disc.awbs_candidatos || []); } catch {}
              return cands.map((awb: string) => (
                <label key={awb} className="flex items-center gap-2 p-2 rounded border border-white/10 hover:bg-white/5 cursor-pointer">
                  <input type="radio" name="awb-chosen" value={awb} checked={discrepancyModal.chosen === awb} onChange={() => setDiscrepancyModal(prev => ({ ...prev, chosen: awb }))} />
                  <span className="text-white font-mono">{awb}</span>
                </label>
              ));
            })()}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDiscrepancyModal({ open: false, disc: null, chosen: "" })}>Cancelar</Button>
            <Button onClick={resolveDiscrepancy} disabled={!discrepancyModal.chosen} className="bg-amber-500 hover:bg-amber-600 text-black">Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
      <EmailClienteRegrasDialog open={regrasOpen} onOpenChange={setRegrasOpen} />
    </div>

  );
};

export default TrackingAereo;
