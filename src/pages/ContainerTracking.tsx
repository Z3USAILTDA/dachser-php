import React, { useState, useEffect, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUsageLog } from "@/hooks/useUsageLog";
import { useUserRole } from "@/hooks/useUserRole";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Search,
  RefreshCw,
  Ship,
  Trash2,
  Database,
  Mail,
  Check,
  ArrowLeft,
  Loader2,
  Anchor,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { User, Session } from "@supabase/supabase-js";
import dachserBg from "@/assets/dachser-background.jpg";
import { TablePagination } from "@/components/layout/TablePagination";
import { Filter as FilterIcon } from "lucide-react";

// Normaliza códigos de armadores do banco para nomes legíveis
const normalizeShippingLine = (code: string | null | undefined): string => {
  if (!code) return "N/D";
  const upper = code.toUpperCase().trim();
  const map: Record<string, string> = {
    'CMA_CGM': 'CMA CGM',
    'CMA': 'CMA CGM',
    'HAPAG_LLOYD': 'HAPAG-LLOYD',
    'YANG_MING': 'YANG MING',
  };
  return map[upper] || code;
};

// ========== REPORT STATUS SYSTEM (12 statuses) ==========
export interface ReportStatus {
  code: string;
  label: string;
  etapa: 'PRE_EMBARQUE' | 'EMBARQUE' | 'TRANSITO' | 'CHEGADA' | 'LIBERACAO' | 'ENTREGA';
  etapaIndex: number;
  color: string;
}

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

const EVENT_TO_REPORT_STATUS: Record<string, string> = {
  'BOOKED': 'BKG', 'BOOKING': 'BKG', 'BOOKING_CONFIRMED': 'BKG', 'PENDING': 'BKG',
  'EMPTY_TO_SHIPPER': 'CLT', 'EMPTY_PICK_UP': 'CLT', 'GATE_OUT_EMPTY': 'CLT', 'PICKED_UP': 'CLT',
  'GATE_IN_FULL': 'GIO', 'FULL_IN': 'GIO', 'RECEIVED': 'GIO', 'RECEIVED_FOR_EXPORT': 'GIO',
  'LOADED': 'CRG', 'LOAD': 'CRG', 'LOADED_ON_VESSEL': 'CRG', 'LOADING': 'CRG',
  'VESSEL_DEPARTED': 'DEP', 'DEPARTED': 'DEP', 'DEPARTURE': 'DEP', 'VESSEL_DEPARTURE': 'DEP',
  'TRANSSHIPMENT': 'TSP', 'TRANSSHIPMENT_DISCHARGED': 'TSP', 'TRANSSHIPMENT_LOADED': 'TSP', 'IN_TRANSIT': 'TSP', 'ON_RAIL': 'TSP',
  'VESSEL_ARRIVED': 'ARR', 'ARRIVED': 'ARR', 'ARRIVAL': 'ARR', 'VESSEL_ARRIVAL': 'ARR',
  'DISCHARGED': 'DCH', 'DISCHARGE': 'DCH', 'UNLOADED': 'DCH', 'OFFLOADED': 'DCH',
  'CUSTOMS_RELEASED': 'INS', 'CUSTOMS_CLEARED': 'INS', 'RELEASED': 'INS', 'CUSTOMS': 'INS', 'AVAILABLE': 'INS', 'READY_FOR_PICKUP': 'INS',
  'GATE_OUT_FULL': 'GOD', 'FULL_OUT': 'GOD', 'OUT_GATE': 'GOD', 'CONTAINER_TO_CONSIGNEE': 'GOD',
  'DELIVERED': 'DLV', 'DELIVERY': 'DLV', 'EMPTY_RETURN': 'DLV', 'EMPTY_RETURNED': 'DLV', 'EMPTY_RECEIVED_AT_CY': 'DLV',
};

const getReportStatus = (lastEvent: string | null): ReportStatus => {
  if (!lastEvent) return REPORT_STATUSES.AGD;
  const normalizedEvent = lastEvent.toUpperCase().replace(/[\s-]/g, '_');
  if (EVENT_TO_REPORT_STATUS[normalizedEvent]) {
    return REPORT_STATUSES[EVENT_TO_REPORT_STATUS[normalizedEvent]];
  }
  for (const [eventKey, statusCode] of Object.entries(EVENT_TO_REPORT_STATUS)) {
    const normalizedKey = eventKey.replace(/_/g, '');
    const cleanEvent = normalizedEvent.replace(/_/g, '');
    if (cleanEvent.includes(normalizedKey) || normalizedKey.includes(cleanEvent)) {
      return REPORT_STATUSES[statusCode];
    }
  }
  return REPORT_STATUSES.AGD;
};

const getTimelineProgress = (lastEvent: string | null): number => {
  const status = getReportStatus(lastEvent);
  return (status.etapaIndex / 5) * 100;
};

const getStatusDescription = (lastEvent: string | null): string => {
  const status = getReportStatus(lastEvent);
  return status.label;
};

const TIMELINE_STAGES = [
  { position: 0, label: 'Pré-Embarque', statuses: ['BKG', 'CLT', 'GIO'] },
  { position: 20, label: 'Embarque', statuses: ['CRG', 'DEP'] },
  { position: 40, label: 'Trânsito', statuses: ['TSP'] },
  { position: 60, label: 'Chegada', statuses: ['ARR', 'DCH'] },
  { position: 80, label: 'Liberação', statuses: ['INS'] },
  { position: 100, label: 'Entrega', statuses: ['GOD', 'DLV'] },
];

// MBL data interface (grouped view)
interface MblTrackingData {
  mbl_id: string;
  tipo_processo: string;
  consignee: string;
  shipping_line: string;
  origem: string;
  destino: string;
  navio: string;
  eta: string;
  email_analista: string;
  email_cliente: string;
  container_count: number;
  container_status: string;
  last_event: string;
  last_check: string;
}

// Container detail interface (expanded view)
interface ContainerDetail {
  id: number;
  mbl_id: string;
  container: string;
  shipping_line: string;
  container_status: string;
  last_event: string;
  last_check: string;
  eta: string;
  navio: string;
  origem: string;
  destino: string;
  consignee: string;
}

const ContainerTracking = () => {
  useUsageLog({ endpoint: "/sea/tracking" });
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLine, setFilterLine] = useState("all");
  
  const [activeCardFilter, setActiveCardFilter] = useState<"all" | "transito" | "alerta" | "entregues">("all");
  const [mblList, setMblList] = useState<MblTrackingData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  
  // Expansion state
  const [expandedMbl, setExpandedMbl] = useState<string | null>(null);
  const [mblContainers, setMblContainers] = useState<ContainerDetail[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [trackingContainer, setTrackingContainer] = useState<string | null>(null);
  
  // Email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailMbl, setEmailMbl] = useState<MblTrackingData | null>(null);
  const [emailType, setEmailType] = useState<"interno" | "cliente">("interno");
  const [emailCustomMessage, setEmailCustomMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const itemsPerPage = 10;

  // Status categorization
  const isEmTransito = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    return ['CRG', 'DEP', 'TSP', 'ARR', 'DCH'].includes(status.code);
  };

  const isEmAlerta = (lastEvent: string | null): boolean => {
    if (!lastEvent) return false;
    const upper = lastEvent.toUpperCase().replace(/[_\s-]/g, "");
    return upper.includes("DELAYED") || upper.includes("DELAY") ||
           upper.includes("CANCELLED") || upper.includes("CANCEL") ||
           upper.includes("CUSTOMSHOLD") || upper.includes("MISSED");
  };

  const isEntregue = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    return ['GOD', 'DLV'].includes(status.code);
  };

  // Check admin access
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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

  // Fetch MBL data from t_tracking_sea
  const fetchMblData = React.useCallback(async () => {
    setIsLoadingData(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=get_sea_tracking`,
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
        setMblList(result.data);
      } else if (result.error) {
        console.error("Error fetching MBL data:", result.error);
      }
    } catch (error) {
      console.error("Error fetching MBL data:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchMblData();
  }, [fetchMblData]);

  // Fetch containers for expanded MBL
  const fetchMblContainers = async (mbl_id: string) => {
    setLoadingContainers(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=get_sea_tracking_containers&mbl_id=${encodeURIComponent(mbl_id)}`,
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
        setMblContainers(result.data);
      }
    } catch (error) {
      console.error("Error fetching containers:", error);
    } finally {
      setLoadingContainers(false);
    }
  };

  // Toggle MBL expansion
  const handleToggleExpand = async (mbl_id: string) => {
    if (expandedMbl === mbl_id) {
      setExpandedMbl(null);
      setMblContainers([]);
    } else {
      setExpandedMbl(mbl_id);
      await fetchMblContainers(mbl_id);
    }
  };

  // Refresh all containers via JSONCargo API
  const handleRefresh = async () => {
    setIsRefreshing(true);
    toast({
      title: "Atualizando dados",
      description: "Consultando status via JSONCargo API...",
    });
    
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=refresh_sea_tracking`,
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
        await fetchMblData();
        if (expandedMbl) {
          await fetchMblContainers(expandedMbl);
        }
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

  // Sync from t_master_dados
  const handleSync = async () => {
    setIsSyncing(true);
    toast({
      title: "Sincronizando",
      description: "Buscando dados de t_master_dados...",
    });
    
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=sync_sea_tracking`,
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
          title: "Sincronizado",
          description: result.message || `${result.synced} registros sincronizados`,
        });
        await fetchMblData();
      } else {
        toast({
          title: "Erro ao sincronizar",
          description: result.error || "Falha na sincronização",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error syncing:", error);
      toast({
        title: "Erro",
        description: "Falha ao sincronizar",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Track single container
  const handleTrackContainer = async (containerId: string, shippingLine: string) => {
    setTrackingContainer(containerId);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=track_sea_container&container=${encodeURIComponent(containerId)}&shipping_line=${encodeURIComponent(shippingLine)}`,
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
          description: `Status: ${result.data?.container_status || 'N/A'}`,
        });
        if (expandedMbl) {
          await fetchMblContainers(expandedMbl);
        }
        await fetchMblData();
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

  // Delete MBL from tracking
  const handleDeleteMbl = async (mbl_id: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=delete_sea_tracking`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mbl_id })
        }
      );
      
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "MBL removido",
          description: "MBL removido do monitoramento.",
        });
        await fetchMblData();
      }
    } catch (error) {
      console.error("Error deleting MBL:", error);
    }
  };

  // Email modal
  const handleOpenEmailModal = (mbl: MblTrackingData) => {
    setEmailMbl(mbl);
    setEmailType("interno");
    setEmailCustomMessage("");
    setEmailModalOpen(true);
  };

  const handleSendEmail = async () => {
    if (!emailMbl) return;
    
    setIsSendingEmail(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-container-status-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: emailType === "interno" ? emailMbl.email_analista : emailMbl.email_cliente,
            container: emailMbl.mbl_id,
            vessel: emailMbl.navio,
            shipping_line: emailMbl.shipping_line,
            status: emailMbl.last_event,
            eta: emailMbl.eta,
            consignee: emailMbl.consignee,
            origem: emailMbl.origem,
            destino: emailMbl.destino,
            custom_message: emailCustomMessage || undefined,
            email_type: emailType,
          })
        }
      );
      
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: "E-mail enviado",
          description: `E-mail enviado para ${result.sent_to}`,
        });
        setEmailModalOpen(false);
      } else {
        toast({
          title: "Erro ao enviar e-mail",
          description: result.error || "Falha no envio",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error sending email:", error);
      toast({
        title: "Erro",
        description: "Falha ao enviar e-mail",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const abbreviateName = (name: string): string => {
    if (!name || name === "-") return "-";
    if (name.length > 20) {
      return name.substring(0, 20) + "...";
    }
    return name;
  };

  // Filter MBL list
  const filteredMbls = useMemo(() => {
    let mbls = mblList.filter((m) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        m.mbl_id.toLowerCase().includes(searchLower) ||
        (m.consignee && m.consignee.toLowerCase().includes(searchLower)) ||
        (m.shipping_line && m.shipping_line.toLowerCase().includes(searchLower)) ||
        (m.navio && m.navio.toLowerCase().includes(searchLower));
      
      const armador = normalizeShippingLine(m.shipping_line);
      const matchesLine = filterLine === "all" || armador === filterLine;
      
      let matchesCardFilter = true;
      if (activeCardFilter === "transito") {
        matchesCardFilter = isEmTransito(m.last_event) && !isEntregue(m.last_event) && !isEmAlerta(m.last_event);
      } else if (activeCardFilter === "alerta") {
        matchesCardFilter = isEmAlerta(m.last_event);
      } else if (activeCardFilter === "entregues") {
        matchesCardFilter = isEntregue(m.last_event);
      }

      return matchesSearch && matchesLine && matchesCardFilter;
    });

    return mbls;
  }, [mblList, searchTerm, filterLine, activeCardFilter]);

  const totalPages = Math.ceil(filteredMbls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentMbls = filteredMbls.slice(startIndex, endIndex);

  // Dashboard stats
  const stats = useMemo(() => {
    const total = mblList.length;
    const emTransito = mblList.filter((m) => isEmTransito(m.last_event) && !isEntregue(m.last_event) && !isEmAlerta(m.last_event)).length;
    const emAlerta = mblList.filter((m) => isEmAlerta(m.last_event)).length;
    const entregues = mblList.filter((m) => isEntregue(m.last_event)).length;

    return { total, emTransito, emAlerta, entregues };
  }, [mblList]);

  // Dynamic list of armadores
  const dynamicArmadores = useMemo(() => {
    const armadoresSet = new Set<string>();
    mblList.forEach(m => {
      const armador = normalizeShippingLine(m.shipping_line);
      if (armador && armador !== "N/D") {
        armadoresSet.add(armador);
      }
    });
    return Array.from(armadoresSet).sort();
  }, [mblList]);

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
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `
          }}
        />
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
              Intelligent Logistics – Rastreio Marítimo (MBL)
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
            @{user?.email?.split("@")[0] || "admin"}
          </div>
          <button
            onClick={() => navigate("/sea/tracking/manual")}
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
            title="Ajuda"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
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

        {/* Dashboard Cards */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card 
            className={`bg-card/90 border-border backdrop-blur-sm shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => { setActiveCardFilter("all"); setCurrentPage(1); }}
          >
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total MBLs
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted text-primary">
                  <Anchor className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-foreground">
                  {stats.total}
                </span>
                <span className="text-xs text-muted-foreground">Masters ativos</span>
              </div>
            </div>
          </Card>

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
                <span className="text-xs text-primary/80">DELAYED, HOLD</span>
              </div>
            </div>
          </Card>

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
                <span className="text-xs text-green-200/80">GOD, DLV</span>
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
                placeholder="Buscar por MBL, Consignee, Armador ou Navio"
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
                      {dynamicArmadores.map((armador) => (
                        <SelectItem key={armador} value={armador}>
                          {armador}
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
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="h-8 px-4 rounded-full bg-blue-600 text-white text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-blue-500 transition shadow-[0_0_20px_rgba(59,130,246,.3)] disabled:opacity-50"
                      >
                        {isSyncing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Database className="w-3.5 h-3.5" />
                        )}
                        Sincronizar
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Sincronizar dados de t_master_dados</p>
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

        {/* MBL Table */}
        <section 
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
          {filteredMbls.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[rgba(0,0,0,.4)] border-b border-[rgba(255,255,255,.08)]">
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">MBL</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Containers</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Consignee</th>
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
                    {currentMbls.map((mbl, idx) => {
                      const reportStatus = getReportStatus(mbl.last_event);
                      const statusCode = reportStatus.code;
                      const progress = getTimelineProgress(mbl.last_event);
                      const statusColor = reportStatus.color;
                      const isExpanded = expandedMbl === mbl.mbl_id;

                      return (
                        <Fragment key={`${mbl.mbl_id}-${idx}`}>
                          <tr className="border-b border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.03)] transition">
                            <td className="px-4 py-3">
                              <span className="text-[#f5f5f5] font-mono text-sm">{mbl.mbl_id}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleToggleExpand(mbl.mbl_id)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[rgba(255,200,0,.1)] text-[#ffc800] hover:bg-[rgba(255,200,0,.2)] transition text-sm"
                              >
                                <Package className="w-3.5 h-3.5" />
                                {mbl.container_count}
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[#aaaaaa] text-sm cursor-help">
                                      {abbreviateName(mbl.consignee || "-")}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{mbl.consignee || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-[rgba(255,200,0,.15)] text-[#ffc800] border border-[rgba(255,200,0,.3)]">
                                {normalizeShippingLine(mbl.shipping_line)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#aaaaaa] text-sm">{mbl.origem || "-"}</td>
                            <td className="px-4 py-3 text-[#aaaaaa] text-sm">{mbl.destino || "-"}</td>
                            <td className="px-3 py-3 min-w-[280px]">
                              <div className="relative h-1.5 w-full flex items-center">
                                <div className="absolute inset-0 bg-gray-800/50 rounded-full" />
                                <div
                                  className="absolute left-0 h-full rounded-l-full transition-all duration-700 ease-out"
                                  style={{
                                    width: `${progress}%`,
                                    background: `linear-gradient(90deg, ${statusColor}80 0%, ${statusColor} 100%)`,
                                    borderTopRightRadius: progress === 100 ? "9999px" : "0",
                                    borderBottomRightRadius: progress === 100 ? "9999px" : "0",
                                    boxShadow: `0 0 12px ${statusColor}60`,
                                  }}
                                />
                                <TooltipProvider>
                                  {TIMELINE_STAGES.map((stage) => (
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
                                            color: statusColor,
                                            fill: statusColor,
                                            filter: `drop-shadow(0 0 4px ${statusColor}) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))`,
                                          }}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs font-medium">{statusCode}</p>
                                      <p className="text-xs text-muted-foreground">{getStatusDescription(mbl.last_event)}</p>
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
                                <div className="flex items-center justify-center gap-1">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleOpenEmailModal(mbl)}
                                          className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                        >
                                          <Mail className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Enviar e-mail de status</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDeleteMbl(mbl.mbl_id)}
                                          className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Remover MBL do monitoramento</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </td>
                            )}
                          </tr>
                          
                          {/* Expanded containers row */}
                          {isExpanded && (
                            <tr className="bg-[rgba(0,0,0,.3)]">
                              <td colSpan={isAdmin ? 9 : 8} className="px-4 py-4">
                                {loadingContainers ? (
                                  <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#ffc800]" />
                                    <span className="ml-2 text-[#aaaaaa]">Carregando containers...</span>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="text-xs text-[#aaaaaa] uppercase tracking-wide mb-2 flex items-center gap-2">
                                      <Package className="w-4 h-4" />
                                      Containers do MBL {mbl.mbl_id}
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="text-[#666] text-xs uppercase">
                                            <th className="px-3 py-2 text-left">Container</th>
                                            <th className="px-3 py-2 text-left">Armador</th>
                                            <th className="px-3 py-2 text-left">Status</th>
                                            <th className="px-3 py-2 text-left">Último Evento</th>
                                            <th className="px-3 py-2 text-left">ETA</th>
                                            <th className="px-3 py-2 text-center">Ações</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {mblContainers.map((cnt) => {
                                            const cntStatus = getReportStatus(cnt.last_event);
                                            return (
                                              <tr key={cnt.id} className="border-t border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.02)]">
                                                <td className="px-3 py-2 font-mono text-[#f5f5f5]">{cnt.container}</td>
                                                <td className="px-3 py-2 text-[#aaaaaa]">{normalizeShippingLine(cnt.shipping_line)}</td>
                                                <td className="px-3 py-2">
                                                  <span 
                                                    className="text-xs font-bold px-2 py-0.5 rounded"
                                                    style={{ 
                                                      color: cntStatus.color,
                                                      backgroundColor: `${cntStatus.color}20`,
                                                    }}
                                                  >
                                                    {cntStatus.code}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 text-[#aaaaaa] max-w-[200px] truncate">
                                                  {cnt.last_event || "Aguardando..."}
                                                </td>
                                                <td className="px-3 py-2 text-[#aaaaaa]">
                                                  {cnt.eta ? new Date(cnt.eta).toLocaleDateString('pt-BR') : "-"}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleTrackContainer(cnt.container, cnt.shipping_line || '')}
                                                    disabled={trackingContainer === cnt.container}
                                                    className="h-7 px-2 text-[#ffc800] hover:text-[#ffdc50] hover:bg-[rgba(255,200,0,.1)]"
                                                  >
                                                    {trackingContainer === cnt.container ? (
                                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                      <RefreshCw className="w-3.5 h-3.5" />
                                                    )}
                                                  </Button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <div className="p-4 border-t border-[rgba(255,255,255,.08)] flex items-center justify-between bg-[rgba(0,0,0,.3)]">
                <div className="text-[0.78rem] text-[#aaaaaa]">
                  Página {currentPage} de {totalPages} | Total: {filteredMbls.length} MBLs
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
              <p className="text-[#f5f5f5] uppercase tracking-[0.15em] font-medium">NENHUM MBL MONITORADO</p>
              <p className="text-[0.85rem] text-[#aaaaaa] mt-2">
                Clique em "Sincronizar" para carregar dados de t_master_dados
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Email Modal */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[#1a1a1a] border-[rgba(255,255,255,.1)]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-400" />
              Enviar E-mail - {emailMbl?.mbl_id}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Selecione o tipo de destinatário e adicione uma mensagem personalizada (opcional).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label className="text-white">Tipo de envio:</Label>
              <RadioGroup 
                value={emailType} 
                onValueChange={(v) => setEmailType(v as "interno" | "cliente")}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center space-x-3 p-3 rounded-lg border border-[rgba(255,255,255,.1)] hover:border-blue-400/50 transition cursor-pointer">
                  <RadioGroupItem value="interno" id="interno" className="border-gray-500 text-blue-400" />
                  <Label htmlFor="interno" className="text-white cursor-pointer flex-1">
                    Interno (Analista)
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {emailMbl?.email_analista || "Não configurado"}
                    </span>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-lg border border-[rgba(255,255,255,.1)] hover:border-blue-400/50 transition cursor-pointer">
                  <RadioGroupItem value="cliente" id="cliente" className="border-gray-500 text-blue-400" />
                  <Label htmlFor="cliente" className="text-white cursor-pointer flex-1">
                    Cliente
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {emailMbl?.email_cliente || "Não configurado"}
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customMessage" className="text-white">Mensagem personalizada (opcional):</Label>
              <Textarea
                id="customMessage"
                value={emailCustomMessage}
                onChange={(e) => setEmailCustomMessage(e.target.value)}
                placeholder="Adicione uma mensagem personalizada..."
                className="bg-[rgba(0,0,0,.3)] border-[rgba(255,255,255,.1)] text-white placeholder:text-gray-500 min-h-[80px]"
              />
            </div>

            <div className="bg-[rgba(0,0,0,.3)] rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">MBL:</span>
                <span className="text-white font-mono">{emailMbl?.mbl_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Consignee:</span>
                <span className="text-white">{emailMbl?.consignee || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Containers:</span>
                <span className="text-white">{emailMbl?.container_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className="text-white">{emailMbl?.last_event || "-"}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEmailModalOpen(false)}
              className="border-[rgba(255,255,255,.1)] text-gray-300 hover:bg-[rgba(255,255,255,.05)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={isSendingEmail}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar E-mail
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContainerTracking;
