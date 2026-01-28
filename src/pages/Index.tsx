import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUsageLog } from "@/hooks/useUsageLog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseStatsPanel, DbStats } from "@/components/DatabaseStatsPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search,
  Plus,
  RefreshCw,
  Plane,
  Trash2,
  ExternalLink,
  Database,
  LogOut,
  Mail,
  Edit2,
  Check,
  ArrowLeft,
  User as UserIcon,
  Loader2,
  AlertCircle,
  X,
  HelpCircle,
  Settings,
  Clock,
  Info,
} from "lucide-react";
import { EmailClienteRegrasDialog } from "@/components/air/EmailClienteRegrasDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { User, Session } from "@supabase/supabase-js";
import DashboardCards, { CardFilterType } from "@/components/DashboardCards";
import dachserBg from "@/assets/dachser-background.jpg";
import { TablePagination } from "@/components/layout/TablePagination";
import { Filter as FilterIcon } from "lucide-react";
import { AwbTimelineModal } from "@/components/air/AwbTimelineModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateTimeBR } from "@/utils/timezone";

// TEMPORARIAMENTE DESATIVADO - Mudar para true para reativar envio de emails
const EMAIL_SENDING_ENABLED = false;

// 48 horas em milissegundos para remoção de AWBs em ARR
const ARR_RETENTION_HOURS = 120; // 5 dias para AWBs em ARR permanecerem visíveis
const ARR_RETENTION_MS = ARR_RETENTION_HOURS * 60 * 60 * 1000;

// AWBs excluídos manualmente da visualização
const EXCLUDED_AWBS = [
  "045-12829121",
  "020-06994455",
  "045-12570552",
  "045-90854890",
  "045-90418193",
  "045-49624632",
  "045-45987406",
  "045-45198856",
  "045-13298961",
  "045-13298530",
  "045-12718801",
  "045-12579066",
  "045-12570854",
  "045-13105724",
  "045-12829143",
  "045-12580116",
  "996-14197400",
  "577-11135272",
  "045-21167263",
  "045-13300125",
  "045-14265521",
  "045-14265532",
  "045-15957690",
];

const airlines = [
  { code: "006", name: "Delta Cargo" },
  { code: "016", name: "United Cargo" },
  { code: "020", name: "Lufthansa Cargo" },
  { code: "045", name: "LATAM Cargo" },
  { code: "047", name: "TAP Cargo" },
  { code: "055", name: "ITA Cargo" },
  { code: "057", name: "Air France Cargo" },
  { code: "074", name: "KLM Cargo" },
  { code: "075", name: "IAG Cargo" },
  { code: "139", name: "Aeromexico Cargo" },
  { code: "369", name: "Atlas Air Cargo" },
  { code: "549", name: "LATAM Cargo" },
  { code: "577", name: "Azul Cargo" },
  { code: "615", name: "European Air Transport" },
  { code: "724", name: "Swiss International Airlines" },
  { code: "881", name: "Condor Flugdienst GmbH" },
  { code: "996", name: "Air Europa Cargo" },
];

// Função para construir URLs de rastreio por companhia
const getTrackingUrl = (airlineCode: string, fullAwb: string): string | null => {
  // Extrair apenas o número do AWB (remove o código da companhia e hífens/espaços)
  const awbNumber = fullAwb
    .replace(airlineCode, "")
    .replace(/^[-\s]+/, "")
    .trim();

  const urlBuilders: Record<string, (iata: string, awb: string) => string> = {
    "001": (iata, awb) => `https://www.aacargo.com/shipping/tracking.jhtml?search=Search&awb=${iata}${awb}`,
    "014": (iata, awb) => `https://cargo.aircanada.com/Tracking?shipmentCode=${iata}${awb}`,
    "006": (iata, awb) => `https://www.deltacargo.com/Cargo/home/trackShipment?awbNumber=${iata}${awb}&timeZoneOffset=180&t=${Date.now()}`,
    "016": (iata, awb) => `https://www.unitedcargo.com/en/us/track/awb/${iata}-${awb}`,
    "020": (iata, awb) => `https://www.lufthansa-cargo.com/en/eservices/etracking/tracking/-/awb/${iata}/${awb}`,
    "045": (iata, awb) => `https://www.latamcargo.com/en/trackshipment?docNumber=${awb}&docPrefix=${iata}&soType=MAWB`,
    "047": () => `https://www.tapcargo.com/en/e-tracking-results`,
    "055": (iata, awb) => `https://booking.ita-airways-cargo.com/trackAndTrace?awbno=${iata}${awb}`,
    "057": (iata, awb) => `https://www.afklcargo.com/mycargo/shipment/detail/${iata}-${awb}`,
    "074": (iata, awb) => `https://www.afklcargo.com/mycargo/shipment/detail/${iata}-${awb}`,
    "075": (iata, awb) => `https://api.tracking.iagcargo.com/tracking/${iata}-${awb}`,
    "139": (iata, awb) => `https://www.aeromexico.com/es-mx/carga/rastrear?awb=${iata}${awb}`,
    "147": () => `https://ebooking.champ.aero/trace/AT/trace.asp`,
    "157": () => `https://www.qrcargo.com/s/track-your-shipment`,
    "160": () => `https://www.cathaycargo.com/en-us/track-and-trace.html`,
    "176": (iata, awb) => `https://eskycargo.emirates.com/app/offerandorder/#/shipments/list?type=D&values=${iata}${awb}`,
    "369": (iata, awb) => `https://jumpseat.atlasair.com/aa/tracktracehtml/TrackTrace.html?pe=${iata}&se=${awb}`,
    "549": (iata, awb) => `https://www.latamcargo.com/en/trackshipment?docNumber=${awb}&docPrefix=${iata}&soType=MAWB`,
    "577": (iata, awb) => `https://azulcargoexpress.smartkargo.com/FrmAWBTracking.aspx?AWBPrefix=${iata}&AWBno=${awb}`,
    "605": () => `https://cargo.skyairline.com/rastreo`,
    "615": (iata, awb) => `https://aviationcargo.dhl.com/track/${iata}-${awb}`,
    "724": (iata, awb) => `https://offerandorder.swissworldcargo.com/app/offerandorder/#/shipments/list?type=D&values=${iata}${awb}`,
    "729": (iata, awb) => `https://cargoapps.aviancacargo.com/#/e-tracking/details/${iata}-${awb}`,
    "881": (iata, awb) => `https://www.condor.com/eu/en/cargo/tracking.jsp?awb=${iata}${awb}`,
    "996": (iata, awb) => `https://parcelsapp.com/en/tracking/${iata}${awb}`,
  };

  const builder = urlBuilders[airlineCode];
  return builder ? builder(airlineCode, awbNumber) : null;
};

// Mapeamento de descrições de status para siglas
const statusDescriptionToCode: Record<string, string> = {
  delivered: "DLV",
  "in transit": "TRA",
  "customs clearance": "CLR",
  "out for delivery": "OFD",
  "arrival at destination": "ARR",
  "departure from origin": "DEP",
  "received from flight": "RCF",
  warehouse: "WHR",
  pending: "PND",
  held: "HLD",
  returned: "RTN",
  cancelled: "CAN",
  arrived: "ARR",
  departed: "DEP",
  "in customs": "CUS",
  "cleared customs": "CLR",
};

// Função para extrair ou mapear o código do status
const getStatusCode = (lastEvent: string | null): string => {
  if (!lastEvent) return "AGUARDANDO CONSULTA";

  // Tratamento de erros específicos do banco de dados
  if (lastEvent === "NOT_FOUND") {
    return "Status não encontrado";
  }

  // Processing/Timeout status
  if (
    lastEvent === "Em Processamento" ||
    lastEvent.includes("Processando") ||
    lastEvent.includes("Timeout") ||
    lastEvent.includes("timeout")
  ) {
    return "Processando";
  }

  if (lastEvent === "AWB_INVALID") {
    return "AWB Inválido";
  }

  if (lastEvent === "ERRO" || lastEvent === "COMPANY_NOT_REGISTERED") {
    return "Falha na consulta";
  }

  // Tratamento de erros específicos (formatos antigos)
  if (lastEvent.includes("AWB_NOT_FOUND") || lastEvent === "Status não encontrado") {
    return "Status não encontrado";
  }

  if (lastEvent === "AWB não encontrado") {
    return "AWB não encontrado";
  }

  // Se o lastEvent já é um código de status conhecido (4 caracteres ou menos), retorna como está
  const knownStatusCodes = [
    "OFLD", "NIL", "NIF", "DIS", "DLV", "DEP", "ARR", "RCF", "RCS", 
    "MAN", "NFD", "AWD", "BKD", "BKF", "AWB", "FWB", "FOH", "TFD", "RCT", 
    "RCP", "PRE", "LOF", "TDE", "CCD", "ASN", "MIS", "TFS", "POD", "TRM",
    "ARRT", "CAN", "DISCREPANCY",
    "ARR - DESTINO", "ARR - CONEXÃO"
  ];
  const upperEvent = lastEvent.toUpperCase().trim();
  
  // Preserve ARR status with suffix (ARR - Destino, ARR - Conexão)
  if (upperEvent.startsWith('ARR - ')) {
    return upperEvent;
  }
  
  if (knownStatusCodes.includes(upperEvent)) {
    return upperEvent;
  }

  // Se tem o formato "XXX - Description" (mas não ARR), retorna a sigla
  if (lastEvent.includes(" - ")) {
    return lastEvent.split(" - ")[0];
  }

  // Tenta mapear a descrição para uma sigla conhecida
  const lowerEvent = lastEvent.toLowerCase().trim();
  const mappedCode = statusDescriptionToCode[lowerEvent];

  if (mappedCode) {
    return mappedCode;
  }

  // Se não encontrar mapeamento, retorna os primeiros 3 caracteres em maiúsculo
  return lastEvent.substring(0, 3).toUpperCase();
};

// Função para calcular a posição do avião na timeline (0-100%)
// Nova ordem da régua: BKD → RCF → MAN → DEP → ARR
// Pontos visuais em: 0% (BKD), 25% (RCF), 50% (MAN), 75% (DEP), 100% (ARR)
const getTimelineProgress = (lastEvent: string | null): number => {
  if (!lastEvent) return 0;

  const statusCode = getStatusCode(lastEvent).toUpperCase();
  const lowerEvent = lastEvent.toLowerCase();

  // Mapeamento de status para a nova régua: BKD → RCF → MAN → DEP → ARR
  const progressMap: Record<string, number> = {
    // BKD e variações (0%)
    BKD: 0,
    BOOKED: 0,
    BOOKING: 0,
    KK: 0,
    BKF: 5,
    AWB: 8,
    FWB: 8,
    RCS: 15,
    "RECEIVED FROM SHIPPER": 15,

    // RCF e variações (25%)
    RCF: 25,
    "RECEIVED FROM FLIGHT": 25,
    RECEIVED: 25,
    FOH: 20,
    "FREIGHT ON HAND": 20,

    // MAN e variações (50%)
    MAN: 50,
    MANIFESTED: 50,
    MANIFEST: 50,
    MNF: 50,

    // DEP e variações (75%)
    DEP: 75,
    DEPARTED: 75,
    DEPARTURE: 75,
    TFD: 65,
    "TRANSFERRED TO ANOTHER AIRLINE": 65,
    RCT: 60,
    "RECEIVED FROM ANOTHER AIRLINE": 60,
    RCP: 55,
    PRE: 58,
    LOF: 62,

    // ARR e variações (100%)
    ARR: 100,
    ARRIVED: 100,
    ARRIVAL: 100,
    ARRT: 95,
    TDE: 90,
    
    // Status finais pós-ARR (mantém em 100%)
    NFD: 100,
    NOTIFIED: 100,
    AWD: 100,
    "DOCUMENT DELIVERED": 100,
    CCD: 100,
    ASN: 100,
    MIS: 100,
    TFS: 100,
    DLV: 100,
    DELIVERED: 100,
    POD: 100,
    "PROOF OF DELIVERY": 100,

    // Status de alerta (posição intermediária)
    DIS: 80,
    DISCREPANCY: 80,
    OFLD: 80,
    OFFLOADED: 80,
    NIL: 60,
    NIF: 60,
    TRM: 55,
  };

  // Tenta encontrar por código exato
  if (progressMap[statusCode]) {
    return progressMap[statusCode];
  }

  // Tenta encontrar por descrição parcial
  for (const [key, value] of Object.entries(progressMap)) {
    if (lowerEvent.includes(key.toLowerCase())) {
      return value;
    }
  }

  // Status desconhecido ou aguardando - início da timeline
  if (statusCode === "AGUARDANDO CONSULTA") return 0;

  return 10; // Status desconhecido assume posição no primeiro segmento
};

interface AWBData {
  id: string;
  awb: string;
  hawb?: string;
  airline_code: string;
  consignee_name: string;
  last_event: string;
  status: string;
  created_at?: string;
  last_check?: string;
  nome_analista?: string;
  email_analista?: string;
  email_cliente?: string;
  origem?: string;
  destino?: string;
  fromStatusAereo?: boolean;
  data_atraso?: string | null;
  tipo_servico?: string;
  arr_check_count?: number; // Contador de verificações em ARR
}

const STORAGE_KEY = "tracked-awbs";

const Index = () => {
  useUsageLog({ endpoint: "/air/tracking" });
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [awbNumber, setAwbNumber] = useState("");
  const [selectedAirline, setSelectedAirline] = useState("");
  const [consigneeName, setConsigneeName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAirline, setFilterAirline] = useState("all");
  const [filterAnalyst, setFilterAnalyst] = useState("all");
  const [filterService, setFilterService] = useState("all");
  const [sortAnalyst, setSortAnalyst] = useState<"asc" | "desc" | null>(null);
  const [sortAwb, setSortAwb] = useState<"asc" | "desc" | null>(null);
  const [sortClient, setSortClient] = useState<"asc" | "desc" | null>(null);
  const [sortLastCheck, setSortLastCheck] = useState<"asc" | "desc" | null>(null);
  const [awbsList, setAwbsList] = useState<AWBData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [trackingAwb, setTrackingAwb] = useState<string | null>(null);
  const [addingToDb, setAddingToDb] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [statusAereoData, setStatusAereoData] = useState<AWBData[]>([]);
  const [isLoadingStatusAereo, setIsLoadingStatusAereo] = useState(false);
  const [retrackingAwbs, setRetrackingAwbs] = useState<Set<string>>(new Set());
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [cardFilter, setCardFilter] = useState<CardFilterType>("all");
  const [showUnregisteredModal, setShowUnregisteredModal] = useState(false);
  const [showMonitoredModal, setShowMonitoredModal] = useState(false);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [isLoadingDbStats, setIsLoadingDbStats] = useState(false);
  const [regrasDialogOpen, setRegrasDialogOpen] = useState(false);
  const [timelineModal, setTimelineModal] = useState<{ open: boolean; awb: string; consigneeName: string }>({
    open: false,
    awb: "",
    consigneeName: "",
  });
  const isPausedRef = useRef(false);
  const shouldSendEmailsRef = useRef(false); // Only send emails when user explicitly clicks button
  const emailEnableTimestampRef = useRef<number>(0); // Track when emails were enabled
  const EMAIL_ENABLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout for email sending
  // Track emails already sent to prevent duplicates (key: "AWB-STATUS")
  const emailsSentRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  // Sync isPaused state with ref
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const itemsPerPage = 10;

  // Save AWBs to localStorage
  const saveToStorage = React.useCallback((awbs: AWBData[]) => {
    console.log("Saving to storage, first AWB:", awbs[0]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(awbs));
    setAwbsList(awbs);
  }, []);

  // Check authentication (optional - just get user info if available)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);


  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
  };

  // Load AWBs from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log("Loaded from storage, first AWB:", parsed[0]);
        setAwbsList(parsed);
      } catch (e) {
        console.error("Error loading AWBs:", e);
      }
    }
  }, []);

  // Fetch AWBs from t_status_aereo
  const fetchStatusAereoData = React.useCallback(async () => {
    setIsLoadingStatusAereo(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-status-aereo", {
        body: { search: "" },
      });

      if (error) {
        console.error("Error fetching status aereo:", error);
        return;
      }

      if (data?.success && data?.data) {
        // Convert t_status_aereo data to AWBData format
        const convertedData: AWBData[] = data.data.map((item: any, index: number) => ({
          id: `status-${item.id || index}`,
          awb: item.awb || "",
          airline_code: item.awb?.substring(0, 3) || "",
          consignee_name: item.destinatário || "-",
          hawb: item.hawb || "-",
          nome_analista: item.nome_analista || "-",
          email_analista: item.email_analista || null,
          email_cliente: item.email_cliente || "",
          origem: item.origem || "N/A",
          destino: item.destino || "N/A",
          last_event: item.status_info || item.último_status || "-",
          status: item.último_status || "-",
          last_check: item["última atualização"]
            ? new Date(item["última atualização"]).toISOString()
            : new Date().toISOString(),
          fromStatusAereo: true,
          data_atraso: item.data_atraso || null,
          tipo_servico: item.tipo_servico || "N/A",
          arr_check_count: item.arr_check_count || 0,
        }));

        // Deduplicate by AWB + HAWB combination - keep only the most recent record
        // An AWB can have multiple houses, so we use awb+hawb as the unique key
        const deduplicatedData = convertedData.reduce((acc: AWBData[], current: AWBData) => {
          const currentKey = `${current.awb}|${current.hawb || '-'}`;
          const existingIndex = acc.findIndex(item => {
            const itemKey = `${item.awb}|${item.hawb || '-'}`;
            return itemKey === currentKey;
          });
          if (existingIndex === -1) {
            // AWB+HAWB combination doesn't exist yet, add it
            acc.push(current);
          } else {
            // Combination exists, keep the one with most recent last_check
            const existing = acc[existingIndex];
            const existingDate = new Date(existing.last_check || 0).getTime();
            const currentDate = new Date(current.last_check || 0).getTime();
            if (currentDate > existingDate) {
              // Replace with the more recent one
              acc[existingIndex] = current;
            }
          }
          return acc;
        }, []);

        console.log(`AWB Deduplication: ${convertedData.length} -> ${deduplicatedData.length} records`);
        setStatusAereoData(deduplicatedData);
      }
    } catch (error) {
      console.error("Error in fetchStatusAereoData:", error);
    } finally {
      setIsLoadingStatusAereo(false);
    }
  }, []);

  // Fetch database statistics from t_master_dados
  const fetchDbStats = useCallback(async () => {
    setIsLoadingDbStats(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-master-dados-stats");
      
      if (error) {
        console.error("Error fetching db stats:", error);
        return;
      }

      if (data?.success && data?.stats) {
        setDbStats(data.stats);
      }
    } catch (error) {
      console.error("Error in fetchDbStats:", error);
    } finally {
      setIsLoadingDbStats(false);
    }
  }, []);

  // Load status aereo data on mount
  useEffect(() => {
    // Initialize database columns if needed
    const initColumns = async () => {
      try {
        await supabase.functions.invoke("add-alert-status-column", { body: {} });
      } catch (e) {
        console.log("Alert column already exists or initialization skipped");
      }
      try {
        await supabase.functions.invoke("add-arr-check-column", { body: {} });
      } catch (e) {
        console.log("arr_check_count column already exists or initialization skipped");
      }
    };
    initColumns();

    fetchStatusAereoData();
    fetchDbStats();
    const interval = setInterval(fetchStatusAereoData, 30000); // Refresh every 30s
    const statsInterval = setInterval(fetchDbStats, 60000); // Refresh stats every 60s
    return () => {
      clearInterval(interval);
      clearInterval(statsInterval);
    };
  }, [fetchStatusAereoData, fetchDbStats]);

  // Function to re-track AWBs from t_status_aereo
  // sendNoChangesEmail: only send "no changes" email when explicitly triggered by user (button click)
  const retrackAWBsFromStatus = React.useCallback(
    async (sendNoChangesEmail: boolean = false) => {
      if (isPausedRef.current) {
        console.log("Processing paused - not starting retrack");
        return;
      }

      try {
        console.log("Starting re-track process for AWBs in t_status_aereo");

        const BATCH_SIZE = 10;
        let offset = 0;
        let totalRetracked = 0;
        let hasMoreData = true;
        const statusChanges: Array<{
          awb: string;
          oldStatus: string;
          newStatus: string;
          lastUpdate: string;
          origin?: string;
          destination?: string;
          hawb?: string;
        }> = [];

        while (hasMoreData) {
          if (isPausedRef.current) {
            toast({
              title: "Re-rastreio pausado",
              description: `${totalRetracked} AWB(s) re-rastreados antes da pausa`,
            });
            return;
          }

          const { data, error } = await supabase.functions.invoke("fetch-awbs-for-retrack", {
            body: { limit: BATCH_SIZE, offset },
          });

          if (error) {
            console.error("Error fetching AWBs for retrack:", error);
            break;
          }

          if (!data?.data || data.data.length === 0) {
            hasMoreData = false;
            break;
          }

          // Process each AWB in the batch
          for (const item of data.data) {
            if (isPausedRef.current) {
              setRetrackingAwbs(new Set());
              toast({
                title: "Re-rastreio pausado",
                description: `${totalRetracked} AWB(s) re-rastreados antes da pausa`,
              });
              return;
            }

            try {
              const awbNumber = item.awb;
              const airlineCode = awbNumber.substring(0, 3);
              const oldStatus = item.último_status || item["último_status"] || "N/A";

              // Debug: Log the full item to see all properties
              console.log("Full item object:", JSON.stringify(item));
              console.log("Item keys:", Object.keys(item));

              // Get hawb from the item - explicitly access the hawb property
              const rawItem = item as Record<string, any>;
              const hawbValue = rawItem.hawb ?? rawItem["hawb"] ?? "";
              const itemHawb = hawbValue && hawbValue !== "" && hawbValue !== "N/A" ? hawbValue : "N/A";
              console.log(`Extracted HAWB for ${awbNumber}: "${itemHawb}" from raw value: "${rawItem.hawb}"`);
              const itemUltimaAtualizacao =
                item["última atualização"] ||
                item.última_atualização ||
                item["ultima atualizacao"] ||
                new Date().toLocaleString("pt-BR");

              // Get nome_analista from the item
              const itemNomeAnalista = item.nome_analista || item["nome_analista"] || "N/A";

              // Get email_analista from the item
              const itemEmailAnalista = item.email_analista || item["email_analista"] || null;

              // Get email_cliente from the item
              const itemEmailCliente = item.email_cliente || item["email_cliente"] || null;

              // Mark AWB as being retracked
              setRetrackingAwbs((prev) => new Set(prev).add(awbNumber));

              console.log(`Re-tracking AWB: ${awbNumber}, HAWB: ${itemHawb}, Analista: ${itemNomeAnalista}, Email Analista: ${itemEmailAnalista}`);

              const { data: trackData, error: trackError } = await supabase.functions.invoke("track-awb", {
                body: { awb: awbNumber, airlineCode },
              });

              if (!trackError && trackData?.success && trackData.data) {
                const latestEvent = trackData.data.events?.[0];
                const lastEventText = latestEvent ? `${latestEvent.status} - ${latestEvent.description}` : "Rastreado";
                const newStatus = getStatusCode(lastEventText);

                // Update t_status_aereo with new status (preserve hawb and nome_analista)
                // Extract DEP timestamp from carrier data when status is DEP
                const statusCode = trackData.data.lastStatus?.code || trackData.data.status || "";
                const depTimestamp = statusCode === "DEP" ? trackData.data.lastStatus?.timestamp : null;
                
                await supabase.functions.invoke("add-awb-to-status", {
                  body: {
                    mawb: awbNumber,
                    last_event: lastEventText,
                    consignee_name: item.destinatário || "N/A",
                    airline_code: airlineCode,
                    hawb: "N/A", // Always N/A during reprocessing to preserve existing values
                    nome_analista: "N/A", // Always N/A during reprocessing to preserve existing values
                    origin: trackData.data.origin || "N/A",
                    destination: trackData.data.destination || "N/A",
                    dep_timestamp: depTimestamp, // Timestamp real do DEP da companhia aérea
                    arr_location: trackData.data.lastStatus?.location || null, // IATA code where ARR occurred
                  },
                });

                // Track status change - send individual email immediately
                // Normalize both statuses to uppercase for comparison to avoid false positives (e.g., "ERRO" vs "Erro")
                const normalizedOldStatus = (oldStatus || "").toUpperCase().trim();
                const normalizedNewStatus = (newStatus || "").toUpperCase().trim();
                
                // CRITICAL: Skip if normalized statuses are the same (case-only difference)
                if (normalizedOldStatus === normalizedNewStatus) {
                  console.log(`[EMAIL SKIP] Case-only difference for ${awbNumber}: "${oldStatus}" vs "${newStatus}" - both normalize to "${normalizedOldStatus}"`);
                } else {
                  console.log(`Status change detected for ${awbNumber}: ${oldStatus} -> ${newStatus}`);
                  console.log("Sending individual email for AWB:", awbNumber, "HAWB:", itemHawb);

                  const statusChange = {
                    awb: awbNumber,
                    oldStatus,
                    newStatus,
                    lastUpdate: itemUltimaAtualizacao,
                    origin: trackData.data.origin || "N/A",
                    destination: trackData.data.destination || "N/A",
                    hawb: itemHawb,
                    analystEmail: itemEmailAnalista,
                  };

                  statusChanges.push(statusChange);

                  // DETAILED LOGGING: Track email decision
                  console.log(`[EMAIL DECISION] AWB: ${awbNumber}`);
                  console.log(`[EMAIL DECISION] shouldSendEmailsRef.current: ${shouldSendEmailsRef.current}`);
                  console.log(`[EMAIL DECISION] EMAIL_SENDING_ENABLED: ${EMAIL_SENDING_ENABLED}`);
                  console.log(`[EMAIL DECISION] Old status: "${oldStatus}" -> Normalized: "${normalizedOldStatus}"`);
                  console.log(`[EMAIL DECISION] New status: "${newStatus}" -> Normalized: "${normalizedNewStatus}"`);

                  // Check if email enable timestamp is still valid (within timeout period)
                  const emailEnableAge = Date.now() - emailEnableTimestampRef.current;
                  const isEmailTimestampValid = emailEnableAge < EMAIL_ENABLE_TIMEOUT_MS && emailEnableTimestampRef.current > 0;
                  console.log(`[EMAIL DECISION] Email enable age: ${Math.round(emailEnableAge / 1000)}s, Valid: ${isEmailTimestampValid}`);

                  // Send individual email for this AWB - ONLY if user explicitly clicked button AND emails are enabled AND timestamp is valid
                  if (shouldSendEmailsRef.current && EMAIL_SENDING_ENABLED && isEmailTimestampValid) {
                    // Check if email was already sent for this AWB+status combination to prevent duplicates
                    const emailKey = `${awbNumber}-${normalizedNewStatus}`;
                    if (emailsSentRef.current.has(emailKey)) {
                      console.log(`[EMAIL SKIPPED DUPLICATE] Email already sent for ${emailKey} - preventing duplicate`);
                    } else {
                      // Mark as sent BEFORE sending to prevent race conditions
                      emailsSentRef.current.add(emailKey);
                      
                      // Use email_cliente directly from the item
                      const customerEmail = itemEmailCliente || undefined;

                      console.log(
                        `[EMAIL SENDING] Customer email for ${awbNumber}: email=${customerEmail}`,
                      );

                      try {
                        const { data: emailData, error: emailError } = await supabase.functions.invoke(
                          "send-status-change-email",
                          {
                            body: {
                              statusChanges: [statusChange],
                              customerEmail: customerEmail,
                              analystEmail: itemEmailAnalista,
                            },
                          },
                        );

                        if (emailError) {
                          console.error(`Error sending email for AWB ${awbNumber}:`, emailError);
                          // Remove from sent set so it can be retried
                          emailsSentRef.current.delete(emailKey);
                        } else {
                          console.log(`Email sent successfully for AWB ${awbNumber}:`, emailData);
                          toast({
                            title: "Email enviado",
                            description: customerEmail
                              ? `Notificação enviada para AWB ${awbNumber} (incluindo cliente: ${customerEmail})`
                              : `Notificação enviada para AWB ${awbNumber}`,
                          });
                        }
                      } catch (emailError) {
                        console.error(`Exception sending email for AWB ${awbNumber}:`, emailError);
                        // Remove from sent set so it can be retried
                        emailsSentRef.current.delete(emailKey);
                      }

                      // Wait 1 minute before processing next AWB to avoid spam
                      console.log("Waiting 1 minute before processing next AWB...");
                      await new Promise((resolve) => setTimeout(resolve, 60000));
                    }
                  } else {
                    console.log(`[EMAIL SKIPPED] AWB ${awbNumber} - shouldSendEmailsRef=${shouldSendEmailsRef.current}, EMAIL_SENDING_ENABLED=${EMAIL_SENDING_ENABLED}, timestampValid=${Date.now() - emailEnableTimestampRef.current < EMAIL_ENABLE_TIMEOUT_MS}`);
                  }
                }

                totalRetracked++;
              }

              // Remove AWB from retracking set
              setRetrackingAwbs((prev) => {
                const newSet = new Set(prev);
                newSet.delete(awbNumber);
                return newSet;
              });
            } catch (error) {
              console.error(`Error re-tracking AWB ${item.awb}:`, error);
              // Remove from retracking set on error too
              setRetrackingAwbs((prev) => {
                const newSet = new Set(prev);
                newSet.delete(item.awb);
                return newSet;
              });
            }
          }

          offset += BATCH_SIZE;

          if (data.data.length < BATCH_SIZE) {
            hasMoreData = false;
          }
        }

        // Clear all retracking indicators
        setRetrackingAwbs(new Set());

        // Email "no changes" disabled - user requested removal
        if (statusChanges.length > 0) {
          toast({
            title: "Processamento concluído",
            description: `${statusChanges.length} email(s) enviado(s) com alterações de status`,
          });
        }

        if (totalRetracked > 0) {
          const now = new Date();
          const formattedDate = now.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          toast({
            title: "Re-rastreio completo!",
            description: `Rastreio atualizado às ${formattedDate}`,
          });
        }

        // Show completion popup after retracking finishes
        setShowCompletionPopup(true);
        
        // CRITICAL: Reset email flags after processing completes
        // This prevents emails from being sent on automatic/background processing
        console.log("[EMAIL CONTROL] Retracking complete - disabling email sending");
        shouldSendEmailsRef.current = false;
        emailEnableTimestampRef.current = 0;
      } catch (error) {
        console.error("Error in retrack process:", error);
        // Reset email flags on error too
        shouldSendEmailsRef.current = false;
        emailEnableTimestampRef.current = 0;
        toast({
          title: "Erro no re-rastreio",
          description: "Erro ao re-rastrear AWBs",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  // Function to fetch AWBs in batches using persistent queue
  const fetchAWBsInBatches = React.useCallback(async () => {
    // Check if paused before starting
    if (isPausedRef.current) {
      console.log("Processing paused - not starting batch fetch");
      return;
    }

    try {
      // Step 1: Create queue table if not exists
      console.log("Step 1: Creating/verifying queue table...");
      await supabase.functions.invoke("manage-processing-queue", {
        body: { action: "create_table" },
      });

      // Step 2: Populate queue with unprocessed AWBs
      console.log("Step 2: Populating queue with unprocessed AWBs...");
      const { data: populateData, error: populateError } = await supabase.functions.invoke("manage-processing-queue", {
        body: { action: "populate" },
      });

      if (populateError) {
        throw new Error(populateError.message || "Failed to populate queue");
      }

      const totalInQueue = populateData?.count || 0;
      console.log(`Queue populated with ${totalInQueue} AWBs`);

      if (totalInQueue === 0) {
        toast({
          title: "Nenhum AWB para processar",
          description: "Todos os AWBs já foram processados",
        });
        return;
      }

      toast({
        title: "Iniciando processamento",
        description: `${totalInQueue} AWB(s) na fila de processamento`,
      });

      // Step 3: Process AWBs from queue in batches
      const BATCH_SIZE = 10;
      let batchNumber = 1;
      let totalProcessed = 0;
      let hasMoreData = true;

      const stored = localStorage.getItem(STORAGE_KEY);
      const existingAwbs = stored ? JSON.parse(stored) : [];

      while (hasMoreData) {
        // Check if paused
        if (isPausedRef.current) {
          toast({
            title: "Processamento pausado",
            description: `${totalProcessed} AWB(s) processados antes da pausa`,
          });
          return;
        }

        console.log(`Fetching batch ${batchNumber} from queue`);

        // Fetch batch from queue
        const { data: queueData, error: queueError } = await supabase.functions.invoke("manage-processing-queue", {
          body: {
            action: "fetch",
            limit: BATCH_SIZE,
            offset: 0, // Always fetch from start since we remove processed items
          },
        });

        if (queueError) {
          console.error("Error fetching from queue:", queueError);
          break;
        }

        if (!queueData?.data || !Array.isArray(queueData.data) || queueData.data.length === 0) {
          // Queue is empty, break and let retrackAWBsFromStatus handle retracking
          console.log("Queue empty, will start re-tracking after batch processing completes...");
          hasMoreData = false;
          break;
        }

        const importedAwbs: AWBData[] = queueData.data
          .filter((item: any) => {
            const mawb = item.mawb?.trim() || "";
            // Skip empty MAWBs
            if (!mawb || mawb.length < 3) {
              console.log(`Skipping invalid MAWB: "${mawb}"`);
              return false;
            }
            return true;
          })
          .map((item: any, index: number) => {
            const mawb = item.mawb.trim();
            const airlineCode = mawb.slice(0, 3);

            return {
              id: `queue-${Date.now()}-${index}`,
              awb: mawb,
              hawb: item.hawb || "",
              airline_code: airlineCode,
              consignee_name: item.destinatario || "",
              last_event: "Aguardando rastreio...",
              status: "PENDING",
              created_at: new Date().toISOString(),
              nome_analista: item.nome_analista || "",
              email_analista: "",
              email_cliente: item.email_cliente || "",
            };
          });

        // Process all AWBs from queue (queue already filtered against t_status_aereo)
        const currentStorage = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const newAwbs = importedAwbs;

        if (newAwbs.length > 0) {
          // Save batch immediately
          const mergedAwbs = [...currentStorage, ...newAwbs];
          saveToStorage(mergedAwbs);

          toast({
            title: `Processando lote ${batchNumber}`,
            description: `${newAwbs.length} AWB(s) da fila. Rastreando...`,
          });

          // Track each AWB in this batch sequentially
          for (let i = 0; i < newAwbs.length; i++) {
            // Check if paused before processing each AWB
            if (isPausedRef.current) {
              toast({
                title: "Processamento pausado",
                description: `${totalProcessed + i} AWB(s) processados antes da pausa`,
              });
              return;
            }

            const awb = newAwbs[i];

            try {
              setTrackingAwb(awb.id);

              // Validate AWB before tracking
              if (!awb.awb || awb.awb.trim().length < 3) {
                console.error(`Invalid AWB format: "${awb.awb}"`);
                throw new Error("AWB inválido");
              }

              const { data: trackData, error: trackError } = await supabase.functions.invoke("track-awb", {
                body: { awb: awb.awb, airlineCode: awb.airline_code },
              });

              if (!trackError && trackData?.success && trackData.data) {
                const latestEvent = trackData.data.events?.[0];
                const lastEventText = latestEvent ? `${latestEvent.status} - ${latestEvent.description}` : "Rastreado";
                const updatedAwb = {
                  ...awb,
                  last_event: lastEventText,
                  status: trackData.data.status || "TRACKED",
                  last_check: new Date().toISOString(),
                  origem: trackData.data.origin || "N/A",
                  destino: trackData.data.destination || "N/A",
                };

                // Update storage with tracked AWB
                const currentList = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
                const updatedList = currentList.map((item: AWBData) => (item.id === awb.id ? updatedAwb : item));
                saveToStorage(updatedList);

                // Add to t_status_aereo
                await supabase.functions.invoke("add-awb-to-status", {
                  body: {
                    mawb: awb.awb,
                    last_event: lastEventText,
                    consignee_name: awb.consignee_name,
                    airline_code: awb.airline_code,
                    hawb: awb.hawb || "N/A",
                    nome_analista: awb.nome_analista || "N/A",
                    origin: trackData.data.origin || "N/A",
                    destination: trackData.data.destination || "N/A",
                    email_cliente: awb.email_cliente || null,
                    arr_location: trackData.data.lastStatus?.location || null, // IATA code where ARR occurred
                  },
                });

                console.log(`AWB ${awb.awb} added to t_status_aereo`);

                // Send individual email notification for new AWB
                const newStatus = getStatusCode(lastEventText);
                const statusChange = {
                  awb: awb.awb,
                  oldStatus: "NOVO",
                  newStatus,
                  lastUpdate: new Date().toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  origin: trackData.data.origin || "N/A",
                  destination: trackData.data.destination || "N/A",
                  hawb: awb.hawb || "N/A",
                };

                // DETAILED LOGGING: Track email decision for new AWB
                console.log(`[EMAIL DECISION NEW AWB] AWB: ${awb.awb}`);
                console.log(`[EMAIL DECISION NEW AWB] shouldSendEmailsRef.current: ${shouldSendEmailsRef.current}`);
                console.log(`[EMAIL DECISION NEW AWB] EMAIL_SENDING_ENABLED: ${EMAIL_SENDING_ENABLED}`);

                // Check if email enable timestamp is still valid
                const emailEnableAgeNew = Date.now() - emailEnableTimestampRef.current;
                const isEmailTimestampValidNew = emailEnableAgeNew < EMAIL_ENABLE_TIMEOUT_MS && emailEnableTimestampRef.current > 0;
                console.log(`[EMAIL DECISION NEW AWB] Email enable age: ${Math.round(emailEnableAgeNew / 1000)}s, Valid: ${isEmailTimestampValidNew}`);

                // Send email for new AWB - ONLY if user explicitly clicked button AND emails are enabled AND timestamp valid
                if (shouldSendEmailsRef.current && EMAIL_SENDING_ENABLED && isEmailTimestampValidNew) {
                  // Check if email was already sent for this AWB+status combination to prevent duplicates
                  const emailKey = `${awb.awb}-${newStatus.toUpperCase()}`;
                  if (emailsSentRef.current.has(emailKey)) {
                    console.log(`[EMAIL SKIPPED DUPLICATE NEW AWB] Email already sent for ${emailKey} - preventing duplicate`);
                  } else {
                    // Mark as sent BEFORE sending to prevent race conditions
                    emailsSentRef.current.add(emailKey);
                    
                    try {
                      console.log(`[EMAIL SENDING NEW AWB] Sending email for ${awb.awb}...`);
                      const { data: emailData, error: emailError } = await supabase.functions.invoke(
                        "send-status-change-email",
                        {
                          body: { 
                            statusChanges: [statusChange],
                            analystEmail: awb.email_analista || null,
                          },
                        },
                      );

                      if (emailError) {
                        console.error(`Error sending email for AWB ${awb.awb}:`, emailError);
                        // Remove from sent set so it can be retried
                        emailsSentRef.current.delete(emailKey);
                      } else {
                        console.log(`Email sent successfully for AWB ${awb.awb}:`, emailData);
                        toast({
                          title: "Email enviado",
                          description: `Notificação enviada para novo AWB ${awb.awb}`,
                        });
                      }
                    } catch (emailError) {
                      console.error(`Exception sending email for AWB ${awb.awb}:`, emailError);
                      // Remove from sent set so it can be retried
                      emailsSentRef.current.delete(emailKey);
                    }

                    // Wait 1 minute before processing next AWB to avoid spam
                    console.log("Waiting 1 minute before processing next AWB...");
                    await new Promise((resolve) => setTimeout(resolve, 60000));
                  }
                } else {
                  console.log(`[EMAIL SKIPPED NEW AWB] AWB ${awb.awb} - shouldSendEmailsRef=${shouldSendEmailsRef.current}, EMAIL_SENDING_ENABLED=${EMAIL_SENDING_ENABLED}, timestampValid=${isEmailTimestampValidNew}`);
                }

                // Step 4: Remove from queue after successful processing
                console.log(`[REMOVE] Requesting removal of AWB ${awb.awb} from queue...`);
                const { data: removeData, error: removeError } = await supabase.functions.invoke(
                  "manage-processing-queue",
                  {
                    body: {
                      action: "remove",
                      mawb: awb.awb,
                    },
                  },
                );

                if (removeError) {
                  console.error(`[REMOVE ERROR] Failed to remove AWB ${awb.awb}:`, removeError);
                  console.error(`[REMOVE ERROR] Full error object:`, JSON.stringify(removeError, null, 2));
                } else {
                  console.log(`[REMOVE SUCCESS] AWB ${awb.awb} removal response:`, JSON.stringify(removeData, null, 2));

                  // Validate removal - verify AWB is no longer in queue
                  const { data: verifyData } = await supabase.functions.invoke("manage-processing-queue", {
                    body: { action: "count" },
                  });
                  console.log(`[REMOVE VERIFY] Queue count after removal: ${verifyData?.count || 0}`);

                  if (removeData?.deletedCount === 0) {
                    console.error(`[REMOVE WARNING] AWB ${awb.awb} was NOT removed from queue (deletedCount=0)`);
                  } else {
                    console.log(
                      `[REMOVE CONFIRMED] AWB ${awb.awb} successfully removed (deletedCount=${removeData?.deletedCount || "unknown"})`,
                    );
                  }
                }
              } else {
                throw new Error(trackError?.message || "Falha no rastreio");
              }
            } catch (error) {
              console.error(`Error tracking AWB ${awb.awb}:`, error);

              // Keep the AWB with original data but mark as error
              const currentList = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
              const updatedList = currentList.map((item: AWBData) =>
                item.id === awb.id ? { ...item, last_event: "Erro no rastreio", status: "ERROR" } : item,
              );
              saveToStorage(updatedList);

              // Remove from queue even on error to avoid reprocessing
              console.log(`[REMOVE AFTER ERROR] AWB ${awb.awb} processing failed, requesting removal from queue...`);
              const { data: removeErrorData, error: removeErrorError } = await supabase.functions.invoke(
                "manage-processing-queue",
                {
                  body: {
                    action: "remove",
                    mawb: awb.awb,
                  },
                },
              );

              if (removeErrorError) {
                console.error(`[REMOVE AFTER ERROR] Failed to remove AWB ${awb.awb}:`, removeErrorError);
                console.error(`[REMOVE AFTER ERROR] Full error:`, JSON.stringify(removeErrorError, null, 2));
              } else {
                console.log(
                  `[REMOVE AFTER ERROR SUCCESS] AWB ${awb.awb} removal response:`,
                  JSON.stringify(removeErrorData, null, 2),
                );

                if (removeErrorData?.deletedCount === 0) {
                  console.error(`[REMOVE AFTER ERROR WARNING] AWB ${awb.awb} was NOT removed (deletedCount=0)`);
                } else {
                  console.log(
                    `[REMOVE AFTER ERROR CONFIRMED] AWB ${awb.awb} removed (deletedCount=${removeErrorData?.deletedCount || "unknown"})`,
                  );
                }
              }
            }

            setTrackingAwb(null);
          }

          totalProcessed += newAwbs.length;

          toast({
            title: `Lote ${batchNumber} concluído`,
            description: `${newAwbs.length} AWB(s) processados. Total: ${totalProcessed}`,
          });
        }

        // Check queue count to see if there's more data
        const { data: countData } = await supabase.functions.invoke("manage-processing-queue", {
          body: { action: "count" },
        });

        const remainingInQueue = countData?.count || 0;
        console.log(`Remaining in queue: ${remainingInQueue}`);

        if (remainingInQueue === 0) {
          hasMoreData = false;
        }

        batchNumber++;
      }

      // Clear the queue after processing
      await supabase.functions.invoke("manage-processing-queue", {
        body: { action: "clear" },
      });

      if (totalProcessed > 0) {
        toast({
          title: "Todos AWBs sincronizados!",
          description: `${totalProcessed} AWB(s) processados e salvos no banco.`,
        });
      }

      // Always start retracking after batch processing completes
      // Pass false - don't send "no changes" email automatically, only when user explicitly clicks button
      console.log("Batch processing complete, starting automatic retracking...");
      await retrackAWBsFromStatus(false);
    } catch (error) {
      console.error("Error importing AWBs:", error);
      // Reset email flags on error
      shouldSendEmailsRef.current = false;
      emailEnableTimestampRef.current = 0;
      toast({
        title: "Erro ao importar",
        description: "Erro ao processar AWBs da fila.",
        variant: "destructive",
      });
    }
  }, [toast, saveToStorage, retrackAWBsFromStatus]);

  // Handle refresh button - checks queue and decides to process or retrack
  const handleRefresh = React.useCallback(async () => {
    try {
      toast({
        title: "Atualizando dados",
        description: "Buscando dados mais recentes do banco...",
      });
      
      // Apenas atualiza os dados da tabela t_status_aereo (sem re-rastreio)
      await fetchStatusAereoData();
      
      toast({
        title: "Dados atualizados",
        description: "A lista foi atualizada com os dados mais recentes.",
      });
    } catch (error) {
      console.error("Error in handleRefresh:", error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar dados",
        variant: "destructive",
      });
    }
  }, [toast, fetchStatusAereoData]);

  // Auto-fetch disabled - user must click "Atualizar" button to process AWBs
  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     fetchAWBsInBatches();
  //   }, 1000);
  //   return () => clearTimeout(timer);
  // }, [fetchAWBsInBatches]);

  // Memoized data for monitored airlines modal
  const monitoredAirlinesData = useMemo(() => {
    const monitoredAirlines = [
      { code: "001", name: "American Airlines Cargo" },
      { code: "006", name: "Delta Cargo" },
      { code: "014", name: "Air Canada Cargo" },
      { code: "016", name: "United Cargo" },
      { code: "020", name: "Lufthansa Cargo" },
      { code: "023", name: "FedEx Express" },
      { code: "045", name: "LATAM Cargo" },
      { code: "047", name: "TAP Air Portugal Cargo" },
      { code: "055", name: "ITA Airways Cargo" },
      { code: "057", name: "Air France Cargo" },
      { code: "074", name: "AF/KL Cargo" },
      { code: "075", name: "IAG Cargo" },
      { code: "083", name: "SAA Cargo" },
      { code: "112", name: "China Cargo Airlines" },
      { code: "118", name: "TAAG Angola Airlines" },
      { code: "125", name: "IAG Cargo (British Airways)" },
      { code: "127", name: "Gol Linhas Aéreas (GOLLOG)" },
      { code: "139", name: "Aeromexico Cargo" },
      { code: "145", name: "LATAM Cargo Chile" },
      { code: "147", name: "Royal Air Maroc" },
      { code: "157", name: "Qatar Airways Cargo" },
      { code: "160", name: "Cathay Cargo" },
      { code: "172", name: "Cargolux" },
      { code: "176", name: "Emirates SkyCargo" },
      { code: "202", name: "DHLAvianca Cargo" },
      { code: "235", name: "Turkish Airlines Cargo" },
      { code: "318", name: "SKY Carga" },
      { code: "369", name: "Atlas Air" },
      { code: "406", name: "UPS Airlines" },
      { code: "549", name: "LATAM Cargo (Alt)" },
      { code: "577", name: "Azul Cargo" },
      { code: "605", name: "SKY Airline Chile" },
      { code: "615", name: "European Air Transport (DHL)" },
      { code: "724", name: "Swiss WorldCargo" },
      { code: "729", name: "Avianca Cargo" },
      { code: "805", name: "GSA Force" },
      { code: "827", name: "RUSA" },
      { code: "865", name: "MasAir (SmartKargo)" },
      { code: "881", name: "Condor Flugdienst" },
      { code: "992", name: "DHL Aviation Cargo" },
      { code: "996", name: "Air Europa Cargo" },
      { code: "999", name: "Air China Cargo" },
    ];

    return {
      airlines: monitoredAirlines,
      totalAirlines: monitoredAirlines.length,
    };
  }, []);

  const handleAddAWB = async () => {
    if (!awbNumber || !selectedAirline || !consigneeName) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos para cadastrar o AWB.",
        variant: "destructive",
      });
      return;
    }

    // Format AWB with airline code if not already included
    let formattedAwb = awbNumber;
    if (!awbNumber.startsWith(selectedAirline)) {
      const cleanNumber = awbNumber.replace(/\D/g, "");
      formattedAwb = `${selectedAirline}-${cleanNumber}`;
    }

    const newAwb: AWBData = {
      id: Date.now().toString(),
      awb: formattedAwb,
      airline_code: selectedAirline,
      consignee_name: consigneeName,
      last_event: "AWB cadastrado - Rastreando...",
      status: "PENDING",
      created_at: new Date().toISOString(),
    };

    const updatedList = [newAwb, ...awbsList];
    saveToStorage(updatedList);

    toast({
      title: "AWB cadastrado",
      description: "Rastreando automaticamente...",
    });

    setAwbNumber("");
    setSelectedAirline("");
    setConsigneeName("");

    // Automatically track the AWB
    setTrackingAwb(newAwb.id);

    try {
      const { data, error } = await supabase.functions.invoke("track-awb", {
        body: { awb: newAwb.awb, airlineCode: newAwb.airline_code },
      });

      if (error) throw error;

      if (data.success && data.data) {
        const latestEvent = data.data.events?.[0];
        const updatedAwb = {
          ...newAwb,
          last_event: latestEvent ? `${latestEvent.status} - ${latestEvent.description}` : newAwb.last_event,
          status: data.data.status || newAwb.status,
          last_check: new Date().toISOString(),
          origem: data.data.origin || "N/A",
          destino: data.data.destination || "N/A",
        };

        const listAfterTracking = awbsList.map((item) => (item.id === newAwb.id ? updatedAwb : item));

        // If not found in list, add it (since it was just added)
        if (!listAfterTracking.find((item) => item.id === newAwb.id)) {
          listAfterTracking.unshift(updatedAwb);
        }

        saveToStorage(listAfterTracking);

        // Automatically add to database
        setAddingToDb(newAwb.id);

        try {
          // Extract DEP timestamp from carrier data when status is DEP
          const statusCode = data.data.lastStatus?.code || data.data.status || "";
          const depTimestamp = statusCode === "DEP" ? data.data.lastStatus?.timestamp : null;
          
          const { data: dbData, error: dbError } = await supabase.functions.invoke("add-awb-to-status", {
            body: {
              mawb: updatedAwb.awb,
              last_event: updatedAwb.last_event || "N/A",
              consignee_name: updatedAwb.consignee_name || "N/A",
              airline_code: updatedAwb.airline_code,
              hawb: "N/A",
              nome_analista: "N/A",
              origin: data.data.origin || "N/A",
              destination: data.data.destination || "N/A",
              dep_timestamp: depTimestamp, // Timestamp real do DEP da companhia aérea
              arr_location: data.data.lastStatus?.location || null, // IATA code where ARR occurred
            },
          });

          if (dbError) throw dbError;

          if (dbData.success) {
            toast({
              title: "Sucesso completo",
              description: "AWB rastreado e salvo no banco de dados.",
            });
          }
        } catch (dbError) {
          console.error("Error adding AWB to database:", dbError);
          toast({
            title: "AWB rastreado",
            description: "Mas houve erro ao salvar no banco de dados.",
            variant: "destructive",
          });
        } finally {
          setAddingToDb(null);
        }
      }
    } catch (error) {
      console.error("Error tracking AWB:", error);
      toast({
        title: "AWB cadastrado",
        description: "Mas houve erro no rastreamento automático.",
        variant: "destructive",
      });
    } finally {
      setTrackingAwb(null);
    }
  };

  const handleDeleteAWB = (id: string) => {
    const updatedList = awbsList.filter((awb) => awb.id !== id);
    saveToStorage(updatedList);

    toast({
      title: "AWB removido",
      description: "AWB removido da lista de rastreamento.",
    });
  };

  const handleOpenTracking = (awb: string, airlineCode: string) => {
    const [prefix, number] = awb.includes("-") ? awb.split("-") : [awb.slice(0, 3), awb.slice(3)];
    const formattedAwb = awb.includes("-") ? awb : `${prefix}-${number}`;

    const airlineUrls: Record<string, string> = {
      "006": `https://www.deltacargo.com/Cargo/home/trackShipment?awbNumber=${awb.replace("-", "")}&timeZoneOffset=180&t=${Date.now()}`,
      "020": `https://www.lufthansa-cargo.com/en/eservices/etracking/tracking/-/awb/${awb.replace("-", "/")}`,
      "074": `https://www.afklcargo.com/mycargo/shipment/detail/${formattedAwb}`,
      "369": `https://jumpseat.atlasair.com/aa/tracktracehtml/TrackTrace.html?pe=369&se=${number}`,
      "577": `https://azulcargoexpress.smartkargo.com/FrmAWBTracking.aspx?AWBPrefix=577&AWBno=${number}`,
      "057": `https://www.afklcargo.com/mycargo/shipment/detail/${formattedAwb}`,
      "045": `https://www.latamcargo.com/en/trackshipment?docNumber=${number}&docPrefix=${prefix}&soType=MAWB`,
      "047": `https://parcelsapp.com/en/tracking/${formattedAwb}`,
      "055": `https://pg.fr8manage.app/cargospot/fetchTrackingData?airlinePrefix=${prefix}&serialNumber=${number}`,
    };

    const url = airlineUrls[airlineCode];
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast({
        title: "URL não disponível",
        description: "Link de rastreamento não configurado para esta companhia.",
        variant: "destructive",
      });
    }
  };

  const handleTrackAWB = async (awb: AWBData) => {
    setTrackingAwb(awb.id);

    try {
      const { data, error } = await supabase.functions.invoke("track-awb", {
        body: { awb: awb.awb, airlineCode: awb.airline_code },
      });

      if (error) throw error;

      if (data.success && data.data) {
        const latestEvent = data.data.events?.[0];
        const updatedAwb = {
          ...awb,
          last_event: latestEvent ? `${latestEvent.status} - ${latestEvent.description}` : awb.last_event,
          status: data.data.status || awb.status,
          last_check: new Date().toISOString(),
        };

        const updatedList = awbsList.map((item) => (item.id === awb.id ? updatedAwb : item));
        saveToStorage(updatedList);

        toast({
          title: "Rastreamento atualizado",
          description: `Status: ${latestEvent?.status || "N/A"}`,
        });
      }
    } catch (error) {
      console.error("Error tracking AWB:", error);
      toast({
        title: "Erro no rastreamento",
        description: "Não foi possível consultar o site da companhia.",
        variant: "destructive",
      });
    } finally {
      setTrackingAwb(null);
    }
  };

  const handleAddToDatabase = async (awb: AWBData) => {
    setAddingToDb(awb.id);

    try {
      const { data, error } = await supabase.functions.invoke("add-awb-to-status", {
        body: {
          mawb: awb.awb,
          last_event: awb.last_event || "N/A",
          consignee_name: awb.consignee_name || "N/A",
          airline_code: awb.airline_code,
          hawb: awb.hawb || "N/A",
          nome_analista: awb.nome_analista || "N/A",
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Sucesso",
          description: "AWB adicionado ao banco de dados.",
        });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Error adding AWB to database:", error);
      toast({
        title: "Erro ao adicionar",
        description: "Não foi possível adicionar o AWB ao banco de dados.",
        variant: "destructive",
      });
    } finally {
      setAddingToDb(null);
    }
  };

  const formatAWB = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 8) return cleaned;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 11)}`;
  };

  const abbreviateName = (name: string): string => {
    if (!name || name === "-") return "-";

    // Limita a 20 caracteres e adiciona reticências se necessário
    if (name.length > 20) {
      return name.substring(0, 20) + "...";
    }
    return name;
  };

  const getStatusFromEvent = (lastEvent: string): string => {
    if (!lastEvent) return "-";

    const eventLower = lastEvent.toLowerCase();

    // Extract status code (first 3 letters, with or without parentheses)
    const codeMatch = lastEvent.match(/^\(?([A-Z]{3})\)?/);
    if (codeMatch) {
      const code = codeMatch[1];
      const statusMap: Record<string, string> = {
        BKD: "Reserva confirmada",
        FOH: "Carga recebida pela cia aérea",
        MAN: "Carga manifestada",
        DEP: "Partida confirmada",
        ARR: "Chegou na conexão",
        RCF: "Carga recebida pela cia aérea",
        DLV: "Chegou em seu destino final",
        NFD: "Agente notificado",
      };
      return statusMap[code] || "-";
    }

    // Check for written-out status keywords
    if (eventLower.includes("delivered")) return "Chegou em seu destino final";
    if (eventLower.includes("departed")) return "Partida confirmada";
    if (eventLower.includes("arrived")) return "Chegou na conexão";
    if (eventLower.includes("manifested")) return "Carga manifestada";
    if (eventLower.includes("booking")) return "Reserva confirmada";
    if (eventLower.includes("received from flight")) return "Carga recebida pela cia aérea";
    if (eventLower.includes("freight on hand")) return "Carga recebida pela cia aérea";

    return "-";
  };

  // Get unique analysts from data
  const uniqueAnalysts = React.useMemo(() => {
    const analysts = new Set<string>();
    statusAereoData.forEach((awb) => {
      if (awb.nome_analista && awb.nome_analista !== "-") {
        analysts.add(awb.nome_analista);
      }
    });
    return Array.from(analysts).sort();
  }, [statusAereoData]);

  // Handle column sorting
  const handleAnalystSort = () => {
    setSortAwb(null);
    setSortClient(null);
    setSortLastCheck(null);
    if (sortAnalyst === null) {
      setSortAnalyst("asc");
    } else if (sortAnalyst === "asc") {
      setSortAnalyst("desc");
    } else {
      setSortAnalyst(null);
    }
  };

  const handleAwbSort = () => {
    setSortAnalyst(null);
    setSortClient(null);
    setSortLastCheck(null);
    if (sortAwb === null) {
      setSortAwb("asc");
    } else if (sortAwb === "asc") {
      setSortAwb("desc");
    } else {
      setSortAwb(null);
    }
  };

  const handleClientSort = () => {
    setSortAnalyst(null);
    setSortAwb(null);
    setSortLastCheck(null);
    if (sortClient === null) {
      setSortClient("asc");
    } else if (sortClient === "asc") {
      setSortClient("desc");
    } else {
      setSortClient(null);
    }
  };

  const handleLastCheckSort = () => {
    setSortAnalyst(null);
    setSortAwb(null);
    setSortClient(null);
    if (sortLastCheck === null) {
      setSortLastCheck("asc");
    } else if (sortLastCheck === "asc") {
      setSortLastCheck("desc");
    } else {
      setSortLastCheck(null);
    }
  };

  // Always use data from t_status_aereo
  const filteredAwbs = React.useMemo(() => {
    // Separate COMPANY_NOT_REGISTERED AWBs to append at the end
    const companyNotRegisteredAwbs: AWBData[] = [];
    
    let awbs = statusAereoData.filter((awb) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        awb.awb.toLowerCase().includes(searchLower) ||
        (awb.hawb && awb.hawb.toLowerCase().includes(searchLower)) ||
        (awb.consignee_name && awb.consignee_name.toLowerCase().includes(searchLower)) ||
        (awb.airline_code && awb.airline_code.toLowerCase().includes(searchLower)) ||
        (awb.nome_analista && awb.nome_analista.toLowerCase().includes(searchLower));
      const matchesAirline = filterAirline === "all" || awb.airline_code === filterAirline;
      const matchesAnalyst = filterAnalyst === "all" || awb.nome_analista === filterAnalyst;
      const matchesService = filterService === "all" || awb.tipo_servico === filterService;

      // Only show AWBs with these specific status codes
      const allowedStatuses = [
        "BKD", "BKF", "AWB", "RCS", "MAN", "DEP", "FOH", "TFD", 
        "RCT", "RCP", "PRE", "LOF", "ARRT", "TDE", "ARR", "RCF",
        // Status de alerta e críticos
        "DIS", "OFLD", "NIL", "NIF",
        // Status de erro no rastreio (inclui companhias sem integração e AWBs inválidos)
        "ERRO", "COMPANY_NOT_REGISTERED", "AWB_INVALID",
        // Outros status de rastreio
        "FFM", "AUD"
      ];
      const statusToCheck = (awb.status || "").toUpperCase();
      const lastEventCode = getStatusCode(awb.last_event).toUpperCase();
      
      // Check if status or last event code is in allowed list
      const isAllowed = allowedStatuses.includes(statusToCheck) || allowedStatuses.includes(lastEventCode);

      // AWBs com status ARR (chegaram) - permanecem na tabela por 48h para segurança
      const hasAlert = awb.data_atraso !== null || ["DIS", "OFLD", "NIL", "NIF"].includes(lastEventCode);
      
      // Se está em ARR:
      // - Se tem alerta, mantém na tabela
      // - Se não tem alerta, verifica se já passaram 48h desde arr_datetime
      if (lastEventCode === "ARR" && !hasAlert) {
        // Verificar se arr_datetime existe e se já passaram 48h
        const arrDatetime = (awb as any).arr_datetime;
        if (arrDatetime) {
          const arrTime = new Date(arrDatetime).getTime();
          const now = Date.now();
          const hoursElapsed = (now - arrTime) / (1000 * 60 * 60);
          // Só remove da tabela após 48h em ARR sem alertas
          if (hoursElapsed >= ARR_RETENTION_HOURS) {
            return false;
          }
        }
        // Se não tem arr_datetime ou ainda não passaram 48h, mantém na tabela
      }

      return matchesSearch && matchesAirline && matchesAnalyst && matchesService && isAllowed;
    });

    // Filtrar AWBs excluídos manualmente
    awbs = awbs.filter((awb) => !EXCLUDED_AWBS.includes(awb.awb));

    // Apply card filter (don't include COMPANY_NOT_REGISTERED in filtered results)
    if (cardFilter !== "all") {
      awbs = awbs.filter((awb) => {
        const status = getStatusCode(awb.last_event).toUpperCase();
        switch (cardFilter) {
          case "transito":
            return ["DEP", "MAN", "RCF", "ARR", "TRA", "FOH"].includes(status);
          case "alerta":
            // OFLD movido para críticos - DIS ou processos com data_atraso em alerta
            return status === "DIS" || !!awb.data_atraso;
          case "criticos":
            // OFLD agora é crítico junto com NIL e NIF, e AWBs críticos específicos
            const CRITICAL_AWBS = ["045-21167274"];
            return status === "NIL" || status === "NIF" || status === "OFLD" || CRITICAL_AWBS.includes(awb.awb);
          default:
            return true;
        }
      });
    }

    // Helper function to determine status priority for smart sorting
    // 1 = Success (tracking working), 2 = Invalid AWB, 3 = Query failure
    const getStatusPriority = (awb: AWBData): number => {
      const status = (awb.status || "").toUpperCase();
      const lastEvent = (awb.last_event || "").toUpperCase(); // Raw value from database
      const lastEventCode = getStatusCode(awb.last_event).toUpperCase(); // Translated value for display
      
      // Success statuses (tracking working) - priority 1 (first)
      const successStatuses = ["BKD", "BKF", "AWB", "RCS", "MAN", "DEP", "FOH", "TFD", 
        "RCT", "RCP", "PRE", "LOF", "ARRT", "TDE", "ARR", "RCF", "DLV", "FFM", "AUD",
        "DIS", "OFLD", "NIL", "NIF"];
      if (successStatuses.includes(status) || successStatuses.includes(lastEvent) || successStatuses.includes(lastEventCode)) {
        return 1;
      }
      
      // Invalid AWB - priority 2 (check both raw and translated values)
      if (status === "AWB_INVALID" || lastEvent === "AWB_INVALID" || 
          lastEventCode === "AWB INVÁLIDO" ||
          status === "NOT_FOUND" || lastEvent === "NOT_FOUND" ||
          lastEventCode === "STATUS NÃO ENCONTRADO") {
        return 2;
      }
      
      // Query failure (ERRO, COMPANY_NOT_REGISTERED, etc) - priority 3 (last)
      if (status === "ERRO" || lastEvent === "ERRO" || 
          status === "COMPANY_NOT_REGISTERED" || lastEvent === "COMPANY_NOT_REGISTERED" ||
          lastEventCode === "FALHA NA CONSULTA") {
        return 3;
      }
      
      return 2; // Default: middle
    };

    // Apply user sorting if active, otherwise use smart default sorting
    if (sortAnalyst !== null) {
      awbs = [...awbs].sort((a, b) => {
        const nameA = a.nome_analista || "";
        const nameB = b.nome_analista || "";
        const comparison = nameA.localeCompare(nameB);
        return sortAnalyst === "asc" ? comparison : -comparison;
      });
    } else if (sortAwb !== null) {
      awbs = [...awbs].sort((a, b) => {
        const awbA = a.awb || "";
        const awbB = b.awb || "";
        const comparison = awbA.localeCompare(awbB);
        return sortAwb === "asc" ? comparison : -comparison;
      });
    } else if (sortClient !== null) {
      awbs = [...awbs].sort((a, b) => {
        const clientA = a.consignee_name || "";
        const clientB = b.consignee_name || "";
        const comparison = clientA.localeCompare(clientB);
        return sortClient === "asc" ? comparison : -comparison;
      });
    } else if (sortLastCheck !== null) {
      awbs = [...awbs].sort((a, b) => {
        const dateA = a.last_check ? new Date(a.last_check).getTime() : 0;
        const dateB = b.last_check ? new Date(b.last_check).getTime() : 0;
        const comparison = dateA - dateB;
        return sortLastCheck === "asc" ? comparison : -comparison;
      });
    } else {
      // Smart default sorting: success first, then invalid, then failures
      // Within each group, sort by last_check (most recent first)
      awbs = [...awbs].sort((a, b) => {
        const priorityA = getStatusPriority(a);
        const priorityB = getStatusPriority(b);
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB; // Lower priority number first (success = 1)
        }
        
        // Same priority: sort by last_check (most recent first)
        const dateA = a.last_check ? new Date(a.last_check).getTime() : 0;
        const dateB = b.last_check ? new Date(b.last_check).getTime() : 0;
        return dateB - dateA;
      });
    }

    // Append COMPANY_NOT_REGISTERED AWBs at the end (only when no card filter is active)
    if (cardFilter === "all") {
      awbs = [...awbs, ...companyNotRegisteredAwbs];
    }

    return awbs;
  }, [statusAereoData, searchTerm, filterAirline, filterAnalyst, filterService, cardFilter, sortAnalyst, sortAwb, sortClient, sortLastCheck]);

  const totalPages = Math.ceil(filteredAwbs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentAwbs = filteredAwbs.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Carregando...</p>
      </div>
    );
  }


  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
          }}
        />
        
        {/* Radial gradient overlay */}
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `
          }}
        />
        
        {/* Animated Lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => (
            <div
              key={`line-${i}`}
              className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10"
              style={{
                left: `${15 + i * 14}%`,
                transform: `skewX(${-20 + i * 8}deg)`,
              }}
            />
          ))}
        </div>

        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={`particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">
              Intelligent Logistics – Rastreio de AWBs
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - DB Stats + User */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <DatabaseStatsPanel stats={dbStats} isLoading={isLoadingDbStats} onRefresh={fetchDbStats} />
          <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
            @{user?.email?.split("@")[0] || "admin"}
          </div>
          <button
            onClick={() => setRegrasDialogOpen(true)}
            className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
            title="Regras de notificação"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate("/air/tracking/manual")}
            className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
            title="Manual do usuário"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <div
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]"
            title="Rastreio de AWBs"
          >
            <Plane className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">

        {/* Dashboard Cards */}
        <DashboardCards
          totalMonitorados={statusAereoData.filter((awb) => {
            const excludedStatuses = ["COMPANY_NOT_REGISTERED", "ERRO", "INFO", "Em Processamento", "NOT_FOUND", "DLV"];
            return !excludedStatuses.includes(awb.status || "");
          }).length}
          emTransito={statusAereoData.filter((awb) => {
            const excludedStatuses = ["COMPANY_NOT_REGISTERED", "ERRO", "INFO", "Em Processamento", "NOT_FOUND", "DLV"];
            if (excludedStatuses.includes(awb.status || "")) return false;
            const status = getStatusCode(awb.last_event).toUpperCase();
            return ["DEP", "MAN", "RCF", "ARR", "TRA", "FOH"].includes(status);
          }).length}
          emAlerta={statusAereoData.filter((awb) => {
            const excludedStatuses = ["COMPANY_NOT_REGISTERED", "ERRO", "INFO", "Em Processamento", "NOT_FOUND", "DLV"];
            if (excludedStatuses.includes(awb.status || "")) return false;
            const status = getStatusCode(awb.last_event).toUpperCase();
            // OFLD movido para críticos - DIS ou processos com data_atraso em alerta
            return status === "DIS" || !!awb.data_atraso;
          }).length}
          criticos={statusAereoData.filter((awb) => {
            const excludedStatuses = ["COMPANY_NOT_REGISTERED", "ERRO", "INFO", "Em Processamento", "NOT_FOUND", "DLV"];
            if (excludedStatuses.includes(awb.status || "")) return false;
            const status = getStatusCode(awb.last_event).toUpperCase();
            // OFLD agora é crítico junto com NIL e NIF, e AWBs críticos específicos
            const CRITICAL_AWBS = ["045-21167274"];
            return status === "NIL" || status === "NIF" || status === "OFLD" || CRITICAL_AWBS.includes(awb.awb);
          }).length}
          activeFilter={cardFilter}
          onFilterChange={(filter) => {
            setCardFilter(filter);
            setCurrentPage(1);
          }}
        />


        {/* Search and Filter Bar */}
        <section 
          className="rounded-2xl p-4"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#aaaaaa]" />
              <input
                type="text"
                placeholder="Buscar por AWB, Consignee ou e-mail"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 w-full pl-10 pr-4 rounded-full border border-[rgba(255,255,255,.14)] bg-[#13141a] text-[#f5f5f5] text-[0.78rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,.8)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <FilterIcon className="h-3 w-3 text-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Companhia</span>
                  </div>
                  <Select value={filterAirline} onValueChange={setFilterAirline}>
                    <SelectTrigger className="h-8 w-[160px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todas</SelectItem>
                      {airlines.map((airline) => (
                        <SelectItem key={airline.code} value={airline.code}>
                          {airline.code} - {airline.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Analista</span>
                  </div>
                  <Select value={filterAnalyst} onValueChange={setFilterAnalyst}>
                    <SelectTrigger className="h-8 w-[160px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {Array.from(
                        new Set(
                          statusAereoData
                            .map((awb) => awb.nome_analista)
                            .filter((name) => name && name !== "N/A" && name.trim() !== ""),
                        ),
                      )
                        .sort()
                        .map((analyst) => (
                          <SelectItem key={analyst} value={analyst}>
                            {analyst}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <Plane className="h-3 w-3 text-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Serviço</span>
                  </div>
                  <Select value={filterService} onValueChange={setFilterService}>
                    <SelectTrigger className="h-8 w-[160px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {Array.from(
                        new Set(
                          statusAereoData
                            .map((awb) => awb.tipo_servico)
                            .filter((service) => service && service !== "N/A" && service.trim() !== ""),
                        ),
                      )
                        .sort()
                        .map((service) => (
                          <SelectItem key={service} value={service}>
                            {service}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Botão para ver companhias pendentes de cadastro */}
                {(() => {
                  const pendingAirlineCodes = ["399"]; // CIAs realmente não cadastradas (apenas Marine Air)
                  const pendingAwbs = statusAereoData.filter(awb => {
                    const code = (awb.airline_code || "").replace(/^0+/, "").padStart(3, "0");
                    return pendingAirlineCodes.includes(code);
                  });
                  const uniqueAirlines = new Set(pendingAwbs.map(awb => awb.airline_code)).size;
                  return uniqueAirlines > 0 && (
                    <button
                      onClick={() => setShowUnregisteredModal(true)}
                      className="h-8 px-4 rounded-full bg-slate-600/80 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-slate-500/80 transition border border-slate-500/50"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      Cias Pendentes ({uniqueAirlines})
                    </button>
                  );
                })()}

                {/* Botão para ver companhias monitoradas */}
                <button
                  onClick={() => setShowMonitoredModal(true)}
                  className="h-8 px-4 rounded-full bg-emerald-600/80 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-emerald-500/80 transition border border-emerald-500/50"
                >
                  <Plane className="w-3.5 h-3.5" />
                  CIAs Monitoradas ({monitoredAirlinesData.totalAirlines})
                </button>

                <button
                  onClick={handleRefresh}
                  className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Atualizar
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* AWBs Table */}
        <section 
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
          {filteredAwbs.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[rgba(0,0,0,.4)] border-b border-[rgba(255,255,255,.08)]">
                      <th
                        className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition"
                        onClick={handleAwbSort}
                      >
                        <span className="flex items-center gap-1">
                          AWB
                          {sortAwb === "asc" && <span className="text-[#ffc800]">↑</span>}
                          {sortAwb === "desc" && <span className="text-[#ffc800]">↓</span>}
                        </span>
                      </th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">HAWB</th>
                      <th
                        className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition"
                        onClick={handleClientSort}
                      >
                        <span className="flex items-center gap-1">
                          Cliente
                          {sortClient === "asc" && <span className="text-[#ffc800]">↑</span>}
                          {sortClient === "desc" && <span className="text-[#ffc800]">↓</span>}
                        </span>
                      </th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Rota</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Rastreio</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Último Evento</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Data/Hora</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Situação</th>
                      <th
                        className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition"
                        onClick={handleAnalystSort}
                      >
                        <span className="flex items-center gap-1">
                          Nome Analista
                          {sortAnalyst === "asc" && <span className="text-[#ffc800]">↑</span>}
                          {sortAnalyst === "desc" && <span className="text-[#ffc800]">↓</span>}
                        </span>
                      </th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Serviço</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAwbs.map((awb: AWBData, index: number) => {
                      const status = getStatusFromEvent(awb.last_event);
                      const isDelivered = status === "Chegou em seu destino final";
                      const isRetracking = retrackingAwbs.has(awb.awb);
                      const isNilStatus = awb.last_event === "NIL" || awb.last_event === "NIF";
                      const isErroStatus = awb.status === "ERRO" || awb.last_event === "ERRO";
                      const isCompanyNotRegistered = awb.status === "COMPANY_NOT_REGISTERED";
                      const isAwbInvalid = awb.status === "AWB_INVALID" || awb.last_event === "AWB_INVALID";
                      const isFalhaConsulta = isErroStatus || isCompanyNotRegistered;
                      // AWBs críticos específicos com destaque vermelho piscante
                      const CRITICAL_AWBS = ["045-21167274"];
                      const isCriticalAwb = CRITICAL_AWBS.includes(awb.awb);

                      return (
                        <React.Fragment key={awb.id || index}>
                          <tr
                            className={`border-b border-[rgba(255,255,255,.06)] transition-all duration-300 ${
                              isCriticalAwb
                                ? "bg-red-500/15 border-red-400/50 border-2 animate-pulse shadow-[0_0_15px_rgba(255,0,0,0.2)]"
                                : isCompanyNotRegistered
                                ? "bg-slate-500/10 border-l-4 border-l-slate-400/50 opacity-70"
                                : isErroStatus
                                ? "bg-orange-500/20 border-l-4 border-l-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)]"
                                : isNilStatus
                                ? "bg-red-500/20 border-red-500 border-2 animate-pulse shadow-[0_0_20px_rgba(255,0,0,0.3)]"
                                : "hover:bg-[rgba(255,255,255,.03)]"
                            } ${isDelivered && !isNilStatus && !isErroStatus && !isCompanyNotRegistered && !isCriticalAwb ? "bg-emerald-500/10" : ""} ${
                              isRetracking && !isNilStatus && !isErroStatus && !isCompanyNotRegistered && !isCriticalAwb ? "bg-blue-500/20 animate-pulse" : ""
                            }`}
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[#f5f5f5] text-[0.82rem]">{awb.awb}</span>
                                {isRetracking && (
                                  <span className="text-[0.68rem] text-blue-400 animate-pulse">Re-processando...</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#aaaaaa] text-[0.8rem] whitespace-nowrap">{awb.hawb || "-"}</td>
                            <td className="px-4 py-3">
                              <div className="text-[#f5f5f5] text-[0.8rem] uppercase">
                                {abbreviateName(awb.consignee_name)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#aaaaaa] text-[0.8rem]">
                              <span className="text-[#ffc800]">{awb.origem || "N/A"}</span>
                              <span className="mx-1">→</span>
                              <span>{awb.destino || "N/A"}</span>
                            </td>
                            <td className="px-4 py-3 min-w-[300px]">
                              {(() => {
                                const statusCode = getStatusCode(awb.last_event).toUpperCase();
                                // Use data_atraso from DB (persists even after status changes) or check current status
                                const isAlertStatus =
                                  awb.data_atraso !== null || statusCode === "DIS" || statusCode === "OFLD";
                                const progressGradient = isAlertStatus
                                  ? "linear-gradient(90deg, hsl(0 84% 60%), hsl(0 84% 70%))"
                                  : "linear-gradient(90deg, hsl(39 100% 50%), hsl(39 100% 60%))";
                                const progressShadow = isAlertStatus
                                  ? "0 0 12px rgba(239, 68, 68, 0.6)"
                                  : "0 0 12px rgba(255, 165, 0, 0.4)";
                                const dotColor = isAlertStatus ? "bg-red-400" : "bg-white/90";
                                const dotColorMuted = isAlertStatus ? "bg-red-400/70" : "bg-white/70";
                                const planeColor = isAlertStatus ? "rgb(239, 68, 68)" : "rgb(255, 165, 0)";
                                const shadowColor = isAlertStatus ? "rgba(239, 68, 68, 1)" : "rgba(255, 165, 0, 1)";
                                const bgBarColor = isAlertStatus ? "bg-red-900/30" : "bg-gray-800/50";

                                return (
                                  <div
                                    className={`relative h-1.5 w-full flex items-center ${isAlertStatus ? "animate-pulse" : ""}`}
                                  >
                                    {/* Barra de fundo */}
                                    <div className={`absolute inset-0 ${bgBarColor} rounded-full`} />

                                    {/* Barra de progresso */}
                                    <div
                                      className="absolute left-0 h-full rounded-l-full transition-all duration-700 ease-out"
                                      style={{
                                        width: `${isCompanyNotRegistered ? 0 : getTimelineProgress(awb.last_event)}%`,
                                        background: progressGradient,
                                        borderTopRightRadius:
                                          getTimelineProgress(awb.last_event) === 100 ? "9999px" : "0",
                                        borderBottomRightRadius:
                                          getTimelineProgress(awb.last_event) === 100 ? "9999px" : "0",
                                        boxShadow: progressShadow,
                                      }}
                                    />

                                    {/* Pontos da régua: BKD → RCF → MAN → DEP → ARR */}
                                    <TooltipProvider>
                                      {/* BKD - 0% */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={`absolute left-0 w-1.5 h-1.5 rounded-full ${dotColor} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">BKD - Reserva Confirmada</p>
                                        </TooltipContent>
                                      </Tooltip>

                                      {/* RCF - 25% */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={`absolute left-1/4 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dotColorMuted} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">RCF - Recebida pela Cia Aérea</p>
                                        </TooltipContent>
                                      </Tooltip>

                                      {/* MAN - 50% */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={`absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dotColorMuted} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">MAN - Manifestada</p>
                                        </TooltipContent>
                                      </Tooltip>

                                      {/* DEP - 75% */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={`absolute left-3/4 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dotColorMuted} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">DEP - Partida Confirmada</p>
                                        </TooltipContent>
                                      </Tooltip>

                                      {/* ARR - 100% */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={`absolute right-0 w-1.5 h-1.5 rounded-full ${dotColor} shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform`}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">ARR - Chegada no Destino</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>

                                    {/* Ícone de avião minimalista na posição do progresso com tooltip */}
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 ease-out z-20 cursor-pointer"
                                            style={{ left: `${isCompanyNotRegistered ? 0 : getTimelineProgress(awb.last_event)}%` }}
                                          >
                                            <div className="relative">
                                              <Plane
                                                className="w-4 h-4"
                                                style={{
                                                  transform: "rotate(90deg)",
                                                  color: planeColor,
                                                  fill: planeColor,
                                                  filter: `drop-shadow(0 0 4px ${shadowColor}) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))`,
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs font-medium">{getStatusCode(awb.last_event)}</p>
                                          <p className="text-xs text-muted-foreground">{getStatusFromEvent(awb.last_event)}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold" style={{ color: "hsl(120 100% 35%)" }}>
                                  {getStatusCode(awb.last_event)}
                                </span>
                                {['083', '147', '160', '615', '865', '016'].some(prefix => awb.awb?.startsWith(prefix)) && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-amber-400 cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p>Essa companhia está passando por ajustes, podendo apresentar inconsistência.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[#aaaaaa] text-sm whitespace-nowrap">
                              {formatDateTimeBR(awb.last_check || awb.created_at)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {(() => {
                                // Situação vazia para falhas de consulta e AWB inválido
                                if (isFalhaConsulta || isAwbInvalid) {
                                  return <span className="text-muted-foreground">—</span>;
                                }
                                const statusCode = getStatusCode(awb.last_event).toUpperCase();
                                // Verificar se é crítico (NIL, NIF, OFLD ou AWBs críticos específicos)
                                const CRITICAL_AWBS = ["045-21167274"];
                                const isCritical = statusCode === "NIL" || statusCode === "NIF" || statusCode === "OFLD" || CRITICAL_AWBS.includes(awb.awb);
                                const isDelayed = awb.data_atraso !== null || statusCode === "DIS";
                                
                                if (isCritical) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/50 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                      Crítico
                                    </span>
                                  );
                                }
                                
                                return isDelayed ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                    Em Atraso
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                                    No Prazo
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-3 text-[#aaaaaa] text-sm uppercase">{awb.nome_analista || "-"}</td>
                            <td className="px-3 py-3 text-[#aaaaaa] text-sm">{awb.tipo_servico || "N/A"}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {/* Botão Ver Timeline */}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setTimelineModal({ open: true, awb: awb.awb, consigneeName: awb.consignee_name })}
                                        className="text-[#ffc800] hover:text-[#ffc800] hover:bg-[#ffc800]/10 h-8 w-8 p-0"
                                      >
                                        <Clock className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Ver Timeline</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {/* Botão Abrir Rastreio Externo */}
                                {(() => {
                                  const trackingUrl = getTrackingUrl(awb.airline_code, awb.awb);
                                  return trackingUrl ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => window.open(trackingUrl, "_blank")}
                                            className="text-foreground hover:text-primary h-8 w-8 p-0"
                                          >
                                            <ExternalLink className="w-4 h-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Abrir Rastreio Externo</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : null;
                                })()}
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
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
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  showFirstLast={false}
                />
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <p className="text-[#f5f5f5] uppercase tracking-[0.15em] font-medium">NENHUM AWB MONITORADO</p>
              <p className="text-[0.85rem] text-[#aaaaaa] mt-2">
                Os dados serão carregados automaticamente do banco de dados
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Modal de Companhias Não Cadastradas */}
      <Dialog open={showUnregisteredModal} onOpenChange={setShowUnregisteredModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <DialogHeader>
            <DialogTitle className="text-[#f5f5f5] flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-slate-400" />
              Companhias Aéreas Não Cadastradas
            </DialogTitle>
            <DialogDescription className="text-[#aaaaaa]">
              AWBs com companhias que ainda não possuem integração no sistema
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh] mt-4">
            {(() => {
              const pendingAirlineNames: Record<string, string> = {
                "399": "Marine Air",
              };
              const pendingAirlineCodes = Object.keys(pendingAirlineNames);
              
              const pendingAwbs = statusAereoData.filter(awb => {
                const code = (awb.airline_code || "").replace(/^0+/, "").padStart(3, "0");
                return pendingAirlineCodes.includes(code);
              });
              
              const groupedByAirline = pendingAwbs.reduce((acc, awb) => {
                const code = (awb.airline_code || "").replace(/^0+/, "").padStart(3, "0");
                if (!acc[code]) acc[code] = { count: 0, name: pendingAirlineNames[code] || `Código ${code}` };
                acc[code].count++;
                return acc;
              }, {} as Record<string, { count: number; name: string }>);
              
              const sortedAirlines = Object.entries(groupedByAirline).sort((a, b) => b[1].count - a[1].count);
              
              if (sortedAirlines.length === 0) {
                return (
                  <div className="text-center py-8 text-[#aaaaaa]">
                    Nenhuma companhia pendente de cadastro
                  </div>
                );
              }
              
              return (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-[rgba(0,0,0,.8)]">
                    <tr className="border-b border-[rgba(255,255,255,.08)]">
                      <th className="px-3 py-2 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Companhia Aérea</th>
                      <th className="px-3 py-2 text-right text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Qtd AWBs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAirlines.map(([code, data]) => (
                      <tr key={code} className="border-b border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.03)]">
                        <td className="px-3 py-2.5 text-[#f5f5f5] text-sm">
                          <span className="text-[#888] font-mono mr-2">{code}</span>
                          {data.name}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-slate-600/60 text-[#f5f5f5] text-sm font-medium">
                            {data.count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,.08)] text-[0.75rem] text-[#666]">
            * Para adicionar suporte a uma companhia, entre em contato com a equipe de desenvolvimento
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Companhias Monitoradas */}
      <Dialog open={showMonitoredModal} onOpenChange={setShowMonitoredModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <DialogHeader>
            <DialogTitle className="text-[#f5f5f5] flex items-center gap-2">
              <Plane className="w-5 h-5 text-emerald-400" />
              Companhias Aéreas Monitoradas
            </DialogTitle>
            <DialogDescription className="text-[#aaaaaa]">
              {monitoredAirlinesData.totalAirlines} companhias aéreas com integração ativa no sistema de rastreamento
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
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-emerald-400 text-sm">{airline.code}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[#f5f5f5] text-sm">{airline.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,.08)] text-[0.75rem] text-[#aaa] text-center">
            {monitoredAirlinesData.totalAirlines} companhias integradas
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion Popup - Fixed class for RPA */}
      {showCompletionPopup && (
        <div
          className="rpa-completion-popup fixed bottom-4 right-4 bg-card border border-border rounded-lg shadow-lg p-4 z-50 animate-in slide-in-from-right"
          style={{ minWidth: "300px" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-sm font-medium text-foreground">Processamento concluído</p>
            </div>
            <button
              onClick={() => setShowCompletionPopup(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{new Date().toLocaleString("pt-BR")}</p>
        </div>
      )}

      <EmailClienteRegrasDialog 
        open={regrasDialogOpen} 
        onOpenChange={setRegrasDialogOpen} 
      />

      {/* Modal de Timeline por AWB */}
      <AwbTimelineModal
        open={timelineModal.open}
        onOpenChange={(open) => setTimelineModal((prev) => ({ ...prev, open }))}
        awb={timelineModal.awb}
        consigneeName={timelineModal.consigneeName}
      />
    </div>
  );
};

export default Index;
