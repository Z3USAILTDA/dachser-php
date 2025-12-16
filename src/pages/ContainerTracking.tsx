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

// Shipping lines
const shippingLines = [
  { code: "MAEU", name: "Maersk" },
  { code: "MSCU", name: "MSC" },
  { code: "CMAU", name: "CMA CGM" },
  { code: "COSU", name: "COSCO" },
  { code: "EGLV", name: "Evergreen" },
  { code: "HLCU", name: "Hapag-Lloyd" },
  { code: "ONEY", name: "ONE" },
  { code: "YMLU", name: "Yang Ming" },
  { code: "HDMU", name: "HMM" },
  { code: "ZIMU", name: "ZIM" },
];

// Status mapping for containers
const containerStatusMap: Record<string, string> = {
  "GATE_OUT_EMPTY": "Gate Out Vazio",
  "LOADED": "Carregado",
  "VESSEL_DEPARTED": "Navio Partiu",
  "IN_TRANSIT": "Em Trânsito",
  "TRANSSHIPMENT": "Transbordo",
  "VESSEL_ARRIVED": "Navio Chegou",
  "DISCHARGED": "Descarregado",
  "GATE_IN_FULL": "Gate In Cheio",
  "DELIVERED": "Entregue",
  "PENDING": "Pendente",
};

// Get status code from event
const getStatusCode = (lastEvent: string | null): string => {
  if (!lastEvent) return "AGUARDANDO";
  
  const upperEvent = lastEvent.toUpperCase();
  
  if (upperEvent.includes("DELIVERED") || upperEvent.includes("ENTREGUE")) return "DLV";
  if (upperEvent.includes("GATE_IN") || upperEvent.includes("GATE IN")) return "GIN";
  if (upperEvent.includes("DISCHARGED") || upperEvent.includes("DESCARREGADO")) return "DCH";
  if (upperEvent.includes("ARRIVED") || upperEvent.includes("CHEGOU")) return "ARR";
  if (upperEvent.includes("TRANSIT") || upperEvent.includes("TRÂNSITO")) return "TRA";
  if (upperEvent.includes("TRANSSHIPMENT") || upperEvent.includes("TRANSBORDO")) return "TSP";
  if (upperEvent.includes("DEPARTED") || upperEvent.includes("PARTIU")) return "DEP";
  if (upperEvent.includes("LOADED") || upperEvent.includes("CARREGADO")) return "LOD";
  if (upperEvent.includes("GATE_OUT") || upperEvent.includes("GATE OUT")) return "GOT";
  if (upperEvent.includes("BOOKING")) return "BKD";
  
  return lastEvent.substring(0, 3).toUpperCase();
};

// Timeline progress for container tracking
// Stages: BKD → GOT → LOD → DEP → TRA → ARR → DCH → GIN → DLV
const getTimelineProgress = (lastEvent: string | null): number => {
  if (!lastEvent) return 0;
  
  const statusCode = getStatusCode(lastEvent);
  
  const progressMap: Record<string, number> = {
    BKD: 0,
    GOT: 12,
    LOD: 25,
    DEP: 37,
    TRA: 50,
    TSP: 60,
    ARR: 75,
    DCH: 85,
    GIN: 92,
    DLV: 100,
    AGUARDANDO: 0,
  };
  
  return progressMap[statusCode] || 10;
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

const STORAGE_KEY = "tracked-containers";

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
  const { toast } = useToast();

  const itemsPerPage = 10;

  // Save containers to localStorage
  const saveToStorage = React.useCallback((containers: ContainerData[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(containers));
    setContainersList(containers);
  }, []);

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

  // Load containers from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setContainersList(parsed);
      } catch (e) {
        console.error("Error loading containers:", e);
      }
    }
  }, []);

  // Fetch containers data (placeholder - to be connected to actual data source)
  const fetchContainersData = React.useCallback(async () => {
    setIsLoadingData(true);
    try {
      // TODO: Implement actual data fetching from MariaDB
      // For now, using localStorage data
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setContainersList(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error fetching containers:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchContainersData();
    const interval = setInterval(fetchContainersData, 30000);
    return () => clearInterval(interval);
  }, [fetchContainersData]);

  const handleRefresh = async () => {
    toast({
      title: "Atualizando dados",
      description: "Buscando status dos containers...",
    });
    await fetchContainersData();
    toast({
      title: "Dados atualizados",
      description: "Status dos containers atualizado com sucesso.",
    });
  };

  const handleAddContainer = async () => {
    if (!containerNumber || !selectedLine || !consigneeName) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos para cadastrar o Container.",
        variant: "destructive",
      });
      return;
    }

    const newContainer: ContainerData = {
      id: Date.now().toString(),
      container: containerNumber.toUpperCase(),
      shipping_line: selectedLine,
      consignee_name: consigneeName,
      last_event: "Container cadastrado - Aguardando rastreio...",
      status: "PENDING",
      created_at: new Date().toISOString(),
    };

    const updatedList = [newContainer, ...containersList];
    saveToStorage(updatedList);

    toast({
      title: "Container cadastrado",
      description: "Container adicionado à lista de monitoramento.",
    });

    setContainerNumber("");
    setSelectedLine("");
    setConsigneeName("");
  };

  const handleDeleteContainer = (id: string) => {
    const updatedList = containersList.filter((c) => c.id !== id);
    saveToStorage(updatedList);

    toast({
      title: "Container removido",
      description: "Container removido da lista de monitoramento.",
    });
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
      return ["DEP", "TRA", "TSP"].includes(status);
    }).length;
    const chegando = containersList.filter((c) => {
      const status = getStatusCode(c.last_event);
      return ["ARR", "DCH"].includes(status);
    }).length;
    const entregues = containersList.filter((c) => {
      const status = getStatusCode(c.last_event);
      return ["DLV", "GIN"].includes(status);
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

              <button
                onClick={handleRefresh}
                className="h-8 px-4 rounded-full bg-[#ffc800] text-[#000] text-[0.75rem] font-medium flex items-center gap-1.5 hover:bg-[#ffdc50] transition shadow-[0_0_20px_rgba(255,200,0,.3)]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </button>
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
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">BL</th>
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
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Armador</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Origem</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Destino</th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium min-w-[180px]">Timeline</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Status</th>
                      <th className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">ETA</th>
                      <th
                        className="px-4 py-3 text-left text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium cursor-pointer select-none hover:text-[#ffc800] transition"
                        onClick={handleAnalystSort}
                      >
                        <span className="flex items-center gap-1">
                          Analista
                          {sortAnalyst === "asc" && <span className="text-[#ffc800]">↑</span>}
                          {sortAnalyst === "desc" && <span className="text-[#ffc800]">↓</span>}
                        </span>
                      </th>
                      <th className="px-4 py-3 text-center text-[#aaaaaa] uppercase text-[0.68rem] tracking-[0.1em] font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentContainers.map((container, idx) => {
                      const statusCode = getStatusCode(container.last_event);
                      const progress = getTimelineProgress(container.last_event);
                      
                      // Timeline colors based on status
                      let progressColor = "hsl(45 100% 50%)"; // gold
                      let shipColor = "#ffc800";
                      
                      if (["DLV", "GIN"].includes(statusCode)) {
                        progressColor = "hsl(120 100% 35%)";
                        shipColor = "#22c55e";
                      } else if (["ARR", "DCH"].includes(statusCode)) {
                        progressColor = "hsl(200 100% 50%)";
                        shipColor = "#3b82f6";
                      }

                      return (
                        <tr
                          key={container.id}
                          className="border-b border-[rgba(255,255,255,.05)] hover:bg-[rgba(255,255,255,.03)] transition"
                        >
                          <td className="px-4 py-3">
                            <span className="text-[#f5f5f5] font-mono text-sm">{container.container}</span>
                          </td>
                          <td className="px-4 py-3 text-[#aaaaaa] text-sm">{container.bl || "-"}</td>
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
                              {container.shipping_line}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#aaaaaa] text-sm">{container.origem || "-"}</td>
                          <td className="px-4 py-3 text-[#aaaaaa] text-sm">{container.destino || "-"}</td>
                          <td className="px-3 py-3">
                            {/* Timeline visualization */}
                            <div className="relative h-2 w-full rounded-full bg-[rgba(255,255,255,.1)]">
                              {/* Progress bar */}
                              <div
                                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${progress}%`,
                                  background: `linear-gradient(90deg, ${progressColor}80 0%, ${progressColor} 100%)`,
                                  boxShadow: `0 0 8px ${progressColor}60`,
                                }}
                              />

                              {/* Timeline dots */}
                              <TooltipProvider>
                                {/* BKD - 0% */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute left-0 w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">BKD - Booking</p></TooltipContent>
                                </Tooltip>

                                {/* LOD - 25% */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute left-1/4 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#666] shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">LOD - Carregado</p></TooltipContent>
                                </Tooltip>

                                {/* TRA - 50% */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#666] shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">TRA - Em Trânsito</p></TooltipContent>
                                </Tooltip>

                                {/* ARR - 75% */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute left-3/4 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#666] shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">ARR - Chegou</p></TooltipContent>
                                </Tooltip>

                                {/* DLV - 100% */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="absolute right-0 w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-sm z-10 cursor-pointer hover:scale-150 transition-transform" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">DLV - Entregue</p></TooltipContent>
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
                                    <p className="text-xs text-muted-foreground">{containerStatusMap[container.status] || container.last_event}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-sm font-bold" style={{ color: "hsl(120 100% 35%)" }}>
                              {statusCode}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#aaaaaa] text-sm">{container.eta || "-"}</td>
                          <td className="px-3 py-3 text-[#aaaaaa] text-sm uppercase">{container.nome_analista || "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteContainer(container.id)}
                              className="gap-1.5 text-red-400 hover:text-red-300 h-8 px-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
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
