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
import { Search, RefreshCw, Ship, Trash2, Mail, Check, ArrowLeft, Loader2, Anchor, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, Package, Clock, Bell, Play, Database, Radar, RotateCcw, Sun, Moon, FileSpreadsheet } from "lucide-react";
import { exportSeaMblsToExcel } from "@/utils/seaMblExcelExport";
import { RegisterFreeTimeDialog } from "@/components/tracking/RegisterFreeTimeDialog";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { User, Session } from "@supabase/supabase-js";
import dachserBg from "@/assets/dachser-background.jpg";
import { TablePagination } from "@/components/layout/TablePagination";
import { Filter as FilterIcon } from "lucide-react";
import VesselFinderMap from "@/components/tracking/VesselFinderMap";
import Swal from 'sweetalert2';
import { useTheme } from "@/hooks/useTheme";
import { detectCarrierFromMbl, getAllShippingLines, SHIPPING_LINE_INFO, ShippingLineCode } from "@/lib/shippingLineMapping";

// Deriva o armador do MBL usando o mapeamento centralizado - retorna código normalizado
const getShippingLineCodeFromMbl = (mbl_id: string, shipping_line: string | null | undefined): ShippingLineCode => {
  // Se já tiver shipping_line no banco, tenta mapear para código
  if (shipping_line) {
    const upper = shipping_line.toUpperCase().trim().replace(/[\s-]+/g, '_');
    // Verifica se é um código válido
    if (SHIPPING_LINE_INFO[upper as ShippingLineCode]) {
      return upper as ShippingLineCode;
    }
    // Tenta pelo nome
    const found = Object.entries(SHIPPING_LINE_INFO).find(([_, info]) => 
      info.name.toUpperCase() === shipping_line.toUpperCase().trim()
    );
    if (found) return found[0] as ShippingLineCode;
  }
  // Caso contrário, detecta pelo prefixo do MBL
  return detectCarrierFromMbl(mbl_id).code;
};

// Retorna o nome legível do armador
const getShippingLineFromMbl = (mbl_id: string, shipping_line: string | null | undefined): string => {
  const code = getShippingLineCodeFromMbl(mbl_id, shipping_line);
  return code !== 'UNKNOWN' ? SHIPPING_LINE_INFO[code].name : 'N/D';
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
  BKG: {
    code: 'BKG',
    label: 'Booking criado',
    etapa: 'PRE_EMBARQUE',
    etapaIndex: 0,
    color: '#94a3b8'
  },
  CLT: {
    code: 'CLT',
    label: 'Coleta da carga',
    etapa: 'PRE_EMBARQUE',
    etapaIndex: 0,
    color: '#a78bfa'
  },
  GIO: {
    code: 'GIO',
    label: 'Gate-in origem',
    etapa: 'PRE_EMBARQUE',
    etapaIndex: 0,
    color: '#818cf8'
  },
  CRG: {
    code: 'CRG',
    label: 'Carregado no navio',
    etapa: 'EMBARQUE',
    etapaIndex: 1,
    color: '#60a5fa'
  },
  DEP: {
    code: 'DEP',
    label: 'Partida do navio',
    etapa: 'EMBARQUE',
    etapaIndex: 1,
    color: '#38bdf8'
  },
  TSP: {
    code: 'TSP',
    label: 'Chegada/Partida em transbordo',
    etapa: 'TRANSITO',
    etapaIndex: 2,
    color: '#f97316'
  },
  ARR: {
    code: 'ARR',
    label: 'Chegada do navio',
    etapa: 'CHEGADA',
    etapaIndex: 3,
    color: '#22d3ee'
  },
  DCH: {
    code: 'DCH',
    label: 'Descarga',
    etapa: 'CHEGADA',
    etapaIndex: 3,
    color: '#2dd4bf'
  },
  INS: {
    code: 'INS',
    label: 'Inspeção/Liberação aduaneira',
    etapa: 'LIBERACAO',
    etapaIndex: 4,
    color: '#fbbf24'
  },
  GOD: {
    code: 'GOD',
    label: 'Gate-out destino',
    etapa: 'ENTREGA',
    etapaIndex: 5,
    color: '#4ade80'
  },
  DLV: {
    code: 'DLV',
    label: 'Entrega final',
    etapa: 'ENTREGA',
    etapaIndex: 5,
    color: '#22c55e'
  },
  AGD: {
    code: 'AGD',
    label: 'Aguardando',
    etapa: 'PRE_EMBARQUE',
    etapaIndex: 0,
    color: '#64748b'
  }
};
const EVENT_TO_REPORT_STATUS: Record<string, string> = {
  'BOOKED': 'BKG',
  'BOOKING': 'BKG',
  'BOOKING_CONFIRMED': 'BKG',
  'PENDING': 'BKG',
  'EMPTY_TO_SHIPPER': 'CLT',
  'EMPTY_PICK_UP': 'CLT',
  'GATE_OUT_EMPTY': 'CLT',
  'PICKED_UP': 'CLT',
  'GATE_IN_FULL': 'GIO',
  'FULL_IN': 'GIO',
  'RECEIVED': 'GIO',
  'RECEIVED_FOR_EXPORT': 'GIO',
  'LOADED': 'CRG',
  'LOAD': 'CRG',
  'LOADED_ON_VESSEL': 'CRG',
  'LOADING': 'CRG',
  'VESSEL_DEPARTED': 'DEP',
  'DEPARTED': 'DEP',
  'DEPARTURE': 'DEP',
  'VESSEL_DEPARTURE': 'DEP',
  'TRANSSHIPMENT': 'TSP',
  'TRANSSHIPMENT_DISCHARGED': 'TSP',
  'TRANSSHIPMENT_LOADED': 'TSP',
  'IN_TRANSIT': 'TSP',
  'ON_RAIL': 'TSP',
  'VESSEL_ARRIVED': 'ARR',
  'ARRIVED': 'ARR',
  'ARRIVAL': 'ARR',
  'VESSEL_ARRIVAL': 'ARR',
  'DISCHARGED': 'DCH',
  'DISCHARGE': 'DCH',
  'UNLOADED': 'DCH',
  'OFFLOADED': 'DCH',
  'CUSTOMS_RELEASED': 'INS',
  'CUSTOMS_CLEARED': 'INS',
  'RELEASED': 'INS',
  'CUSTOMS': 'INS',
  'AVAILABLE': 'INS',
  'READY_FOR_PICKUP': 'INS',
  'GATE_OUT_FULL': 'GOD',
  'FULL_OUT': 'GOD',
  'OUT_GATE': 'GOD',
  'CONTAINER_TO_CONSIGNEE': 'GOD',
  'DELIVERED': 'DLV',
  'DELIVERY': 'DLV',
  'EMPTY_RETURN': 'DLV',
  'EMPTY_RETURNED': 'DLV',
  'EMPTY_RECEIVED_AT_CY': 'DLV'
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
  return status.etapaIndex / 5 * 100;
};
const getStatusDescription = (lastEvent: string | null): string => {
  const status = getReportStatus(lastEvent);
  return status.label;
};
const TIMELINE_STAGES = [{
  position: 0,
  label: 'Pré-Embarque',
  statuses: ['BKG', 'CLT', 'GIO']
}, {
  position: 20,
  label: 'Embarque',
  statuses: ['CRG', 'DEP']
}, {
  position: 40,
  label: 'Trânsito',
  statuses: ['TSP']
}, {
  position: 60,
  label: 'Chegada',
  statuses: ['ARR', 'DCH']
}, {
  position: 80,
  label: 'Liberação',
  statuses: ['INS']
}, {
  position: 100,
  label: 'Entrega',
  statuses: ['GOD', 'DLV']
}];

// MBL data interface (grouped view)
interface MblTrackingData {
  mbl_id: string;
  tipo_processo: string;
  consignee: string;
  shipping_line: string;
  origem: string;
  destino: string;
  navio: string;
  vessel_imo: string | null;
  eta: string;
  eta_master: string | null; // ETA do t_master_dados (auditoria)
  eta_api: string | null; // ETA retornado pela API
  email_analista: string;
  email_cliente: string;
  container_count: number;
  container_status: string;
  last_event: string;
  last_check: string;
  is_eta_delayed: number; // 1 se ETA passou há mais de 3 dias
  is_critico: number; // 1 se atraso >= 7 dias
  dias_atraso: number; // Dias de atraso calculados
  transshipment_port: string | null; // Porto(s) de escala/transbordo
  has_free_time: number; // 1 se possui Free Time cadastrado
  nome_analista: string | null; // Coordenador do processo
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
  vessel_imo: string | null;
  origem: string;
  destino: string;
  consignee: string;
}
const ContainerTracking = () => {
  useUsageLog({
    endpoint: "/sea/tracking"
  });
  const navigate = useNavigate();
  const {
    isAdmin
  } = useUserRole();
  
  // Get username from localStorage (MariaDB auth)
  const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
  const loggedUsername = storedUser ? JSON.parse(storedUser)?.username : null;
  const {
    theme,
    toggleTheme
  } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLine, setFilterLine] = useState("all");
  const [filterCoordenador, setFilterCoordenador] = useState("all");
  const [filterTipoProcesso, setFilterTipoProcesso] = useState<"all" | "SEA IMPORT" | "SEA EXPORT">("all");
  const [activeCardFilter, setActiveCardFilter] = useState<"all" | "transito" | "alerta" | "critico" | "entregues">("all");
  const [mblList, setMblList] = useState<MblTrackingData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    toast
  } = useToast();

  // Auto sync state
  const [autoSyncStatus, setAutoSyncStatus] = useState<'sync' | 'enrich' | 'track' | 'imo' | null>(null);
  const [lastAutoSync, setLastAutoSync] = useState<Date | null>(null);

  // Admin action states
  const [isRunningSync, setIsRunningSync] = useState(false);
  const [isRunningEnrich, setIsRunningEnrich] = useState(false);
  const [isRunningTrack, setIsRunningTrack] = useState(false);
  const [isRunningRetrack, setIsRunningRetrack] = useState(false);
  const [isRunningImoRefresh, setIsRunningImoRefresh] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Expansion state
  const [expandedMbl, setExpandedMbl] = useState<string | null>(null);
  const [mblContainers, setMblContainers] = useState<ContainerDetail[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [vesselImo, setVesselImo] = useState<string | null>(null);
  const [vesselName, setVesselName] = useState<string | null>(null);

  // Email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailMbl, setEmailMbl] = useState<MblTrackingData | null>(null);
  const [emailType, setEmailType] = useState<"interno" | "cliente">("interno");
  const [emailCustomMessage, setEmailCustomMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Free Time dialog state
  const [freeTimeDialogOpen, setFreeTimeDialogOpen] = useState(false);
  const itemsPerPage = 10;

  // Status categorization
  const isEmTransito = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    return ['CRG', 'DEP', 'TSP', 'ARR', 'DCH'].includes(status.code);
  };
  const isEmAlerta = (lastEvent: string | null, isEtaDelayed?: number): boolean => {
    // Verificação via campo calculado do backend (ETA passou há mais de 3 dias)
    if (isEtaDelayed === 1) return true;
    if (!lastEvent) return false;
    const upper = lastEvent.toUpperCase().replace(/[_\s-]/g, "");
    return upper.includes("DELAYED") || upper.includes("DELAY") || upper.includes("CANCELLED") || upper.includes("CANCEL") || upper.includes("CUSTOMSHOLD") || upper.includes("MISSED");
  };
  const isEntregue = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    return ['GOD', 'DLV'].includes(status.code);
  };

  // Status crítico: atraso >= 7 dias
  const isEmCritico = (isCritico?: number): boolean => isCritico === 1;

  // Verificar se deve mostrar o mapa do navio (ocultar para DCH e posteriores)
  const shouldShowVesselMap = (lastEvent: string | null): boolean => {
    const status = getReportStatus(lastEvent);
    // Ocultar mapa para status DCH ou posteriores (índice de etapa >= 3)
    return !['DCH', 'INS', 'GOD', 'DLV'].includes(status.code);
  };

  // Check authentication - redirect to login if not authenticated
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      navigate("/");
      return;
    }
  }, [navigate]);

  // Check authentication
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=get_sea_tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
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

  // Cleanup orphan PENDENTE containers on initial load, then fetch data
  useEffect(() => {
    const initializeData = async () => {
      // First, cleanup orphan PENDENTE containers that shouldn't exist
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=cleanup_orphan_pendentes`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[init] cleanup_orphan_pendentes error:', e);
      }
      // Then fetch data
      fetchMblData();
    };
    initializeData();
  }, [fetchMblData]);

  // Fetch containers for expanded MBL
  const fetchMblContainers = async (mbl_id: string) => {
    setLoadingContainers(true);
    setVesselImo(null);
    setVesselName(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=get_sea_tracking_containers&mbl_id=${encodeURIComponent(mbl_id)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await res.json();
      if (result.success && result.data) {
        setMblContainers(result.data);
        const containerWithImo = result.data.find((c: ContainerDetail) => c.vessel_imo);
        const containerWithVessel = result.data.find((c: ContainerDetail) => c.navio);
        if (containerWithImo) {
          setVesselImo(containerWithImo.vessel_imo);
        }
        if (containerWithVessel) {
          setVesselName(containerWithVessel.navio);
        }
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
      setVesselImo(null);
      setVesselName(null);
    } else {
      setExpandedMbl(mbl_id);
      await fetchMblContainers(mbl_id);
    }
  };

  // Simplified refresh - only reloads data from UI
  const handleRefresh = async () => {
    setIsRefreshing(true);
    toast({
      title: "Atualizando",
      description: "Recarregando dados..."
    });
    try {
      await fetchMblData();
      if (expandedMbl) {
        await fetchMblContainers(expandedMbl);
      }
      toast({
        title: "Atualizado",
        description: "Dados recarregados com sucesso"
      });
    } catch (error) {
      console.error("Error refreshing:", error);
      toast({
        title: "Erro",
        description: "Falha ao recarregar dados",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Automated sync function - runs every 12 hours in background
  const runAutoSync = React.useCallback(async () => {
    console.log('[AutoSync] Starting automated sync process...');
    try {
      // Step 0a: Cleanup orphan PENDENTE containers from MBLs that already have valid containers
      console.log('[AutoSync] Step 0a: Cleaning up orphan PENDENTE containers...');
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=cleanup_orphan_pendentes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      // Step 0b: Deactivate invalid MBLs (booking refs, no valid containers)
      console.log('[AutoSync] Step 0b: Deactivating invalid MBLs...');
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=deactivate_invalid_mbls`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      // Step 1: Sync new MBLs from t_master_dados
      setAutoSyncStatus('sync');
      console.log('[AutoSync] Step 1: Syncing new MBLs...');
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=sync_sea_tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      // Step 2: Enrich MBLs with containers (batch)
      setAutoSyncStatus('enrich');
      console.log('[AutoSync] Step 2: Enriching MBLs with containers...');
      let enrichRemaining = 1;
      let enrichIteration = 0;
      while (enrichRemaining > 0 && enrichIteration < 20) {
        enrichIteration++;
        const enrichRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=enrich_sea_containers&batch_size=30&max_time_ms=45000`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        const enrichResult = await enrichRes.json();
        enrichRemaining = enrichResult.remaining || 0;
        if (enrichResult.enriched === 0 && enrichResult.errors === 0) break;
      }

      // Step 3: Track containers (batch with 48h for valid status)
      setAutoSyncStatus('track');
      console.log('[AutoSync] Step 3: Tracking containers...');
      let trackRemaining = 1;
      let trackIteration = 0;
      while (trackRemaining > 0 && trackIteration < 30) {
        trackIteration++;
        const trackRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=refresh_sea_tracking&batch_size=20&stale_hours=4&refresh_valid_hours=48`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        const trackResult = await trackRes.json();
        trackRemaining = trackResult.remaining || 0;
        if (trackResult.processed === 0) break;
      }

      // Step 4: Populate missing IMOs
      setAutoSyncStatus('imo');
      console.log('[AutoSync] Step 4: Populating missing IMOs...');
      let imoRemaining = 1;
      let imoIteration = 0;
      while (imoRemaining > 0 && imoIteration < 15) {
        imoIteration++;
        const imoRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=populate_missing_imos&batch_size=30`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        const imoResult = await imoRes.json();
        imoRemaining = imoResult.remaining || 0;
        if (imoResult.vesselsProcessed === 0) break;
      }

      // Step 5: Refresh data in UI
      console.log('[AutoSync] Step 5: Refreshing UI data...');
      await fetchMblData();
      setLastAutoSync(new Date());
      console.log('[AutoSync] Completed successfully');
    } catch (error) {
      console.error('[AutoSync] Error:', error);
    } finally {
      setAutoSyncStatus(null);
    }
  }, [fetchMblData]);

  // ===== ADMIN-ONLY ACTIONS =====
  // Force sync new MBLs from t_master_dados
  const handleAdminSync = async () => {
    if (!isAdmin) return;
    setIsRunningSync(true);
    Swal.fire({
      title: 'Sincronizando MBLs',
      html: `
        <div class="text-left">
          <p class="mb-2">Buscando novos MBLs do banco de dados...</p>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div class="bg-blue-600 h-2.5 rounded-full" style="width: 0%" id="sync-progress"></div>
          </div>
          <p class="text-sm text-gray-500" id="sync-status">Iniciando...</p>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    try {
      const progressEl = document.getElementById('sync-progress');
      const statusEl = document.getElementById('sync-status');
      if (progressEl) progressEl.style.width = '30%';
      if (statusEl) statusEl.textContent = 'Conectando ao banco de dados...';
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=sync_sea_tracking`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      if (progressEl) progressEl.style.width = '80%';
      if (statusEl) statusEl.textContent = 'Processando resposta...';
      const result = await res.json();
      if (progressEl) progressEl.style.width = '100%';
      await fetchMblData();
      Swal.fire({
        icon: 'success',
        title: 'Sincronização Concluída!',
        html: `
          <div class="text-left">
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-600 rounded-full font-bold">${result.inserted || 0}</span>
              <span>Novos MBLs inseridos</span>
            </div>
            ${result.updated ? `
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full font-bold">${result.updated}</span>
              <span>MBLs atualizados</span>
            </div>
            ` : ''}
          </div>
        `,
        confirmButtonColor: '#3085d6'
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro na Sincronização',
        text: 'Falha ao sincronizar MBLs. Tente novamente.',
        confirmButtonColor: '#d33'
      });
    } finally {
      setIsRunningSync(false);
    }
  };

  // Enrich MBLs with container info
  const handleAdminEnrich = async () => {
    if (!isAdmin) return;
    setIsRunningEnrich(true);
    let totalEnriched = 0;
    let totalErrors = 0;
    let remaining = 1;
    let iteration = 0;
    const maxIterations = 10;
    Swal.fire({
      title: 'Enriquecendo Containers',
      html: `
        <div class="text-left">
          <p class="mb-3">Buscando containers para cada MBL...</p>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div class="bg-purple-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%" id="enrich-progress"></div>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center mt-3">
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-purple-600" id="enrich-count">0</div>
              <div class="text-xs text-gray-500">Enriquecidos</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-orange-600" id="enrich-remaining">-</div>
              <div class="text-xs text-gray-500">Pendentes</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-blue-600" id="enrich-iteration">0/${maxIterations}</div>
              <div class="text-xs text-gray-500">Batch</div>
            </div>
          </div>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    try {
      while (remaining > 0 && iteration < maxIterations) {
        iteration++;
        const progressEl = document.getElementById('enrich-progress');
        const countEl = document.getElementById('enrich-count');
        const remainingEl = document.getElementById('enrich-remaining');
        const iterationEl = document.getElementById('enrich-iteration');
        if (progressEl) progressEl.style.width = `${iteration / maxIterations * 100}%`;
        if (iterationEl) iterationEl.textContent = `${iteration}/${maxIterations}`;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=enrich_sea_containers&batch_size=30&max_time_ms=45000`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        const result = await res.json();
        totalEnriched += result.enriched || 0;
        totalErrors += result.errors || 0;
        remaining = result.remaining || 0;
        if (countEl) countEl.textContent = String(totalEnriched);
        if (remainingEl) remainingEl.textContent = String(remaining);
        if (result.enriched === 0 && result.errors === 0) break;
      }
      await fetchMblData();
      Swal.fire({
        icon: 'success',
        title: 'Enriquecimento Concluído!',
        html: `
          <div class="text-left">
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-600 rounded-full font-bold">${totalEnriched}</span>
              <span>MBLs enriquecidos com containers</span>
            </div>
            ${totalErrors > 0 ? `
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-600 rounded-full font-bold">${totalErrors}</span>
              <span>Erros encontrados</span>
            </div>
            ` : ''}
            ${remaining > 0 ? `
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-orange-100 text-orange-600 rounded-full font-bold">${remaining}</span>
              <span>MBLs ainda pendentes</span>
            </div>
            ` : ''}
          </div>
        `,
        confirmButtonColor: '#3085d6'
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro no Enriquecimento',
        text: 'Falha ao enriquecer containers. Tente novamente.',
        confirmButtonColor: '#d33'
      });
    } finally {
      setIsRunningEnrich(false);
    }
  };

  // Track/refresh containers (only stale ones - 4h threshold)
  const handleAdminTrack = async () => {
    if (!isAdmin) return;
    setIsRunningTrack(true);
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let remaining = 1;
    let iteration = 0;
    const maxIterations = 15;
    Swal.fire({
      title: 'Rastreando Containers',
      html: `
        <div class="text-left">
          <p class="mb-3">Atualizando status via API de rastreamento...</p>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div class="bg-cyan-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%" id="track-progress"></div>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center mt-3">
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-cyan-600" id="track-processed">0</div>
              <div class="text-xs text-gray-500">Processados</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-green-600" id="track-success">0</div>
              <div class="text-xs text-gray-500">Sucesso</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-red-600" id="track-errors">0</div>
              <div class="text-xs text-gray-500">Erros</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-orange-600" id="track-remaining">-</div>
              <div class="text-xs text-gray-500">Restantes</div>
            </div>
          </div>
          <p class="text-sm text-gray-500 mt-2" id="track-batch">Batch 0/${maxIterations}</p>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    try {
      while (remaining > 0 && iteration < maxIterations) {
        iteration++;
        const progressEl = document.getElementById('track-progress');
        const processedEl = document.getElementById('track-processed');
        const successEl = document.getElementById('track-success');
        const errorsEl = document.getElementById('track-errors');
        const remainingEl = document.getElementById('track-remaining');
        const batchEl = document.getElementById('track-batch');
        if (progressEl) progressEl.style.width = `${iteration / maxIterations * 100}%`;
        if (batchEl) batchEl.textContent = `Batch ${iteration}/${maxIterations}`;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=refresh_sea_tracking&batch_size=20&stale_hours=4&refresh_valid_hours=48`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        const result = await res.json();
        totalProcessed += result.processed || 0;
        totalSuccess += result.success || 0;
        totalErrors += result.errors || 0;
        remaining = result.remaining || 0;
        if (processedEl) processedEl.textContent = String(totalProcessed);
        if (successEl) successEl.textContent = String(totalSuccess);
        if (errorsEl) errorsEl.textContent = String(totalErrors);
        if (remainingEl) remainingEl.textContent = String(remaining);
        if (result.processed === 0) break;
      }
      await fetchMblData();
      const successRate = totalProcessed > 0 ? Math.round(totalSuccess / totalProcessed * 100) : 0;
      Swal.fire({
        icon: 'success',
        title: 'Rastreamento Concluído!',
        html: `
          <div class="text-left">
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-cyan-100 text-cyan-600 rounded-full font-bold">${totalProcessed}</span>
              <span>Containers processados</span>
            </div>
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-600 rounded-full font-bold">${successRate}%</span>
              <span>Taxa de sucesso</span>
            </div>
            ${totalErrors > 0 ? `
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-600 rounded-full font-bold">${totalErrors}</span>
              <span>Erros (timeout/API)</span>
            </div>
            ` : ''}
            ${remaining > 0 ? `
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-8 h-8 bg-orange-100 text-orange-600 rounded-full font-bold">${remaining}</span>
              <span>Containers ainda pendentes</span>
            </div>
            ` : ''}
          </div>
        `,
        confirmButtonColor: '#3085d6'
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro no Rastreamento',
        text: 'Falha ao rastrear containers. Tente novamente.',
        confirmButtonColor: '#d33'
      });
    } finally {
      setIsRunningTrack(false);
    }
  };

  // Force re-track ALL containers (ignores stale threshold)
  const handleAdminRetrack = async () => {
    if (!isAdmin) return;

    // Confirmação antes de iniciar
    const confirmResult = await Swal.fire({
      title: 'Re-rastrear Todos os Containers?',
      html: `
        <p class="text-gray-600">Esta ação irá forçar a atualização de <strong>todos</strong> os containers, independente do último rastreio.</p>
        <p class="text-orange-600 text-sm mt-2">⚠️ Este processo pode demorar vários minutos.</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sim, re-rastrear todos',
      cancelButtonText: 'Cancelar'
    });
    if (!confirmResult.isConfirmed) return;
    setIsRunningRetrack(true);
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let remaining = 1;
    let iteration = 0;
    const maxIterations = 30;
    const startTime = Date.now();
    Swal.fire({
      title: 'Re-rastreando Todos os Containers',
      html: `
        <div class="text-left">
          <p class="mb-3 text-orange-600 font-medium">⚠️ Forçando atualização completa...</p>
          <div class="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div class="bg-gradient-to-r from-orange-500 to-red-500 h-3 rounded-full transition-all duration-300" style="width: 0%" id="retrack-progress"></div>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center mt-3">
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-orange-600" id="retrack-processed">0</div>
              <div class="text-xs text-gray-500">Processados</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-green-600" id="retrack-success">0</div>
              <div class="text-xs text-gray-500">Sucesso</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-red-600" id="retrack-errors">0</div>
              <div class="text-xs text-gray-500">Erros</div>
            </div>
            <div class="bg-gray-100 rounded p-2">
              <div class="text-lg font-bold text-blue-600" id="retrack-remaining">-</div>
              <div class="text-xs text-gray-500">Restantes</div>
            </div>
          </div>
          <div class="flex justify-between text-sm text-gray-500 mt-3">
            <span id="retrack-batch">Batch 0/${maxIterations}</span>
            <span id="retrack-time">Tempo: 0s</span>
          </div>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    try {
      while (remaining > 0 && iteration < maxIterations) {
        iteration++;
        const progressEl = document.getElementById('retrack-progress');
        const processedEl = document.getElementById('retrack-processed');
        const successEl = document.getElementById('retrack-success');
        const errorsEl = document.getElementById('retrack-errors');
        const remainingEl = document.getElementById('retrack-remaining');
        const batchEl = document.getElementById('retrack-batch');
        const timeEl = document.getElementById('retrack-time');
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        if (timeEl) timeEl.textContent = `Tempo: ${elapsedSeconds}s`;
        if (batchEl) batchEl.textContent = `Batch ${iteration}/${maxIterations}`;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=refresh_sea_tracking&batch_size=20&stale_hours=0&refresh_valid_hours=0`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        const result = await res.json();
        totalProcessed += result.processed || 0;
        totalSuccess += result.success || 0;
        totalErrors += result.errors || 0;
        remaining = result.remaining || 0;

        // Calculate progress based on remaining vs total
        const initialRemaining = totalProcessed + remaining;
        const progressPct = initialRemaining > 0 ? totalProcessed / initialRemaining * 100 : iteration / maxIterations * 100;
        if (progressEl) progressEl.style.width = `${Math.min(progressPct, 100)}%`;
        if (processedEl) processedEl.textContent = String(totalProcessed);
        if (successEl) successEl.textContent = String(totalSuccess);
        if (errorsEl) errorsEl.textContent = String(totalErrors);
        if (remainingEl) remainingEl.textContent = String(remaining);
        if (result.processed === 0) break;
      }
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      const successRate = totalProcessed > 0 ? Math.round(totalSuccess / totalProcessed * 100) : 0;
      await fetchMblData();
      Swal.fire({
        icon: 'success',
        title: 'Re-rastreamento Concluído!',
        html: `
          <div class="text-left">
            <div class="bg-gray-100 rounded-lg p-3 mb-3">
              <div class="text-center">
                <div class="text-2xl font-bold text-green-600">${totalProcessed}</div>
                <div class="text-sm text-gray-500">containers re-rastreados em ${totalTime}s</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full text-sm font-bold">${successRate}%</span>
                <span class="text-sm">Taxa de sucesso</span>
              </div>
              ${totalErrors > 0 ? `
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-600 rounded-full text-sm font-bold">${totalErrors}</span>
                <span class="text-sm">Erros</span>
              </div>
              ` : ''}
            </div>
            ${remaining > 0 ? `
            <div class="mt-3 p-2 bg-orange-50 rounded text-sm text-orange-700">
              ⚠️ ${remaining} containers ainda pendentes (limite de batches atingido)
            </div>
            ` : ''}
          </div>
        `,
        confirmButtonColor: '#3085d6'
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro no Re-rastreamento',
        text: 'Falha ao re-rastrear containers. Tente novamente.',
        confirmButtonColor: '#d33'
      });
    } finally {
      setIsRunningRetrack(false);
    }
  };

  // Refresh all vessel IMOs by searching via vessel name (vessel/finder)
  const handleAdminRefreshImos = async () => {
    if (!isAdmin) return;
    const confirmResult = await Swal.fire({
      title: 'Atualizar IMOs dos Navios?',
      html: `
        <p class="text-gray-600">Esta ação irá buscar a IMO correta de cada navio pelo <strong>nome</strong>, usando a API vessel/finder.</p>
        <p class="text-blue-600 text-sm mt-2">ℹ️ IMOs incorretas serão corrigidas automaticamente.</p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sim, atualizar IMOs',
      cancelButtonText: 'Cancelar'
    });
    if (!confirmResult.isConfirmed) return;
    setIsRunningImoRefresh(true);
    Swal.fire({
      title: 'Atualizando IMOs dos Navios',
      html: `
        <div class="text-left">
          <p class="mb-3">Buscando IMOs pelo nome de cada navio...</p>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 h-2.5 rounded-full animate-pulse" style="width: 50%"></div>
          </div>
          <p class="text-sm text-gray-500">Isso pode levar alguns minutos...</p>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=refresh_all_vessel_imos`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await res.json();
      await fetchMblData();
      Swal.fire({
        icon: 'success',
        title: 'IMOs Atualizadas!',
        html: `
          <div class="text-left">
            <div class="bg-gray-100 rounded-lg p-3 mb-3">
              <div class="text-center">
                <div class="text-2xl font-bold text-indigo-600">${result.updated || 0}</div>
                <div class="text-sm text-gray-500">IMOs corrigidas</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-bold">${result.total || 0}</span>
                <span>Total analisados</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-600 rounded-full text-sm font-bold">${result.unchanged || 0}</span>
                <span>Sem alteração</span>
              </div>
            </div>
            ${result.errors > 0 ? `
            <div class="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
              ⚠️ ${result.errors} erros durante o processo
            </div>
            ` : ''}
            ${result.changes && result.changes.length > 0 ? `
            <div class="mt-3 max-h-32 overflow-y-auto text-xs">
              <div class="font-medium text-gray-700 mb-1">Principais correções:</div>
              ${result.changes.slice(0, 5).map((c: any) => `
                <div class="text-gray-600">• ${c.vessel}: ${c.old_imo || 'vazio'} → ${c.new_imo}</div>
              `).join('')}
            </div>
            ` : ''}
          </div>
        `,
        confirmButtonColor: '#3085d6'
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro ao Atualizar IMOs',
        text: 'Falha ao processar atualização. Tente novamente.',
        confirmButtonColor: '#d33'
      });
    } finally {
      setIsRunningImoRefresh(false);
    }
  };

  // Export maritime MBLs from last 2 months to Excel (admin only)
  const handleExportExcel = async () => {
    if (!isAdmin) return;
    setIsExportingExcel(true);
    
    toast({
      title: "Exportando Excel...",
      description: "Aguarde enquanto geramos o arquivo.",
    });

    try {
      const result = await exportSeaMblsToExcel();
      
      if (result.success) {
        toast({
          title: "Exportação concluída!",
          description: `${result.count} MBLs exportados para ${result.filename}`,
        });
      } else {
        toast({
          title: "Erro na exportação",
          description: result.error || "Falha ao exportar dados",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Erro na exportação",
        description: "Falha inesperada ao exportar dados",
        variant: "destructive",
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    const interval = setInterval(() => {
      console.log('[AutoSync] 12-hour interval triggered');
      runAutoSync();
    }, TWELVE_HOURS_MS);
    return () => clearInterval(interval);
  }, [user, runAutoSync]);

  // Delete MBL from tracking
  const handleDeleteMbl = async (mbl_id: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olimpo-proxy?action=delete_sea_tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mbl_id
        })
      });
      const result = await res.json();
      if (result.success) {
        toast({
          title: "MBL removido",
          description: "MBL removido do monitoramento."
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-container-status-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
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
          preserve_original_status: true // Sempre usar nomenclatura original do rastreio
        })
      });
      const result = await res.json();
      if (result.success) {
        toast({
          title: "E-mail enviado",
          description: `E-mail enviado para ${result.sent_to}`
        });
        setEmailModalOpen(false);
      } else {
        toast({
          title: "Erro ao enviar e-mail",
          description: result.error || "Falha no envio",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error sending email:", error);
      toast({
        title: "Erro",
        description: "Falha ao enviar e-mail",
        variant: "destructive"
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
    let mbls = mblList.filter(m => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || m.mbl_id.toLowerCase().includes(searchLower) || m.consignee && m.consignee.toLowerCase().includes(searchLower) || m.shipping_line && m.shipping_line.toLowerCase().includes(searchLower) || m.navio && m.navio.toLowerCase().includes(searchLower);
      const armador = getShippingLineFromMbl(m.mbl_id, m.shipping_line);
      const matchesLine = filterLine === "all" || armador === filterLine;
      const matchesCoordenador = filterCoordenador === "all" || (m.nome_analista || "-") === filterCoordenador;
      let matchesCardFilter = true;
      if (activeCardFilter === "transito") {
        matchesCardFilter = isEmTransito(m.last_event) && !isEntregue(m.last_event) && !isEmAlerta(m.last_event, m.is_eta_delayed) && !isEmCritico(m.is_critico);
      } else if (activeCardFilter === "alerta") {
        matchesCardFilter = isEmAlerta(m.last_event, m.is_eta_delayed) && !isEmCritico(m.is_critico);
      } else if (activeCardFilter === "critico") {
        matchesCardFilter = isEmCritico(m.is_critico);
      } else if (activeCardFilter === "entregues") {
        matchesCardFilter = isEntregue(m.last_event);
      }
      const matchesTipoProcesso = filterTipoProcesso === "all" || m.tipo_processo === filterTipoProcesso;
      return matchesSearch && matchesLine && matchesCardFilter && matchesTipoProcesso && matchesCoordenador;
    });
    
    // Ordenar: MBLs com status "Aguardando" (AGD) por último
    mbls.sort((a, b) => {
      const statusA = getReportStatus(a.last_event);
      const statusB = getReportStatus(b.last_event);
      if (statusA.code === 'AGD' && statusB.code !== 'AGD') return 1;
      if (statusA.code !== 'AGD' && statusB.code === 'AGD') return -1;
      return 0;
    });
    
    return mbls;
  }, [mblList, searchTerm, filterLine, filterCoordenador, activeCardFilter, filterTipoProcesso]);
  const totalPages = Math.ceil(filteredMbls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentMbls = filteredMbls.slice(startIndex, endIndex);

  // Dashboard stats
  const stats = useMemo(() => {
    const total = mblList.length;
    const criticos = mblList.filter(m => isEmCritico(m.is_critico)).length;
    const emTransito = mblList.filter(m => isEmTransito(m.last_event) && !isEntregue(m.last_event) && !isEmAlerta(m.last_event, m.is_eta_delayed) && !isEmCritico(m.is_critico)).length;
    const emAlerta = mblList.filter(m => isEmAlerta(m.last_event, m.is_eta_delayed) && !isEmCritico(m.is_critico)).length;
    const entregues = mblList.filter(m => isEntregue(m.last_event)).length;
    return {
      total,
      emTransito,
      emAlerta,
      criticos,
      entregues
    };
  }, [mblList]);

  // Lista fixa de todos os armadores mapeados (exceto UNKNOWN)
  const allArmadores = useMemo(() => {
    return getAllShippingLines()
      .map(info => info.name)
      .sort((a, b) => a.localeCompare(b));
  }, []);

  // Dynamic list of coordenadores
  const dynamicCoordenadores = useMemo(() => {
    const coordenadoresSet = new Set<string>();
    mblList.forEach(m => {
      const coordenador = m.nome_analista || "-";
      coordenadoresSet.add(coordenador);
    });
    return Array.from(coordenadoresSet).sort((a, b) => {
      if (a === "-") return 1;
      if (b === "-") return -1;
      return a.localeCompare(b);
    });
  }, [mblList]);

  // Get auto sync status label
  const getAutoSyncLabel = () => {
    switch (autoSyncStatus) {
      case 'sync':
        return 'Sincronizando MBLs...';
      case 'enrich':
        return 'Enriquecendo containers...';
      case 'track':
        return 'Rastreando containers...';
      case 'imo':
        return 'Buscando IMOs...';
      default:
        return null;
    }
  };
  if (isLoading) {
    return <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Carregando...</p>
      </div>;
  }
  return <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0" style={{
        backgroundImage: `url(${dachserBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }} />
        <div className="absolute inset-0" style={{
        background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))'
      }} />
        <div className="absolute inset-0" style={{
        background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `
      }} />
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => <div key={`line-${i}`} className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10" style={{
          left: `${15 + i * 14}%`,
          transform: `skewX(${-20 + i * 8}deg)`
        }} />)}
        </div>
        {[...Array(20)].map((_, i) => <div key={`particle-${i}`} className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float" style={{
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 5}s`,
        animationDuration: `${4 + Math.random() * 4}s`
      }} />)}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-[18px]">
          <button onClick={() => navigate("/dashboard")} className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all">
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
            @{loggedUsername || "usuário"}
          </div>
          
          <button onClick={() => navigate("/sea/tracking/notificacoes")} className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition" title="Regras de Notificação">
            <Bell className="w-4 h-4" />
          </button>
          <button onClick={() => navigate("/sea/tracking/manual")} className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition" title="Ajuda">
            <HelpCircle className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]" title="Rastreio de Containers">
            <Ship className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">

        {/* Dashboard Cards */}
        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className={`bg-card/90 border-border backdrop-blur-sm shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "all" ? "ring-2 ring-primary" : ""}`} onClick={() => {
          setActiveCardFilter("all");
          setCurrentPage(1);
        }}>
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

          <Card className={`bg-gradient-to-br from-blue-900/40 via-blue-900/10 to-card border-blue-700/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "transito" ? "ring-2 ring-blue-400" : ""}`} onClick={() => {
          setActiveCardFilter("transito");
          setCurrentPage(1);
        }}>
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

          <Card className={`bg-gradient-to-br from-primary/30 via-primary/10 to-card border-primary/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "alerta" ? "ring-2 ring-primary" : ""}`} onClick={() => {
          setActiveCardFilter("alerta");
          setCurrentPage(1);
        }}>
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
                <span className="text-xs text-primary/80">Atraso 3-6 dias</span>
              </div>
            </div>
          </Card>

          <Card className={`bg-gradient-to-br from-red-900/50 via-red-900/20 to-card border-red-600/60 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "critico" ? "ring-2 ring-red-500" : ""}`} onClick={() => {
          setActiveCardFilter("critico");
          setCurrentPage(1);
        }}>
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-red-300">
                  Crítico
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-900/60 text-red-400 animate-pulse">
                  <Clock className="w-4 h-4" />
                </span>
              </div>
              <div className="flex items-end justify-between mt-auto">
                <span className="text-3xl font-semibold text-red-400">
                  {stats.criticos}
                </span>
                <span className="text-xs text-red-300/80">Atraso ≥ 7 dias</span>
              </div>
            </div>
          </Card>

          <Card className={`bg-gradient-to-br from-green-900/40 via-green-900/10 to-card border-green-700/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeCardFilter === "entregues" ? "ring-2 ring-green-400" : ""}`} onClick={() => {
          setActiveCardFilter("entregues");
          setCurrentPage(1);
        }}>
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
        <section className="rounded-2xl p-4" style={{
        background: 'rgba(5,6,18,.9)',
        border: '1px solid rgba(255,255,255,.12)',
        boxShadow: '0 18px 40px rgba(0,0,0,.85)'
      }}>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#aaaaaa]" />
              <input type="text" placeholder="Buscar por MBL, Consignee, Armador ou Navio" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-9 w-full pl-10 pr-4 rounded-full border border-[rgba(255,255,255,.14)] bg-[#13141a] text-[#f5f5f5] text-[0.78rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,.8)]" />
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <Ship className="h-3 w-3 text-[#ffc800]" />
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Tipo</span>
                  </div>
                  <Select value={filterTipoProcesso} onValueChange={v => setFilterTipoProcesso(v as "all" | "SEA IMPORT" | "SEA EXPORT")}>
                    <SelectTrigger className="h-8 w-[140px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="SEA IMPORT">Importação</SelectItem>
                      <SelectItem value="SEA EXPORT">Exportação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
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
                      {allArmadores.map(armador => <SelectItem key={armador} value={armador}>
                          {armador}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">👤</span>
                    <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Coordenador</span>
                  </div>
                  <Select value={filterCoordenador} onValueChange={setFilterCoordenador}>
                    <SelectTrigger className="h-8 w-[160px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {dynamicCoordenadores.map(coordenador => <SelectItem key={coordenador} value={coordenador}>
                          {coordenador}
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Auto Sync Status Indicator */}
                {autoSyncStatus && <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(255,200,0,.1)] border border-[rgba(255,200,0,.3)]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ffc800]" />
                    <span className="text-xs text-[#ffc800]">{getAutoSyncLabel()}</span>
                  </div>}
                
                {/* Last Sync Time */}
                {lastAutoSync && !autoSyncStatus && <div className="text-xs text-[#666]">
                    Última sincronização: {lastAutoSync.toLocaleTimeString('pt-BR')}
                  </div>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Admin-only action buttons */}
                {isAdmin && <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={handleAdminSync} disabled={isRunningSync || !!autoSyncStatus} className="h-8 px-3 rounded-full bg-[rgba(59,130,246,.2)] text-blue-400 text-[0.7rem] font-medium flex items-center gap-1.5 border border-blue-500/30 hover:bg-[rgba(59,130,246,.3)] transition disabled:opacity-50">
                            {isRunningSync ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                            Sync
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Sincronizar novos MBLs do banco (t_master_dados)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={handleAdminEnrich} disabled={isRunningEnrich || !!autoSyncStatus} className="h-8 px-3 rounded-full bg-[rgba(16,185,129,.2)] text-emerald-400 text-[0.7rem] font-medium flex items-center gap-1.5 border border-emerald-500/30 hover:bg-[rgba(16,185,129,.3)] transition disabled:opacity-50">
                            {isRunningEnrich ? <Loader2 className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />}
                            Enrich
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Buscar containers para cada MBL via API</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={handleAdminTrack} disabled={isRunningTrack || !!autoSyncStatus} className="h-8 px-3 rounded-full bg-[rgba(139,92,246,.2)] text-violet-400 text-[0.7rem] font-medium flex items-center gap-1.5 border border-violet-500/30 hover:bg-[rgba(139,92,246,.3)] transition disabled:opacity-50">
                            {isRunningTrack ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radar className="w-3 h-3" />}
                            Track
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Atualizar status dos containers (apenas desatualizados)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={handleAdminRetrack} disabled={isRunningRetrack || !!autoSyncStatus} className="h-8 px-3 rounded-full bg-[rgba(239,68,68,.2)] text-red-400 text-[0.7rem] font-medium flex items-center gap-1.5 border border-red-500/30 hover:bg-[rgba(239,68,68,.3)] transition disabled:opacity-50">
                            {isRunningRetrack ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            Re-Track
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Forçar re-rastreio de TODOS os containers</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={handleAdminRefreshImos} disabled={isRunningImoRefresh || !!autoSyncStatus} className="h-8 px-3 rounded-full bg-[rgba(99,102,241,.2)] text-indigo-400 text-[0.7rem] font-medium flex items-center gap-1.5 border border-indigo-500/30 hover:bg-[rgba(99,102,241,.3)] transition disabled:opacity-50">
                            {isRunningImoRefresh ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ship className="w-3 h-3" />}
                            Fix IMO
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Corrigir IMOs buscando pelo nome do navio</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={handleExportExcel} disabled={isExportingExcel || !!autoSyncStatus} className="h-8 px-3 rounded-full bg-[rgba(245,124,0,.2)] text-orange-400 text-[0.7rem] font-medium flex items-center gap-1.5 border border-orange-500/30 hover:bg-[rgba(245,124,0,.3)] transition disabled:opacity-50">
                            {isExportingExcel ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
                            Export Excel
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Exportar MBLs marítimos (últimos 2 meses) para Excel</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <div className="w-px h-6 bg-[rgba(255,255,255,.15)]" />
                  </>}
                
                <button onClick={() => setFreeTimeDialogOpen(true)} className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]">
                  <Clock className="w-3.5 h-3.5" />
                  Registrar FT
                </button>
                <button onClick={handleRefresh} disabled={isRefreshing} className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)] disabled:opacity-50">
                  {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Atualizar
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* MBL Table */}
        <section className="rounded-2xl overflow-hidden" style={{
        background: 'rgba(5,6,18,.9)',
        border: '1px solid rgba(255,255,255,.12)',
        boxShadow: '0 18px 40px rgba(0,0,0,.85)'
      }}>
          {filteredMbls.length > 0 ? <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[rgba(0,0,0,.4)] border-b border-[rgba(255,255,255,.08)]">
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">MBL</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Consignee</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Coordenador</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Armador</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Origem</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Escala</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Destino</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium min-w-[180px]">Timeline</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Status</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Situação</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMbls.map((mbl, idx) => {
                  const reportStatus = getReportStatus(mbl.last_event);
                  const statusCode = reportStatus.code;
                  const progress = getTimelineProgress(mbl.last_event);
                  const statusColor = reportStatus.color;
                  const isExpanded = expandedMbl === mbl.mbl_id;
                  return <Fragment key={`${mbl.mbl_id}-${idx}`}>
                          <tr className="border-b border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.03)] transition">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[#f5f5f5] font-mono text-sm">{mbl.mbl_id}</span>
                                {!mbl.has_free_time && <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-help whitespace-nowrap">
                                          <Clock className="w-3 h-3" />
                                          Sem FT
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Este MBL não possui Free Time cadastrado</p>
                                        <p className="text-xs text-muted-foreground">Clique em "Registrar FT" para cadastrar</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>}
                              </div>
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
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[#aaaaaa] text-sm cursor-help">
                                      {abbreviateName(mbl.nome_analista || "-")}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{mbl.nome_analista || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-[rgba(255,200,0,.15)] text-[#ffc800] border border-[rgba(255,200,0,.3)]">
                                {getShippingLineFromMbl(mbl.mbl_id, mbl.shipping_line)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#aaaaaa] text-sm">{mbl.origem || "-"}</td>
                            <td className="px-4 py-3 text-[#aaaaaa] text-sm">
                              {mbl.transshipment_port ? <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-[rgba(249,115,22,.15)] text-orange-400 border border-[rgba(249,115,22,.3)] cursor-help">
                                        {mbl.transshipment_port.length > 15 ? mbl.transshipment_port.substring(0, 15) + "..." : mbl.transshipment_port}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Porto de transbordo: {mbl.transshipment_port}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider> : <span className="text-[#666]">—</span>}
                            </td>
                            <td className="px-4 py-3 text-[#aaaaaa] text-sm">{mbl.destino || "-"}</td>
                            <td className="px-3 py-3 min-w-[280px]">
                              <div className="relative h-1.5 w-full flex items-center">
                                <div className="absolute inset-0 bg-gray-800/50 rounded-full" />
                                <div className="absolute left-0 h-full rounded-l-full transition-all duration-700 ease-out" style={{
                            width: `${progress}%`,
                            background: `linear-gradient(90deg, ${statusColor}80 0%, ${statusColor} 100%)`,
                            borderTopRightRadius: progress === 100 ? "9999px" : "0",
                            borderBottomRightRadius: progress === 100 ? "9999px" : "0",
                            boxShadow: `0 0 12px ${statusColor}60`
                          }} />
                                <TooltipProvider>
                                  {TIMELINE_STAGES.map(stage => <Tooltip key={stage.label}>
                                      <TooltipTrigger asChild>
                                        <div className={`absolute w-1.5 h-1.5 rounded-full shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform ${progress >= stage.position ? 'bg-white/90' : 'bg-white/40'}`} style={{
                                  left: stage.position === 0 ? '0%' : stage.position === 100 ? 'auto' : `${stage.position}%`,
                                  right: stage.position === 100 ? '0%' : 'auto'
                                }} />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs font-medium">{stage.label}</p>
                                        <p className="text-xs text-muted-foreground">{stage.statuses.join(', ')}</p>
                                      </TooltipContent>
                                    </Tooltip>)}
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 ease-out z-20 cursor-pointer" style={{
                                  left: `${progress}%`
                                }}>
                                        <Ship className="w-4 h-4" style={{
                                    color: statusColor,
                                    fill: statusColor,
                                    filter: `drop-shadow(0 0 4px ${statusColor}) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))`
                                  }} />
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
                                    <span className="text-sm font-bold px-2 py-1 rounded-md cursor-help" style={{
                                color: statusColor,
                                backgroundColor: `${statusColor}20`
                              }}>
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
                            <td className="px-3 py-3 text-center">
                              {(() => {
                          const critico = isEmCritico(mbl.is_critico);
                          const emAtraso = isEmAlerta(mbl.last_event, mbl.is_eta_delayed);
                          if (critico) {
                            return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-600/30 text-red-400 border border-red-500/50 animate-pulse">
                                      <Clock className="w-3 h-3" />
                                      CRÍTICO ({mbl.dias_atraso}d)
                                    </span>;
                          } else if (emAtraso) {
                            return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                                      <AlertTriangle className="w-3 h-3" />
                                      Em Atraso
                                    </span>;
                          } else {
                            return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                                      <Check className="w-3 h-3" />
                                      No Prazo
                                    </span>;
                          }
                        })()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleToggleExpand(mbl.mbl_id)} className="h-8 w-8 text-[#ffc800] hover:text-[#ffdc50] hover:bg-[rgba(255,200,0,.1)]">
                                        <Package className="h-4 w-4" />
                                        {isExpanded ? <ChevronUp className="h-3 w-3 absolute -bottom-0.5 -right-0.5" /> : <ChevronDown className="h-3 w-3 absolute -bottom-0.5 -right-0.5" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Ver {mbl.container_count} container(s)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {isAdmin && <>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" onClick={() => handleOpenEmailModal(mbl)} className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
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
                                          <Button variant="ghost" size="icon" onClick={() => handleDeleteMbl(mbl.mbl_id)} className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10">
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">Remover MBL do monitoramento</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </>}
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded containers row */}
                          {isExpanded && <tr className="bg-[rgba(0,0,0,.3)]">
                              <td colSpan={9} className="px-4 py-4">
                                {loadingContainers ? <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#ffc800]" />
                                    <span className="ml-2 text-[#aaaaaa]">Carregando containers...</span>
                                  </div> : <div className="space-y-4">
                                    <div className="text-xs text-[#aaaaaa] uppercase tracking-wide mb-2 flex items-center gap-2">
                                      <Package className="w-4 h-4" />
                                      Containers do MBL {mbl.mbl_id}
                                    </div>
                                    
                                    {/* VesselFinder Map - Ocultar após descarga (DCH) */}
                                    {shouldShowVesselMap(mbl.last_event) && <VesselFinderMap vesselName={vesselName} imo={vesselImo} height={300} />}
                                    {!shouldShowVesselMap(mbl.last_event) && <div className="bg-[rgba(0,0,0,.3)] border border-[rgba(255,255,255,.1)] rounded-lg p-4 flex items-center justify-center text-[#888]">
                                        <Ship className="w-5 h-5 mr-2 opacity-50" />
                                        <span className="text-sm">Navio já descarregou - mapa não disponível</span>
                                      </div>}
                                    
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="text-[#666] text-xs uppercase">
                                            <th className="px-3 py-2 text-left">Container</th>
                                            <th className="px-3 py-2 text-left">Armador</th>
                                            <th className="px-3 py-2 text-left">Status</th>
                                            <th className="px-3 py-2 text-left">Último Evento</th>
                                            <th className="px-3 py-2 text-left">ETA</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {mblContainers.map(cnt => {
                                  const cntStatus = getReportStatus(cnt.last_event);
                                  return <tr key={cnt.id} className="border-t border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.02)]">
                                                <td className="px-3 py-2 font-mono text-[#f5f5f5]">{cnt.container}</td>
                                                <td className="px-3 py-2 text-[#aaaaaa]">{getShippingLineFromMbl(cnt.container, cnt.shipping_line)}</td>
                                                <td className="px-3 py-2">
                                                  <span className="text-xs font-bold px-2 py-0.5 rounded" style={{
                                        color: cntStatus.color,
                                        backgroundColor: `${cntStatus.color}20`
                                      }}>
                                                    {cntStatus.code}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 text-[#aaaaaa] max-w-[200px] truncate">
                                                  {cnt.last_event || "Aguardando..."}
                                                </td>
                                                <td className="px-3 py-2 text-[#aaaaaa]">
                                                  {cnt.eta ? new Date(cnt.eta).toLocaleDateString('pt-BR') : "-"}
                                                </td>
                                              </tr>;
                                })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>}
                              </td>
                            </tr>}
                        </Fragment>;
                })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[rgba(255,255,255,.08)]">
                <span className="text-xs text-[#666]">
                  Mostrando {startIndex + 1}-{Math.min(endIndex, filteredMbls.length)} de {filteredMbls.length} MBLs
                </span>
                <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
              </div>
            </> : <div className="flex flex-col items-center justify-center py-12 text-[#666]">
              <Ship className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg">Nenhum MBL encontrado</p>
              <p className="text-sm mt-1">Ajuste os filtros ou aguarde a sincronização</p>
            </div>}
        </section>
      </main>

      {/* Email Modal */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-md bg-[rgba(5,6,18,.98)] border border-[rgba(255,255,255,.12)]">
          <DialogHeader>
            <DialogTitle className="text-white">Enviar E-mail de Status</DialogTitle>
            <DialogDescription className="text-gray-400">
              Escolha o destinatário e envie um e-mail com o status atual do MBL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white">Destinatário:</Label>
              <RadioGroup value={emailType} onValueChange={v => setEmailType(v as "interno" | "cliente")} className="space-y-2">
                <div className="flex items-center space-x-3 p-3 rounded-lg border border-[rgba(255,255,255,.1)] hover:border-[#ffc800]/50 transition cursor-pointer">
                  <RadioGroupItem value="interno" id="interno" className="border-gray-500 text-[#ffc800]" />
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
              <Textarea id="customMessage" value={emailCustomMessage} onChange={e => setEmailCustomMessage(e.target.value)} placeholder="Adicione uma mensagem personalizada..." className="bg-[rgba(0,0,0,.3)] border-[rgba(255,255,255,.1)] text-white placeholder:text-gray-500 min-h-[80px]" />
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
            <Button variant="outline" onClick={() => setEmailModalOpen(false)} className="border-[rgba(255,255,255,.1)] text-gray-300 hover:bg-[rgba(255,255,255,.05)]">
              Cancelar
            </Button>
            <Button onClick={handleSendEmail} disabled={isSendingEmail} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSendingEmail ? <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </> : <>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar E-mail
                </>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Free Time Dialog */}
      <RegisterFreeTimeDialog open={freeTimeDialogOpen} onOpenChange={setFreeTimeDialogOpen} />
    </div>;
};
export default ContainerTracking;