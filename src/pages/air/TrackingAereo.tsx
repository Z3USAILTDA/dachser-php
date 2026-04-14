import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUsageLog } from "@/hooks/useUsageLog";
// import { DatabaseStatsPanel, DbStats } from "@/components/DatabaseStatsPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Plane,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { User, Session } from "@supabase/supabase-js";
import DashboardCards, { CardFilterType } from "@/components/DashboardCards";
import dachserBg from "@/assets/dachser-background.jpg";
import { TablePagination } from "@/components/layout/TablePagination";
import { EmailClienteRegrasDialog } from "@/components/air/EmailClienteRegrasDialog";
import { CadastroNovaModal } from "@/components/air/CadastroNovaModal";
import { AwbTimelineModalScraper } from "@/components/air/AwbTimelineModalScraper";
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
  if (lastEvent.includes(" - ")) return lastEvent.split(" - ")[0];
  return lastEvent.substring(0, 3).toUpperCase();
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
}

// ─── Airlines list (same as Index.tsx) ───

const airlines = [
  { code: "006", name: "Delta Cargo" },
  { code: "020", name: "Lufthansa Cargo" },
  { code: "045", name: "LATAM Cargo" },
  { code: "057", name: "Air France Cargo" },
  { code: "074", name: "KLM Cargo" },
  { code: "369", name: "Atlas Air Cargo" },
  { code: "577", name: "Azul Cargo" },
  { code: "615", name: "European Air Transport" },
  { code: "996", name: "Air Europa Cargo" },
];

// ─── Monitored Airlines Data ───

const monitoredAirlinesData = {
  airlines: [
    { code: "020", name: "Lufthansa Cargo" },
    { code: "045", name: "LATAM Cargo" },
    { code: "047", name: "TAP Air Portugal Cargo" },
    { code: "055", name: "ITA Airways Cargo" },
    { code: "057", name: "Air France Cargo" },
    { code: "074", name: "AF/KL Cargo" },
    { code: "075", name: "IAG Cargo" },
    { code: "369", name: "Atlas Air" },
    { code: "549", name: "LATAM Cargo (Alt)" },
    { code: "577", name: "Azul Cargo" },
    { code: "615", name: "European Air Transport (DHL)" },
    { code: "724", name: "Swiss WorldCargo" },
    { code: "996", name: "Air Europa Cargo" },
  ],
  totalAirlines: 13,
};

// ─── Component ───

const TrackingAereo = () => {
  useUsageLog({ endpoint: "/air/tracking-aereo" });
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [awbsData, setAwbsData] = useState<AWBData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
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
  const [showMonitoredModal, setShowMonitoredModal] = useState(false);
  const [cadastroNovaOpen, setCadastroNovaOpen] = useState(false);
  const [regrasDialogOpen, setRegrasDialogOpen] = useState(false);
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

  // Auth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch data from edge function
  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-tracking-aereo");
      if (error) {
        console.error("Error fetching tracking aereo:", error);
        return;
      }
      if (data?.success && data?.data) {
        const converted: AWBData[] = data.data.map((item: any, index: number) => {
          const timeline = Array.isArray(item.timeline_json) ? item.timeline_json : [];
          const lastEvent = item.last_event || "";
          const statusCode = getStatusCode(lastEvent);

          return {
            id: `tracking-${index}`,
            awb: item.awb_number || "",
            hawb: item.hawb_number || "",
            airline_code: (item.awb_number || "").substring(0, 3),
            consignee_name: item.consignee_nome || "",
            last_event: lastEvent,
            status: statusCode,
            nome_analista: item.clerk || "",
            origem: item.origin || "",
            destino: item.destination || "",
            last_event_date: item.last_event_date || null,
            last_event_location: item.last_event_location || "",
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
            tracking_failed: !lastEvent || lastEvent === "",
            is_critical: false,
            is_invalid: false,
          } as AWBData;
        });

        // Deduplicate by awb|hawb, keeping the record with the most recent last_event_date
        const deduped = converted.reduce((acc: AWBData[], cur) => {
          const key = `${cur.awb}|${cur.hawb || "-"}`;
          const existingIdx = acc.findIndex(i => `${i.awb}|${i.hawb || "-"}` === key);
          if (existingIdx === -1) {
            acc.push(cur);
          } else {
            const existingDate = acc[existingIdx].last_event_date ? new Date(acc[existingIdx].last_event_date!).getTime() : 0;
            const curDate = cur.last_event_date ? new Date(cur.last_event_date!).getTime() : 0;
            if (curDate > existingDate) {
              acc[existingIdx] = cur;
            }
          }
          return acc;
        }, []);

        setAwbsData(deduped);
      }
    } catch (error) {
      console.error("Error in fetchData:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // Check timeline for piece/weight discrepancy (enriched version matching /air/tracking)
  function checkTimelineDiscrepancy(timeline: any[]): { discrepancy: boolean; baseline: number | null; hasDis: boolean } {
    const result = { discrepancy: false, baseline: null as number | null, hasDis: false };
    if (!timeline || timeline.length < 2) return result;

    // Check for DIS events
    result.hasDis = timeline.some((e: any) => {
      const code = (e.event_code || e.codigo_evento || '').toUpperCase();
      return code === 'DIS' || (e.event_description || e.descricao_evento || '').toUpperCase().includes('DISCREPANCY');
    });

    const pieces = timeline.map((e: any) => e.pieces ?? e.pecas).filter((p: any) => p != null && p > 0);
    if (pieces.length < 2) return result;

    const unique = [...new Set(pieces)];
    result.baseline = pieces[0]; // first recorded piece count

    if (unique.length >= 2) {
      // Check if resolved: last delivery event matches baseline
      const lastEvent = timeline[timeline.length - 1];
      const lastCode = (lastEvent?.event_code || lastEvent?.codigo_evento || '').toUpperCase();
      const lastPieces = lastEvent?.pieces ?? lastEvent?.pecas;
      if (['DLV', 'POD'].includes(lastCode) && lastPieces === result.baseline) {
        result.discrepancy = false;
      } else {
        result.discrepancy = true;
      }
    }

    return result;
  }

  // Fetch DB stats (commented out)
  // const fetchDbStats = useCallback(async () => {
  //   setIsLoadingDbStats(true);
  //   try {
  //     const { data, error } = await supabase.functions.invoke("fetch-master-dados-stats");
  //     if (error) return;
  //     if (data?.success && data?.stats) setDbStats(data.stats);
  //   } catch (_) {} finally {
  //     setIsLoadingDbStats(false);
  //   }
  // }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => { clearInterval(interval); };
  }, [fetchData]);

  // ─── Alert for tracking failures ───
  useEffect(() => {
    const failedAwbs = awbsData.filter(a => a.tracking_failed);
    if (failedAwbs.length === 0) return;
    supabase.functions.invoke("air-tracking-failed-alert").catch(console.error);
  }, [awbsData]);

  // ─── Unique analysts ───
  const uniqueAnalysts = useMemo(() => {
    const s = new Set<string>();
    awbsData.forEach(a => { if (a.nome_analista && a.nome_analista !== "-") s.add(a.nome_analista); });
    return Array.from(s).sort();
  }, [awbsData]);

  // ─── Sort handlers ───
  const handleAwbSort = () => { setSortAnalyst(null); setSortClient(null); setSortLastCheck(null); setSortAwb(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };
  const handleClientSort = () => { setSortAnalyst(null); setSortAwb(null); setSortLastCheck(null); setSortClient(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };
  const handleAnalystSort = () => { setSortAwb(null); setSortClient(null); setSortLastCheck(null); setSortAnalyst(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };
  const handleLastCheckSort = () => { setSortAwb(null); setSortClient(null); setSortAnalyst(null); setSortLastCheck(prev => prev === null ? "asc" : prev === "asc" ? "desc" : null); };

  // ─── Card counts ───
  const cardCounts = useMemo(() => {
    const inTransitCodes = new Set(["DEP", "MAN", "RCF", "ARR"]);
    const criticalCodes = new Set(["NIL", "NIF", "OFLD"]);

    let total = 0, transit = 0, alert = 0, critical = 0;
    awbsData.forEach(awb => {
      if (awb.is_invalid) return;
      if (awb.tracking_failed) return;
      const code = getStatusCode(awb.last_event).toUpperCase();
      if (code === "DLV" || code === "POD") return;
      // Skip hidden processes (persisted or fallback)
      if (awb.hide_reason) return;
      if (awb.arr_destino_date) {
        const arrDate = parseDBDate(awb.arr_destino_date);
        if (arrDate) {
          const diffDays = (Date.now() - arrDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 5) return;
        }
      }
      total++;
      if (inTransitCodes.has(code)) transit++;
      if (code === "DIS") alert++;
      if (criticalCodes.has(code) || awb.pieces_discrepancy) critical++;
    });
    return { total, transit, alert, critical };
  }, [awbsData]);

  // ─── Filtered & sorted data ───
  const filteredAwbs = useMemo(() => {
    let awbs = awbsData.filter(awb => {
      const code = getStatusCode(awb.last_event).toUpperCase();
      const isDLV = code === "DLV" || code === "POD";
      // Hide DLV unless actively searching
      if (isDLV && !searchTerm) return false;
      // Hide processes with persisted hide_reason (from backend scan)
      if (!searchTerm && awb.hide_reason) return false;
      // Hide processes where ARR at destination happened > 5 days ago (fallback)
      if (!searchTerm && awb.arr_destino_date) {
        const arrDate = parseDBDate(awb.arr_destino_date);
        if (arrDate) {
          const diffDays = (Date.now() - arrDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 5) return false;
        }
      }
      // Hide invalid unless actively searching
      if (awb.is_invalid && !searchTerm) return false;
      // Hide tracking failed unless actively searching by AWB
      if (awb.tracking_failed && !searchTerm) return false;

      const sl = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        awb.awb.toLowerCase().includes(sl) ||
        (awb.hawb && awb.hawb.toLowerCase().includes(sl)) ||
        awb.consignee_name.toLowerCase().includes(sl) ||
        (awb.nome_analista && awb.nome_analista.toLowerCase().includes(sl));
      const matchesAirline = filterAirline === "all" || awb.airline_code === filterAirline;
      const matchesAnalyst = filterAnalyst === "all" || awb.nome_analista === filterAnalyst;

      const BR_AIRPORTS = ['GRU','VCP','CGH','GIG','SDU','BSB','CNF','POA','CWB','REC','SSA','FOR','BEL','MAO','NAT','MCZ','FLN','VIX','CGB','GYN','SLZ','THE','AJU','JPA','PMW','PVH','RBR','BVB','MCP','CGR','LDB','MGF','IGU','NVT','JOI','XAP','UDI','RAO','SJP','PPB','BAU','CPQ','QPS','SOD','MAB','STM','SJK','PNZ'];
      const destCode = (awb.destino || '').toUpperCase().trim();
      const isImport = BR_AIRPORTS.includes(destCode);
      const matchesType = filterProcessType === "all" ||
        (filterProcessType === "import" && isImport) ||
        (filterProcessType === "export" && !isImport);

      return matchesSearch && matchesAirline && matchesAnalyst && matchesType;
    });

    // Card filter
    if (cardFilter !== "all") {
      awbs = awbs.filter(awb => {
        const code = getStatusCode(awb.last_event).toUpperCase();
        switch (cardFilter) {
          case "transito": return ["DEP", "MAN", "RCF", "ARR", "ARR - DESTINO", "ARR - CONEXÃO"].includes(code);
          case "alerta": return code === "DIS";
          case "criticos": return awb.tracking_failed || ["NIL", "NIF", "OFLD"].includes(code) || awb.pieces_discrepancy;
          default: return true;
        }
      });
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
  }, [awbsData, searchTerm, filterAirline, filterAnalyst, filterProcessType, cardFilter, sortAwb, sortClient, sortAnalyst, sortLastCheck]);

  const totalPages = Math.ceil(filteredAwbs.length / itemsPerPage);
  const currentAwbs = filteredAwbs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
          <button onClick={() => setRegrasDialogOpen(true)} className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors" title="Regras de notificação">
            <Settings className="h-4 w-4" />
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
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setShowMonitoredModal(true)} className="h-8 px-4 rounded-full bg-emerald-600/80 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-emerald-500/80 transition border border-emerald-500/50">
                  <Plane className="w-3.5 h-3.5" />
                  CIAs Monitoradas ({monitoredAirlinesData.totalAirlines})
                </button>
                <button onClick={() => setCadastroNovaOpen(true)} className="h-8 px-4 rounded-full bg-emerald-500/80 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-emerald-400/80 transition border border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,.2)]">
                  <FilePlus className="w-3.5 h-3.5" />
                  Novo Processo
                </button>
                <button onClick={fetchData} className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Atualizar
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
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition" onClick={handleClientSort}>
                        <span className="flex items-center gap-1">Cliente {sortClient === "asc" && <span className="text-[#ffc800]">↑</span>}{sortClient === "desc" && <span className="text-[#ffc800]">↓</span>}</span>
                      </th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Rota</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Rastreio</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Último Evento</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Data/Hora</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Situação</th>
                      <th className="px-3 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">SLA</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition" onClick={handleAnalystSort}>
                        <span className="flex items-center gap-1">Analista {sortAnalyst === "asc" && <span className="text-[#ffc800]">↑</span>}{sortAnalyst === "desc" && <span className="text-[#ffc800]">↓</span>}</span>
                      </th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAwbs.map((awb, index) => {
                      const statusCode = getStatusCode(awb.last_event).toUpperCase();
                      const isCritical = awb.is_critical;
                      const isDelayed = statusCode === "DIS";

                      // Route highlighting logic
                      const conexoes = awb.conexao ? awb.conexao.split(',').map(c => c.trim()).filter(Boolean) : [];
                      const PRE_DEPARTURE = ['BKD','PRE','MAN','DOC','RCS','RDP','RCT','LAT','TKG','SCR','ECC'];
                      const FINAL_DESTINO_ONLY = ['DLV','POD','ARR - DESTINO'];
                      const POST_DESTINO = ['ARR','RCF','NFD','AWD','DLV','POD','CCD','AWR','FOH'];
                      let highlightOrigin = false, highlightDestino = false, highlightConexaoIndex = -1;

                      if (conexoes.length > 0) {
                        if (FINAL_DESTINO_ONLY.includes(statusCode)) highlightDestino = true;
                        else if (PRE_DEPARTURE.includes(statusCode) || statusCode === 'RCF') highlightOrigin = true;
                        else if (['ARR - CONEXÃO','ARR - CONEXAO','DEP'].includes(statusCode)) highlightConexaoIndex = conexoes.length - 1;
                        else if (POST_DESTINO.includes(statusCode)) highlightDestino = true;
                        else highlightOrigin = true;
                      } else {
                        if (POST_DESTINO.includes(statusCode)) highlightDestino = true;
                        else highlightOrigin = true;
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
                        <tr key={`${awb.id}-${index}`} className={`border-b border-[rgba(255,255,255,.06)] transition-all duration-300 ${isCritical ? "bg-red-500/15 border-red-400/50 border-2 shadow-[0_0_15px_rgba(255,0,0,0.2)]" : "hover:bg-[rgba(255,255,255,.03)]"}`}>
                          {/* AWB */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-semibold text-[#f5f5f5] text-[0.82rem]">{awb.awb}</span>
                          </td>
                          {/* HAWB */}
                          <td className="px-4 py-3 text-[#aaaaaa] text-[0.8rem] whitespace-nowrap">{awb.hawb || "-"}</td>
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
                                      <Plane className="w-4 h-4" style={{ transform: "rotate(90deg)", color: planeColor, fill: planeColor, filter: `drop-shadow(0 0 4px ${shadowColor}) drop-shadow(0 2px 6px rgba(0,0,0,0.6))` }} />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs font-medium">{getStatusCode(awb.last_event)}</p>
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
                            </div>
                          </td>
                          {/* Data/Hora */}
                          <td className="px-3 py-3 text-[#aaaaaa] text-sm whitespace-nowrap">
                            {formatDateTimeBR(awb.last_event_date)}
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
                                  {awb.has_dis_event ? "DIS - Discrepância" : `Discrepância Peças${awb.baseline_pieces ? ` (${awb.baseline_pieces})` : ''}`}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  Crítico
                                </span>
                              )
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
                          {/* SLA */}
                          <td className="px-3 py-3 text-center">
                            {(() => {
                              const slaCor = awb.sla_cor;
                              // Post-arrival/final statuses show green check
                              if (slaCor === 'VERDE' && !awb.sla_tempo_formatado) return <span className="text-green-400 text-sm">✓</span>;
                              if (!awb.sla_tempo_formatado) return <span className="text-muted-foreground text-xs">—</span>;
                              const color = slaCor === 'VERMELHO' ? "text-red-400 bg-red-500/15 border-red-500/30" : slaCor === 'AMARELO' ? "text-amber-400 bg-amber-500/15 border-amber-500/30" : "text-green-400 bg-green-500/15 border-green-500/30";
                              return (
                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] font-semibold border ${color}`}>
                                    <Clock className="w-3 h-3" />{awb.sla_tempo_formatado}
                                  </span>
                                </TooltipTrigger><TooltipContent>
                                  <p className="text-xs">SLA: {statusCode} — limite {awb.sla_limite_horas || '—'}h</p>
                                  <p className="text-xs text-muted-foreground">{awb.sla_tooltip || '—'}</p>
                                </TooltipContent></Tooltip></TooltipProvider>
                              );
                            })()}
                          </td>
                          {/* Analista */}
                          <td className="px-3 py-3 text-[#aaaaaa] text-sm uppercase">{awb.nome_analista || "-"}</td>
                          {/* Ações */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => setTimelineModal({ open: true, awb: awb.awb, consigneeName: awb.consignee_name, timelineJson: awb.timeline_json || [], lastEvent: awb.last_event })} className="text-[#ffc800] hover:text-[#ffc800] hover:bg-[#ffc800]/10 h-8 w-8 p-0">
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
                                    <Button variant="ghost" size="sm" onClick={() => window.open(trackingUrl, "_blank")} className="text-foreground hover:text-primary h-8 w-8 p-0">
                                      <ExternalLink className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent><p className="text-xs">Abrir Rastreio Externo</p></TooltipContent></Tooltip></TooltipProvider>
                                ) : null;
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
                <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <p className="text-[#f5f5f5] uppercase tracking-[0.15em] font-medium">
                {isLoadingData ? "CARREGANDO DADOS..." : "NENHUM AWB ENCONTRADO"}
              </p>
              <p className="text-[0.85rem] text-[#aaaaaa] mt-2">
                {isLoadingData ? "Buscando dados do scraper..." : "Os dados serão carregados automaticamente do banco de dados"}
              </p>
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

      {/* Regras de Notificação */}
      <EmailClienteRegrasDialog open={regrasDialogOpen} onOpenChange={setRegrasDialogOpen} />

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
      <CadastroNovaModal open={cadastroNovaOpen} onOpenChange={setCadastroNovaOpen} onSuccess={fetchData} />
    </div>
  );
};

export default TrackingAereo;
