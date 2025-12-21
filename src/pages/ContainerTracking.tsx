import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUsageLog } from "@/hooks/useUsageLog";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search,
  Plus,
  RefreshCw,
  Ship,
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
  Anchor,
  AlertTriangle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { User, Session } from "@supabase/supabase-js";
import dachserBg from "@/assets/dachser-background.jpg";
import { TablePagination } from "@/components/layout/TablePagination";
import { Filter as FilterIcon } from "lucide-react";

// Shipping lines - only 6 approved carriers
const shippingLines = [
  { code: "HLCU", name: "HAPAG-LLOYD" },
  { code: "CMAU", name: "CMA" },
  { code: "HDMU", name: "HMM" },
  { code: "ONEY", name: "ONE" },
  { code: "MSCU", name: "MSC" },
  { code: "MAEU", name: "MAERSK" },
];

// Container prefix to shipping line mapping (primeiros 4 caracteres do container)
const CONTAINER_PREFIX_MAP: Record<string, string> = {
  // MAERSK
  "MAEU": "MAERSK", "MSKU": "MAERSK", "MRKU": "MAERSK", "MRSU": "MAERSK",
  // HAPAG-LLOYD
  "HLCU": "HAPAG-LLOYD", "HLXU": "HAPAG-LLOYD", "HJCU": "HAPAG-LLOYD",
  // CMA CGM
  "CMAU": "CMA", "CGMU": "CMA", "APLU": "CMA", "ANLU": "CMA", "ECMU": "CMA",
  // MSC
  "MSCU": "MSC", "MEDU": "MSC", "MSCZ": "MSC",
  // ONE
  "ONEY": "ONE", "NYKU": "ONE", "MOLU": "ONE", "KSTU": "ONE",
  // HMM
  "HDMU": "HMM", "HMMU": "HMM",
  // COSCO
  "CSLU": "COSCO", "CCLU": "COSCO", "COSU": "COSCO", "CBHU": "COSCO",
  // EVERGREEN
  "EGHU": "EVERGREEN", "EMCU": "EVERGREEN", "EISU": "EVERGREEN", "EGLV": "EVERGREEN",
  // YANG MING
  "YMLU": "YANG MING", "YMMU": "YANG MING",
  // ZIM
  "ZIMU": "ZIM", "ZCSU": "ZIM",
  // PIL
  "PCIU": "PIL",
  // WAN HAI
  "WHLU": "WAN HAI",
  // HAMBURG SUD (agora Maersk)
  "SUDU": "MAERSK",
  // Outros comuns (lessors)
  "TRHU": "TRITON", "TCLU": "TEXTAINER", "TEMU": "TOUAX", "GESU": "GESEACO",
  "FCIU": "FLORENS", "CAIU": "CAI", "SEGU": "SEACO", "TCKU": "TRITON",
};

// Detect armador from vessel name AND container prefix
const detectArmadorFromVessel = (vessel: string | null | undefined, container?: string | null): string => {
  // First try to detect from container prefix (most reliable)
  if (container) {
    const prefix = container.trim().substring(0, 4).toUpperCase();
    if (CONTAINER_PREFIX_MAP[prefix]) {
      return CONTAINER_PREFIX_MAP[prefix];
    }
  }

  // Then try to detect from vessel name
  if (vessel) {
    const upperVessel = vessel.toUpperCase();
    
    // MAERSK patterns
    if (upperVessel.includes("MAERSK") || upperVessel.includes("MAEU") || 
        upperVessel.includes("SEALAND") || upperVessel.includes("SAFMARINE")) {
      return "MAERSK";
    }
    // HAPAG-LLOYD patterns
    if (upperVessel.includes("HAPAG") || upperVessel.includes("LLOYD") || 
        upperVessel.includes("HAMBURG") || upperVessel.includes("HLCU")) {
      return "HAPAG-LLOYD";
    }
    // CMA CGM patterns
    if (upperVessel.includes("CMA") || upperVessel.includes("CGM") || 
        upperVessel.includes("APL") || upperVessel.includes("ANL")) {
      return "CMA";
    }
    // HMM patterns
    if (upperVessel.includes("HMM") || upperVessel.includes("HYUNDAI")) {
      return "HMM";
    }
    // ONE patterns
    if (upperVessel.includes("ONE ") || upperVessel.startsWith("ONE") ||
        upperVessel.includes("OCEAN NETWORK")) {
      return "ONE";
    }
    // MSC patterns
    if (upperVessel.includes("MSC")) {
      return "MSC";
    }
    // COSCO patterns
    if (upperVessel.includes("COSCO") || upperVessel.includes("OOCL")) {
      return "COSCO";
    }
    // EVERGREEN patterns
    if (upperVessel.includes("EVERGREEN") || upperVessel.includes("EVER ")) {
      return "EVERGREEN";
    }
  }
  
  return "N/D";
};

// ========== REPORT STATUS SYSTEM (12 statuses) ==========
export interface ReportStatus {
  code: string;
  label: string;
  etapa: 'PRE_EMBARQUE' | 'EMBARQUE' | 'TRANSITO' | 'CHEGADA' | 'LIBERACAO' | 'ENTREGA';
  etapaIndex: number; // 0-5 for progress calculation
  color: string;
}

// 12 Report Status definitions
const REPORT_STATUSES: Record<string, ReportStatus> = {
  BKG: { code: 'BKG', label: 'Booking criado', etapa: 'PRE_EMBARQUE', etapaIndex: 0, color: '#94a3b8' },
  CLT: { code: 'CLT', label: 'Coleta da carga', etapa: 'PRE_EMBARQUE', etapaIndex: 0, color: '#a78bfa' },
  GIO: { code: 'GIO', label: 'Gate-in origem', etapa: 'PRE_EMBARQUE', etapaIndex: 0, color: '#818cf8' },
  CRG: { code: 'CRG', label: 'Carregado no navio', etapa: 'EMBARQUE', etapaIndex: 1, color: '#60a5fa' },
  DEP: { code: 'DEP', label: 'Partida do navio', etapa: 'EMBARQUE', etapaIndex: 1, color: '#38bdf8' },
  TSP: { code: 'TSP', label: 'Chegada/Partida em transbordo', etapa: 'TRANSITO', etapaIndex: 2, color: '#f97316' },
  ARR: { code: 'ARR', label: 'Chegada do navio', etapa: 'CHEGADA', etapaIndex: 3, color: '#22d3ee' },
  DCH: { code: 'DCH', label: 'Descarga', etapa: 'CHEGADA', etapaIndex: 3, color: '#2dd4bf' },
  INS: { code: 'INS', label: 'Inspeção/Liberação aduaneira', etapa: 'LIBERACAO', etapaIndex: 4, color: '#fbbf24' },
  GOD: { code: 'GOD', label: 'Gate-out destino', etapa: 'ENTREGA', etapaIndex: 5, color: '#4ade80' },
  DLV: { code: 'DLV', label: 'Entrega final', etapa: 'ENTREGA', etapaIndex: 5, color: '#22c55e' },
  AGD: { code: 'AGD', label: 'Aguardando', etapa: 'PRE_EMBARQUE', etapaIndex: 0, color: '#64748b' },
};

// JSONCargo event to Report Status mapping
const EVENT_TO_REPORT_STATUS: Record<string, string> = {
  // Booking criado (BKG)
  'BOOKED': 'BKG',
  'BOOKING': 'BKG',
  'BOOKING_CONFIRMED': 'BKG',
  'BOOKING_CREATED': 'BKG',
  'PENDING': 'BKG',
  
  // Coleta da carga (CLT)
  'EMPTY_TO_SHIPPER': 'CLT',
  'EMPTY_PICK_UP': 'CLT',
  'GATE_OUT_EMPTY': 'CLT',
  'PICKED_UP': 'CLT',
  'PICKUP': 'CLT',
  
  // Gate-in origem (GIO)
  'GATE_IN_FULL': 'GIO',
  'FULL_IN': 'GIO',
  'RECEIVED': 'GIO',
  'RECEIVED_FOR_EXPORT': 'GIO',
  'RECEIVED_FOR_EXPORT_TRANSFER': 'GIO',
  
  // Carregado no navio (CRG)
  'LOADED': 'CRG',
  'LOAD': 'CRG',
  'LOADED_ON_VESSEL': 'CRG',
  'LOADING': 'CRG',
  
  // Partida do navio (DEP)
  'VESSEL_DEPARTED': 'DEP',
  'DEPARTED': 'DEP',
  'DEPARTURE': 'DEP',
  'VESSEL_DEPARTURE': 'DEP',
  
  // Transbordo (TSP)
  'TRANSSHIPMENT': 'TSP',
  'TRANSSHIPMENT_DISCHARGED': 'TSP',
  'TRANSSHIPMENT_LOADED': 'TSP',
  'IN_TRANSIT': 'TSP',
  'ON_RAIL': 'TSP',
  
  // Chegada do navio (ARR)
  'VESSEL_ARRIVED': 'ARR',
  'ARRIVED': 'ARR',
  'ARRIVAL': 'ARR',
  'VESSEL_ARRIVAL': 'ARR',
  
  // Descarga (DCH)
  'DISCHARGED': 'DCH',
  'DISCHARGE': 'DCH',
  'UNLOADED': 'DCH',
  'OFFLOADED': 'DCH',
  
  // Inspeção/Liberação aduaneira (INS)
  'CUSTOMS_RELEASED': 'INS',
  'CUSTOMS_CLEARED': 'INS',
  'RELEASED': 'INS',
  'CUSTOMS': 'INS',
  'CUSTOMS_HOLD': 'INS',
  'INSPECTION': 'INS',
  'AVAILABLE': 'INS',
  'READY_FOR_PICKUP': 'INS',
  
  // Gate-out destino (GOD)
  'GATE_OUT_FULL': 'GOD',
  'FULL_OUT': 'GOD',
  'OUT_GATE': 'GOD',
  'CONTAINER_TO_CONSIGNEE': 'GOD',
  
  // Entrega final (DLV)
  'DELIVERED': 'DLV',
  'DELIVERY': 'DLV',
  'EMPTY_RETURN': 'DLV',
  'EMPTY_RETURNED': 'DLV',
  'EMPTY_IN_DEPOT': 'DLV',
  'EMPTY_RECEIVED_AT_CY': 'DLV',
};

// Get report status from JSONCargo event
const getReportStatus = (lastEvent: string | null): ReportStatus => {
  if (!lastEvent) return REPORT_STATUSES.AGD;
  
  // Normalize the event: uppercase, remove spaces/underscores/dashes
  const normalizedEvent = lastEvent.toUpperCase().replace(/[\s-]/g, '_');
  
  // Direct match
  if (EVENT_TO_REPORT_STATUS[normalizedEvent]) {
    return REPORT_STATUSES[EVENT_TO_REPORT_STATUS[normalizedEvent]];
  }
  
  // Partial match - check if any key is contained in the event
  for (const [eventKey, statusCode] of Object.entries(EVENT_TO_REPORT_STATUS)) {
    const normalizedKey = eventKey.replace(/_/g, '');
    const cleanEvent = normalizedEvent.replace(/_/g, '');
    if (cleanEvent.includes(normalizedKey) || normalizedKey.includes(cleanEvent)) {
      return REPORT_STATUSES[statusCode];
    }
  }
  
  return REPORT_STATUSES.AGD;
};

// Timeline progress calculation based on etapa (6 stages: 0-100%)
const getTimelineProgress = (lastEvent: string | null): number => {
  const status = getReportStatus(lastEvent);
  // Map etapaIndex (0-5) to progress (0-100%)
  return (status.etapaIndex / 5) * 100;
};

// Get status code (for backwards compatibility)
const getStatusCode = (lastEvent: string | null): string => {
  return getReportStatus(lastEvent).code;
};

// Get human-readable status description
const getStatusDescription = (lastEvent: string | null): string => {
  const status = getReportStatus(lastEvent);
  return status.label;
};

// Timeline stage labels
const TIMELINE_STAGES = [
  { position: 0, label: 'Pré-Embarque', statuses: ['BKG', 'CLT', 'GIO'] },
  { position: 20, label: 'Embarque', statuses: ['CRG', 'DEP'] },
  { position: 40, label: 'Trânsito', statuses: ['TSP'] },
  { position: 60, label: 'Chegada', statuses: ['ARR', 'DCH'] },
  { position: 80, label: 'Liberação', statuses: ['INS'] },
  { position: 100, label: 'Entrega', statuses: ['GOD', 'DLV'] },
];

interface ContainerData {
  id: string;
  container: string;
  bl?: string;
  shipping_line: string;
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
  vessel?: string;
  eta?: string;
}

const ContainerTracking = () => {
  useUsageLog({ endpoint: "/sea/tracking" });
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [containerNumber, setContainerNumber] = useState("");
  const [selectedLine, setSelectedLine] = useState("");
  const [consigneeName, setConsigneeName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLine, setFilterLine] = useState("all");
  
  const [activeCardFilter, setActiveCardFilter] = useState<"all" | "transito" | "alerta" | "entregues">("all");
  const [sortAnalyst, setSortAnalyst] = useState<"asc" | "desc" | null>(null);
  const [sortContainer, setSortContainer] = useState<"asc" | "desc" | null>(null);
  const [sortClient, setSortClient] = useState<"asc" | "desc" | null>(null);
  const [sortLastCheck, setSortLastCheck] = useState<"asc" | "desc" | null>(null);
  const [containersList, setContainersList] = useState<ContainerData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [trackingContainer, setTrackingContainer] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingSeaItems, setIsLoadingSeaItems] = useState(false);
  const { toast } = useToast();

  const itemsPerPage = 10;

  // Helper functions for status categorization based on new 12-status system
  const isEmTransito = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    // Em trânsito: Embarque (CRG, DEP) + Trânsito (TSP) + Chegada (ARR, DCH)
    return ['CRG', 'DEP', 'TSP', 'ARR', 'DCH'].includes(status.code);
  };

  const isEmAlerta = (lastEvent: string | null): boolean => {
    if (!lastEvent) return false;
    const upper = lastEvent.toUpperCase().replace(/[_\s-]/g, "");
    // Alerts remain based on specific keywords
    return upper.includes("DELAYED") || upper.includes("DELAY") ||
           upper.includes("CANCELLED") || upper.includes("CANCEL") ||
           upper.includes("CUSTOMSHOLD") || 
           upper.includes("MISSEDCONNECTION") || upper.includes("MISSED");
  };

  const isEntregue = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    // Entregue: Gate-out destino (GOD) + Entrega final (DLV)
    return ['GOD', 'DLV'].includes(status.code);
  };
  
  const isEmLiberacao = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    return status.code === 'INS';
  };

  // Check admin access from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      if (parsed.is_admin !== 1) {
        navigate("/dashboard");
        return;
      }
    } else {
      navigate("/");
      return;
    }
  }, [navigate]);

  // Check authentication
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

  // Fetch containers from MariaDB via olimpo-proxy
  const fetchContainersData = React.useCallback(async () => {
    setIsLoadingData(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=get_tracked_containers`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
      
      const result = await res.json();
      
      if (result.success && result.data) {
        const mapped = result.data.map((row: any) => ({
          id: String(row.id),
          container: row.container,
          bl: row.bl,
          shipping_line: row.shipping_line || '',
          consignee_name: row.consignee_name || '',
          last_event: row.last_event || 'Aguardando rastreio...',
          status: row.container_status || 'PENDING',
          created_at: row.created_at,
          last_check: row.last_check,
          nome_analista: row.nome_analista,
          email_analista: row.email_analista,
          email_cliente: row.email_cliente,
          origem: row.origem,
          destino: row.destino,
          vessel: row.vessel,
          eta: row.eta,
        }));
        setContainersList(mapped);
      }
    } catch (error) {
      console.error("Error fetching containers:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchContainersData();
  }, [fetchContainersData]);

  // Refresh all containers via JSONCargo API
  const handleRefresh = async () => {
    setIsRefreshing(true);
    toast({
      title: "Atualizando dados",
      description: "Consultando status via JSONCargo API...",
    });
    
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=refresh_all_containers`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
      
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "Dados atualizados",
          description: `${result.updated} containers atualizados${result.errors > 0 ? `, ${result.errors} com erro` : ''}.`,
        });
        await fetchContainersData();
      } else {
        toast({
          title: "Erro ao atualizar",
          description: result.error || "Falha na atualização",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error refreshing:", error);
      toast({
        title: "Erro",
        description: "Falha ao atualizar containers",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load containers from t_dachser_sea_items
  const handleLoadFromSeaItems = async () => {
    setIsLoadingSeaItems(true);
    toast({
      title: "Carregando containers",
      description: "Buscando containers das análises SEA...",
    });
    
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=load_containers_from_sea_items`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
      
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "Containers carregados",
          description: result.message || `${result.added} container(s) adicionado(s)`,
        });
        await fetchContainersData();
      } else {
        toast({
          title: "Erro ao carregar",
          description: result.error || "Falha ao carregar containers",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error loading from sea items:", error);
      toast({
        title: "Erro",
        description: "Falha ao carregar containers das análises SEA",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSeaItems(false);
    }
  };

  // Track single container
  const handleTrackContainer = async (containerId: string, shippingLine: string) => {
    setTrackingContainer(containerId);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=track_container&container=${encodeURIComponent(containerId)}&shipping_line=${encodeURIComponent(shippingLine)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
      
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "Container rastreado",
          description: `Status: ${result.data.container_status || 'N/A'}`,
        });
        await fetchContainersData();
      } else {
        toast({
          title: "Erro no rastreio",
          description: result.error || "Falha ao rastrear container",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error tracking:", error);
    } finally {
      setTrackingContainer(null);
    }
  };

  // Add container to tracking
  const handleAddContainer = async () => {
    if (!containerNumber || !selectedLine || !consigneeName) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos para cadastrar o Container.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=add_tracked_container`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            container: containerNumber.toUpperCase(),
            shipping_line: selectedLine,
            consignee_name: consigneeName,
          })
        }
      );
      
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "Container cadastrado",
          description: "Container adicionado à lista de monitoramento.",
        });
        
        // Track container immediately after adding
        await handleTrackContainer(containerNumber.toUpperCase(), selectedLine);
        
        setContainerNumber("");
        setSelectedLine("");
        setConsigneeName("");
        await fetchContainersData();
      } else {
        toast({
          title: "Erro ao cadastrar",
          description: result.error || "Falha ao cadastrar container",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error adding container:", error);
      toast({
        title: "Erro",
        description: "Falha ao cadastrar container",
        variant: "destructive",
      });
    }
  };

  // Delete container from tracking
  const handleDeleteContainer = async (containerId: string, containerNumber: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=delete_tracked_container`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ container: containerNumber })
        }
      );
      
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "Container removido",
          description: "Container removido da lista de monitoramento.",
        });
        await fetchContainersData();
      }
    } catch (error) {
      console.error("Error deleting container:", error);
    }
  };


  const abbreviateName = (name: string): string => {
    if (!name || name === "-") return "-";
    if (name.length > 20) {
      return name.substring(0, 20) + "...";
    }
    return name;
  };

  const handleAnalystSort = () => {
    setSortContainer(null);
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

  const handleContainerSort = () => {
    setSortAnalyst(null);
    setSortClient(null);
    setSortLastCheck(null);
    if (sortContainer === null) {
      setSortContainer("asc");
    } else if (sortContainer === "asc") {
      setSortContainer("desc");
    } else {
      setSortContainer(null);
    }
  };

  const handleClientSort = () => {
    setSortAnalyst(null);
    setSortContainer(null);
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
    setSortContainer(null);
    setSortClient(null);
    if (sortLastCheck === null) {
      setSortLastCheck("asc");
    } else if (sortLastCheck === "asc") {
      setSortLastCheck("desc");
    } else {
      setSortLastCheck(null);
    }
  };

  // Filter and sort containers
  // Containers excluídos da exibição visual
  const EXCLUDED_CONTAINERS = [
    'TCKU2140363',
    'SEKU5762065',
    'BEAU4076927',
    'ECMU5599537',
    'CMAU8531522',
    'TCNU7706015',
    'TRHU2388168'
  ];

  const filteredContainers = useMemo(() => {
    let containers = containersList.filter((c) => {
      // Excluir containers específicos
      if (EXCLUDED_CONTAINERS.includes(c.container?.trim().toUpperCase())) {
        return false;
      }
      
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        c.container.toLowerCase().includes(searchLower) ||
        (c.bl && c.bl.toLowerCase().includes(searchLower)) ||
        (c.consignee_name && c.consignee_name.toLowerCase().includes(searchLower)) ||
        (c.shipping_line && c.shipping_line.toLowerCase().includes(searchLower)) ||
        (c.nome_analista && c.nome_analista.toLowerCase().includes(searchLower));
      const matchesLine = filterLine === "all" || c.shipping_line === filterLine;
      
      // Card filter
      let matchesCardFilter = true;
      if (activeCardFilter === "transito") {
        matchesCardFilter = isEmTransito(c.last_event) && !isEntregue(c.last_event) && !isEmAlerta(c.last_event);
      } else if (activeCardFilter === "alerta") {
        matchesCardFilter = isEmAlerta(c.last_event);
      } else if (activeCardFilter === "entregues") {
        matchesCardFilter = isEntregue(c.last_event);
      }

      return matchesSearch && matchesLine && matchesCardFilter;
    });

    // Apply sorting
    if (sortAnalyst !== null) {
      containers = [...containers].sort((a, b) => {
        const nameA = a.nome_analista || "";
        const nameB = b.nome_analista || "";
        const comparison = nameA.localeCompare(nameB);
        return sortAnalyst === "asc" ? comparison : -comparison;
      });
    } else if (sortContainer !== null) {
      containers = [...containers].sort((a, b) => {
        const containerA = a.container || "";
        const containerB = b.container || "";
        const comparison = containerA.localeCompare(containerB);
        return sortContainer === "asc" ? comparison : -comparison;
      });
    } else if (sortClient !== null) {
      containers = [...containers].sort((a, b) => {
        const clientA = a.consignee_name || "";
        const clientB = b.consignee_name || "";
        const comparison = clientA.localeCompare(clientB);
        return sortClient === "asc" ? comparison : -comparison;
      });
    } else if (sortLastCheck !== null) {
      containers = [...containers].sort((a, b) => {
        const dateA = a.last_check ? new Date(a.last_check).getTime() : 0;
        const dateB = b.last_check ? new Date(b.last_check).getTime() : 0;
        const comparison = dateA - dateB;
        return sortLastCheck === "asc" ? comparison : -comparison;
      });
    }

    return containers;
  }, [containersList, searchTerm, filterLine, activeCardFilter, sortAnalyst, sortContainer, sortClient, sortLastCheck]);

  const totalPages = Math.ceil(filteredContainers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentContainers = filteredContainers.slice(startIndex, endIndex);

  // Dashboard stats with new categories - exclude EXCLUDED_CONTAINERS for consistency with table
  const stats = useMemo(() => {
    const containersAtivos = containersList.filter(
      c => !EXCLUDED_CONTAINERS.includes(c.container?.trim().toUpperCase())
    );
    
    const total = containersAtivos.length;
    const emTransito = containersAtivos.filter((c) => isEmTransito(c.last_event) && !isEntregue(c.last_event) && !isEmAlerta(c.last_event)).length;
    const emAlerta = containersAtivos.filter((c) => isEmAlerta(c.last_event)).length;
    const entregues = containersAtivos.filter((c) => isEntregue(c.last_event)).length;

    return { total, emTransito, emAlerta, entregues };
  }, [containersList]);

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
              Intelligent Logistics – Rastreio de Containers
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - User */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
            @{user?.email?.split("@")[0] || "admin"}
          </div>
          <div
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]"
            title="Rastreio de Containers"
          >
            <Ship className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">

        {/* Dashboard Cards - AWB Style */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Monitorados */}
          <Card 
            className={`bg-card/90 border-border backdrop-blur-sm shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => { setActiveCardFilter("all"); setCurrentPage(1); }}
          >
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total Monitorados
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted text-primary">
                  <Anchor className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-foreground">
                  {stats.total}
                </span>
                <span className="text-xs text-muted-foreground">Containers ativos</span>
              </div>
            </div>
          </Card>

          {/* Em Trânsito */}
          <Card 
            className={`bg-gradient-to-br from-blue-900/40 via-blue-900/10 to-card border-blue-700/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "transito" ? "ring-2 ring-blue-400" : ""}`}
            onClick={() => { setActiveCardFilter("transito"); setCurrentPage(1); }}
          >
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-blue-200">
                  Em Trânsito
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-900/60 text-blue-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-blue-300">
                  {stats.emTransito}
                </span>
                <span className="text-xs text-blue-200/80">CRG, DEP, TSP, ARR, DCH</span>
              </div>
            </div>
          </Card>

          {/* Em Alerta */}
          <Card 
            className={`bg-gradient-to-br from-primary/30 via-primary/10 to-card border-primary/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "alerta" ? "ring-2 ring-primary" : ""}`}
            onClick={() => { setActiveCardFilter("alerta"); setCurrentPage(1); }}
          >
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-primary">
                  Em Alerta
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/30 text-primary">
                  <AlertTriangle className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-primary">
                  {stats.emAlerta}
                </span>
                <span className="text-xs text-primary/80">DELAYED, HOLD, CANCELLED</span>
              </div>
            </div>
          </Card>

          {/* Entregues */}
          <Card 
            className={`bg-gradient-to-br from-green-900/40 via-green-900/10 to-card border-green-700/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "entregues" ? "ring-2 ring-green-400" : ""}`}
            onClick={() => { setActiveCardFilter("entregues"); setCurrentPage(1); }}
          >
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-green-200">
                  Entregues
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-900/60 text-green-300">
                  <Check className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-green-300">
                  {stats.entregues}
                </span>
                <span className="text-xs text-green-200/80">GOD, DLV (Gate-out, Entrega)</span>
              </div>
            </div>
          </Card>
        </section>

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
                placeholder="Buscar por Container, BL, Consignee ou Armador"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full pl-10 pr-4 rounded-full border border-[rgba(255,255,255,.14)] bg-[#13141a] text-[#f5f5f5] text-[0.78rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,.8)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <FilterIcon className="h-3 w-3 text-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Armador</span>
                  </div>
                  <Select value={filterLine} onValueChange={setFilterLine}>
                    <SelectTrigger className="h-8 w-[160px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {shippingLines.map((line) => (
                        <SelectItem key={line.code} value={line.code}>
                          {line.code} - {line.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>

              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleLoadFromSeaItems}
                        disabled={isLoadingSeaItems}
                        className="h-8 px-4 rounded-full bg-blue-600 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-blue-500 transition shadow-[0_0_20px_rgba(59,130,246,.3)] disabled:opacity-50"
                      >
                        {isLoadingSeaItems ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Database className="w-3.5 h-3.5" />
                        )}
                        Carregar SEA
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Carregar containers das análises HBL</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)] disabled:opacity-50"
                >
                  {isRefreshing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Atualizar
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Containers Table */}
        <section 
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
          {filteredContainers.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[rgba(0,0,0,.4)] border-b border-[rgba(255,255,255,.08)]">
                      <th
                        className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition"
                        onClick={handleContainerSort}
                      >
                        <span className="flex items-center gap-1">
                          Container
                          {sortContainer === "asc" && <span className="text-[#ffc800]">↑</span>}
                          {sortContainer === "desc" && <span className="text-[#ffc800]">↓</span>}
                        </span>
                      </th>
                      <th
                        className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition"
                        onClick={handleClientSort}
                      >
                        <span className="flex items-center gap-1">
                          Consignee
                          {sortClient === "asc" && <span className="text-[#ffc800]">↑</span>}
                          {sortClient === "desc" && <span className="text-[#ffc800]">↓</span>}
                        </span>
                      </th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Armador</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Origem</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Destino</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium min-w-[180px]">Timeline</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Status</th>
                      {isAdmin && (
                        <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {currentContainers.map((container, idx) => {
                      // Get full report status for colors
                      const reportStatus = getReportStatus(container.last_event);
                      const statusCode = reportStatus.code;
                      const progress = getTimelineProgress(container.last_event);
                      const statusColor = reportStatus.color;
                      
                      // Timeline colors based on etapa
                      let progressColor = statusColor;
                      let shipColor = statusColor;

                      return (
                        <tr
                          key={`${container.id}-${container.container}-${idx}`}
                          className="border-b border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.03)] transition"
                        >
                          <td className="px-4 py-3">
                            <span className="text-[#f5f5f5] font-mono text-sm">{container.container}</span>
                          </td>
                          <td className="px-4 py-3">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[#aaaaaa] text-sm cursor-help">
                                    {abbreviateName(container.consignee_name)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{container.consignee_name}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-[rgba(255,200,0,.15)] text-[#ffc800] border border-[rgba(255,200,0,.3)]">
                              {detectArmadorFromVessel(container.vessel, container.container)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#aaaaaa] text-sm">{container.origem || "-"}</td>
                          <td className="px-4 py-3 text-[#aaaaaa] text-sm">{container.destino || "-"}</td>
                          <td className="px-3 py-3 min-w-[280px]">
                            {/* Timeline visualization */}
                            <div className="relative h-1.5 w-full flex items-center">
                              {/* Background bar */}
                              <div className="absolute inset-0 bg-gray-800/50 rounded-full" />

                              {/* Progress bar */}
                              <div
                                className="absolute left-0 h-full rounded-l-full transition-all duration-700 ease-out"
                                style={{
                                  width: `${progress}%`,
                                  background: `linear-gradient(90deg, ${progressColor}80 0%, ${progressColor} 100%)`,
                                  borderTopRightRadius: progress === 100 ? "9999px" : "0",
                                  borderBottomRightRadius: progress === 100 ? "9999px" : "0",
                                  boxShadow: `0 0 12px ${progressColor}60`,
                                }}
                              />

                              {/* Timeline dots - 6 stages based on new report status system */}
                              <TooltipProvider>
                                {TIMELINE_STAGES.map((stage, i) => (
                                  <Tooltip key={stage.label}>
                                    <TooltipTrigger asChild>
                                      <div 
                                        className={`absolute w-1.5 h-1.5 rounded-full shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform ${
                                          progress >= stage.position ? 'bg-white/90' : 'bg-white/40'
                                        }`}
                                        style={{ left: stage.position === 0 ? '0%' : stage.position === 100 ? 'auto' : `${stage.position}%`, right: stage.position === 100 ? '0%' : 'auto' }} 
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs font-medium">{stage.label}</p>
                                      <p className="text-xs text-muted-foreground">{stage.statuses.join(', ')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </TooltipProvider>

                              {/* Ship icon at progress position */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 ease-out z-20 cursor-pointer"
                                      style={{ left: `${progress}%` }}
                                    >
                                      <Ship
                                        className="w-4 h-4"
                                        style={{
                                          color: shipColor,
                                          fill: shipColor,
                                          filter: `drop-shadow(0 0 4px ${shipColor}) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))`,
                                        }}
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs font-medium">{statusCode}</p>
                                    <p className="text-xs text-muted-foreground">{getStatusDescription(container.last_event)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span 
                                    className="text-sm font-bold px-2 py-1 rounded-md cursor-help"
                                    style={{ 
                                      color: statusColor,
                                      backgroundColor: `${statusColor}20`,
                                    }}
                                  >
                                    {statusCode}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs font-medium">{reportStatus.label}</p>
                                  <p className="text-xs text-muted-foreground">Etapa: {reportStatus.etapa.replace('_', ' ')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          {isAdmin && (
                            <td className="px-3 py-3 text-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteContainer(container.id, container.container)}
                                      className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Remover container do monitoramento</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="p-4 border-t border-[rgba(255,255,255,.08)] flex items-center justify-between bg-[rgba(0,0,0,.3)]">
                <div className="text-[0.78rem] text-[#aaaaaa]">
                  Página {currentPage} de {totalPages} | Total: {filteredContainers.length} registros
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
              <p className="text-[#f5f5f5] uppercase tracking-[0.15em] font-medium">NENHUM CONTAINER MONITORADO</p>
              <p className="text-[0.85rem] text-[#aaaaaa] mt-2">
                Os dados serão carregados automaticamente do banco de dados
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ContainerTracking;
