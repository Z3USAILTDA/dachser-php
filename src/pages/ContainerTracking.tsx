import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUsageLog } from "@/hooks/useUsageLog";
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

// Detect armador from vessel name
const detectArmadorFromVessel = (vessel: string | null | undefined): string => {
  if (!vessel) return "-";
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
  
  return "-";
};

// Status mapping for containers (JSONCargo events)
const containerStatusMap: Record<string, string> = {
  // Pre-shipment
  "EMPTY_TO_SHIPPER": "Container Vazio p/ Exportador",
  "GATE_OUT_EMPTY": "Saída Vazio do Terminal",
  "EMPTY_PICK_UP": "Coleta do Container Vazio",
  // Loading
  "LOADED": "Carregado",
  "LOAD": "Carregado",
  "FULL_IN": "Entrada Cheio no Terminal",
  "GATE_IN_FULL": "Gate In Cheio",
  // Departure  
  "VESSEL_DEPARTED": "Navio Partiu",
  "DEPARTURE": "Partida",
  "DEPARTED": "Partiu",
  // Transit
  "IN_TRANSIT": "Em Trânsito",
  "ON_RAIL": "Em Trânsito Ferroviário",
  // Transshipment
  "TRANSSHIPMENT": "Transbordo",
  "TRANSSHIPMENT_DISCHARGED": "Descarregado p/ Transbordo",
  "TRANSSHIPMENT_LOADED": "Carregado p/ Transbordo",
  // Arrival
  "VESSEL_ARRIVED": "Navio Chegou",
  "ARRIVAL": "Chegada",
  "ARRIVED": "Chegou",
  // Discharge
  "DISCHARGED": "Descarregado",
  "DISCHARGE": "Descarregado",
  "FULL_OUT": "Saída Cheio do Terminal",
  // Delivery
  "GATE_OUT_FULL": "Gate Out Cheio",
  "DELIVERED": "Entregue",
  "DELIVERY": "Entrega",
  "EMPTY_RETURN": "Devolução Vazio",
  // Pending
  "PENDING": "Pendente",
  "BOOKED": "Reservado",
  "BOOKING": "Reserva Confirmada",
};

// Get status code from JSONCargo event
// Stages: L/C → ATD → AT SEA → ATA → T/S → ATA (final)
const getStatusCode = (lastEvent: string | null): string => {
  if (!lastEvent) return "AGD"; // Aguardando
  
  const upperEvent = lastEvent.toUpperCase().replace(/[_\s-]/g, "");
  
  // Delivery/Final (after final arrival)
  if (upperEvent.includes("DELIVERED") || upperEvent.includes("DELIVERY") || upperEvent.includes("EMPTYRETURN") ||
      upperEvent.includes("GATEOUTFULL") || upperEvent.includes("FULLOUT") ||
      upperEvent.includes("DISCHARGED") || upperEvent.includes("DISCHARGE")) return "ATA2";
  // Transshipment
  if (upperEvent.includes("TRANSSHIPMENT")) return "T/S";
  // Arrival (first arrival / intermediate)
  if (upperEvent.includes("ARRIVED") || upperEvent.includes("ARRIVAL") || upperEvent.includes("VESSELARRIVED")) return "ATA";
  // In transit / At Sea
  if (upperEvent.includes("TRANSIT") || upperEvent.includes("ONRAIL") || upperEvent.includes("ATSEA")) return "SEA";
  // Departure
  if (upperEvent.includes("DEPARTED") || upperEvent.includes("DEPARTURE") || upperEvent.includes("VESSELDEPARTED")) return "ATD";
  // Loaded
  if (upperEvent.includes("LOADED") || upperEvent.includes("LOAD") || upperEvent.includes("FULLIN") || upperEvent.includes("GATEINFULL")) return "L/C";
  // Pre-loading statuses
  if (upperEvent.includes("GATEOUTEMPTY") || upperEvent.includes("EMPTYPICKUP") || 
      upperEvent.includes("EMPTYTOSHIPPER") || upperEvent.includes("BOOKED") || upperEvent.includes("BOOKING") ||
      upperEvent.includes("PENDING")) return "AGD";
  
  return "AGD";
};

// Timeline progress for container tracking (JSONCargo stages)
// Stages: L/C → ATD → AT SEA → ATA → T/S → ATA (final)
const getTimelineProgress = (lastEvent: string | null): number => {
  if (!lastEvent) return 0;
  
  const statusCode = getStatusCode(lastEvent);
  
  const progressMap: Record<string, number> = {
    // Aguardando (pre-load)
    AGD: 0,
    // L/C - Loaded
    "L/C": 0,
    // ATD - Departed
    ATD: 20,
    // AT SEA - In Transit
    SEA: 40,
    // ATA - Arrived (first/intermediate)
    ATA: 60,
    // T/S - Transshiped
    "T/S": 80,
    // ATA2 - Final Arrival
    ATA2: 100,
  };
  
  return progressMap[statusCode] ?? 0;
};

// Get human-readable status description
const getStatusDescription = (lastEvent: string | null): string => {
  if (!lastEvent) return "Aguardando rastreio";
  
  // Check if we have a direct mapping
  const normalizedEvent = lastEvent.toUpperCase().replace(/\s+/g, "_");
  if (containerStatusMap[normalizedEvent]) {
    return containerStatusMap[normalizedEvent];
  }
  
  // Try to find partial match
  for (const [key, value] of Object.entries(containerStatusMap)) {
    if (normalizedEvent.includes(key.replace(/_/g, ""))) {
      return value;
    }
  }
  
  return lastEvent;
};

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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [containerNumber, setContainerNumber] = useState("");
  const [selectedLine, setSelectedLine] = useState("");
  const [consigneeName, setConsigneeName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLine, setFilterLine] = useState("all");
  const [filterAnalyst, setFilterAnalyst] = useState("all");
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
  const filteredContainers = useMemo(() => {
    let containers = containersList.filter((c) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        c.container.toLowerCase().includes(searchLower) ||
        (c.bl && c.bl.toLowerCase().includes(searchLower)) ||
        (c.consignee_name && c.consignee_name.toLowerCase().includes(searchLower)) ||
        (c.shipping_line && c.shipping_line.toLowerCase().includes(searchLower)) ||
        (c.nome_analista && c.nome_analista.toLowerCase().includes(searchLower));
      const matchesLine = filterLine === "all" || c.shipping_line === filterLine;
      const matchesAnalyst = filterAnalyst === "all" || c.nome_analista === filterAnalyst;

      return matchesSearch && matchesLine && matchesAnalyst;
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
  }, [containersList, searchTerm, filterLine, filterAnalyst, sortAnalyst, sortContainer, sortClient, sortLastCheck]);

  const totalPages = Math.ceil(filteredContainers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentContainers = filteredContainers.slice(startIndex, endIndex);

  // Dashboard stats
  const stats = useMemo(() => {
    const total = containersList.length;
    const emTransito = containersList.filter((c) => {
      const status = getStatusCode(c.last_event);
      return ["DEP", "TRA", "TSP", "LOD", "GOE"].includes(status);
    }).length;
    const chegando = containersList.filter((c) => {
      const status = getStatusCode(c.last_event);
      return ["ARR", "DCH", "GOF"].includes(status);
    }).length;
    const entregues = containersList.filter((c) => {
      const status = getStatusCode(c.last_event);
      return ["DLV"].includes(status);
    }).length;

    return { total, emTransito, chegando, entregues };
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

        {/* Dashboard Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div 
            className="p-4 rounded-2xl cursor-pointer transition-all hover:-translate-y-0.5"
            style={{
              background: 'rgba(5,6,18,.9)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 18px 40px rgba(0,0,0,.85)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Anchor className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Monitorados</p>
              </div>
            </div>
          </div>

          <div 
            className="p-4 rounded-2xl cursor-pointer transition-all hover:-translate-y-0.5"
            style={{
              background: 'rgba(5,6,18,.9)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 18px 40px rgba(0,0,0,.85)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Ship className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.emTransito}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Em Trânsito</p>
              </div>
            </div>
          </div>

          <div 
            className="p-4 rounded-2xl cursor-pointer transition-all hover:-translate-y-0.5"
            style={{
              background: 'rgba(5,6,18,.9)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 18px 40px rgba(0,0,0,.85)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Anchor className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.chegando}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Chegando</p>
              </div>
            </div>
          </div>

          <div 
            className="p-4 rounded-2xl cursor-pointer transition-all hover:-translate-y-0.5"
            style={{
              background: 'rgba(5,6,18,.9)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 18px 40px rgba(0,0,0,.85)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.entregues}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Entregues</p>
              </div>
            </div>
          </div>
        </div>

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
                          containersList
                            .map((c) => c.nome_analista)
                            .filter((name) => name && name !== "N/A" && name.trim() !== ""),
                        ),
                      )
                        .sort()
                        .map((analyst) => (
                          <SelectItem key={analyst} value={analyst!}>
                            {analyst}
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
                    </tr>
                  </thead>
                  <tbody>
                    {currentContainers.map((container, idx) => {
                      const statusCode = getStatusCode(container.last_event);
                      const progress = getTimelineProgress(container.last_event);
                      
                      // Timeline colors based on status
                      let progressColor = "hsl(45 100% 50%)"; // gold - default/in transit
                      let shipColor = "#ffc800";
                      
                      // Delivered - green
                      if (statusCode === "DLV") {
                        progressColor = "hsl(120 100% 35%)";
                        shipColor = "#22c55e";
                      }
                      // Arrived/Discharged/Gate Out Full - blue (near destination)
                      else if (["ARR", "DCH", "GOF"].includes(statusCode)) {
                        progressColor = "hsl(200 100% 50%)";
                        shipColor = "#3b82f6";
                      }
                      // Transshipment - amber/orange
                      else if (statusCode === "TSP") {
                        progressColor = "hsl(30 100% 50%)";
                        shipColor = "#f97316";
                      }

                      return (
                        <tr
                          key={container.id}
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
                              {detectArmadorFromVessel(container.vessel)}
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

                              {/* Timeline dots - 6 stages: L/C → ATD → AT SEA → ATA → T/S → ATA */}
                              <TooltipProvider>
                                {/* L/C - 0% (LOADED) */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute left-0 w-1.5 h-1.5 rounded-full bg-white/90 shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">L/C - LOADED</p></TooltipContent>
                                </Tooltip>

                                {/* ATD - 20% (DEPARTED) */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute w-1.5 h-1.5 rounded-full bg-white/70 shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" style={{ left: '20%' }} />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">ATD - DEPARTED</p></TooltipContent>
                                </Tooltip>

                                {/* AT SEA - 40% (IN_TRANSIT) */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute w-1.5 h-1.5 rounded-full bg-white/70 shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" style={{ left: '40%' }} />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">AT SEA - IN_TRANSIT</p></TooltipContent>
                                </Tooltip>

                                {/* ATA - 60% (ARRIVED) */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute w-1.5 h-1.5 rounded-full bg-white/70 shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" style={{ left: '60%' }} />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">ATA - ARRIVED</p></TooltipContent>
                                </Tooltip>

                                {/* T/S - 80% (TRANSSHIPED) */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute w-1.5 h-1.5 rounded-full bg-white/70 shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" style={{ left: '80%' }} />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">T/S - TRANSSHIPED</p></TooltipContent>
                                </Tooltip>

                                {/* ATA - 100% (ARRIVED Final) */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute right-0 w-1.5 h-1.5 rounded-full bg-white/90 shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">ATA - ARRIVED</p></TooltipContent>
                                </Tooltip>
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
                            <span 
                              className="text-sm font-bold px-2 py-1 rounded-md"
                              style={{ 
                                color: shipColor,
                                backgroundColor: `${shipColor}20`,
                              }}
                            >
                              {statusCode}
                            </span>
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
