import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mail,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
  ExternalLink,
  Database,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import dachserBg from "@/assets/dachser-background.jpg";

// Components
import { TrackingStatsCards } from "@/components/tracking/TrackingStatsCards";
import { TrackingFilters } from "@/components/tracking/TrackingFilters";
import { TrackingDetailsSidebar } from "@/components/tracking/TrackingDetailsSidebar";
import { LogModal, EmailModal, EmailHistoryModal, RemarkModal } from "@/components/tracking/TrackingModals";

// Types & Utils
import {
  DhlAwbTracking,
  DashboardStats,
  LogData,
  EmailHistory,
  ColumnVisibility,
  AlertCategory,
  COLUMN_LABELS,
  DEFAULT_COLUMN_VISIBILITY,
  ITEMS_PER_PAGE,
} from "@/components/tracking/TrackingTypes";
import {
  getFormattedTrackingLink,
  getBugAlertColor,
  getBugAlertDescription,
  getAlertCategory,
  getStatusBadgeColor,
  getStatusLabel,
  getStatusTextColor,
  formatDateTime,
  formatDate,
  formatAwbForDisplay,
} from "@/components/tracking/TrackingUtils";

// Type assertion for external tables not in Supabase types
const db = supabase as any;

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Stats & Data
  const [stats, setStats] = useState<DashboardStats>({
    total_awbs: 0,
    active_awbs: 0,
    alert_awbs: 0,
    critical_awbs: 0,
  });
  const [awbs, setAwbs] = useState<DhlAwbTracking[]>([]);
  const [analysts, setAnalysts] = useState<string[]>([]);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [analystFilter, setAnalystFilter] = useState<string>("all");
  const [alertFilter, setAlertFilter] = useState<AlertCategory | "all">("all");
  const [emailFilter, setEmailFilter] = useState<"all" | "email_enabled" | "email_disabled">("all");

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof DhlAwbTracking>("awb");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Column Visibility
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("columnVisibility");
      return saved ? JSON.parse(saved) : DEFAULT_COLUMN_VISIBILITY;
    }
    return DEFAULT_COLUMN_VISIBILITY;
  });

  // Selection & Details
  const [selectedAwb, setSelectedAwb] = useState<DhlAwbTracking | null>(null);
  const [bugAlertExplication, setBugAlertExplication] = useState<string | null>(null);

  // Loading States
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingAwb, setIsUpdatingAwb] = useState<string | null>(null);

  // Log Modal
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logData, setLogData] = useState<LogData[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);

  // Email Modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedAwbForEmail, setSelectedAwbForEmail] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [isEmailSending, setIsEmailSending] = useState(false);

  // Email History Modal
  const [isEmailHistoryModalOpen, setIsEmailHistoryModalOpen] = useState(false);
  const [emailHistory, setEmailHistory] = useState<EmailHistory[]>([]);
  const [isEmailHistoryLoading, setIsEmailHistoryLoading] = useState(false);

  // Remark Modal
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [currentRemarkAwb, setCurrentRemarkAwb] = useState<string | null>(null);
  const [currentRemarkText, setCurrentRemarkText] = useState("");

  // Console Log
  const [consoleLog, setConsoleLog] = useState<string[]>([]);
  const logToConsole = (message: string) => {
    setConsoleLog((prev) => [message, ...prev].slice(0, 50));
    console.log(message);
  };

  // Fetch Dashboard Data
  const fetchDashboardData = async () => {
    const { data, error } = await db
      .from("dhl_awb_tracking")
      .select("*");

    if (error) {
      console.error("Error fetching dashboard data:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar os dados do dashboard.",
        variant: "destructive",
      });
      return;
    }

    const total_awbs = data.length;
    const active_awbs = data.filter(
      (awb: DhlAwbTracking) =>
        awb.status === "EM ANDAMENTO" || (awb.days_in_transit !== null && awb.days_in_transit > 0)
    ).length;
    const alert_awbs = data.filter(
      (awb: DhlAwbTracking) =>
        awb.status === "ALERTA" || (awb.days_in_transit !== null && awb.days_in_transit > 10)
    ).length;
    const critical_awbs = data.filter(
      (awb: DhlAwbTracking) =>
        awb.bug_alert || (awb.days_in_transit !== null && awb.days_in_transit > 15) || (awb.nfd_counter !== null && awb.nfd_counter > 2)
    ).length;

    setStats({ total_awbs, active_awbs, alert_awbs, critical_awbs });
    setAwbs(data);

    const analystNames: string[] = Array.from(
      new Set(data.map((awb: DhlAwbTracking) => awb.analyst).filter((a: string | null): a is string => a !== null))
    ) as string[];
    setAnalysts(analystNames);
  };

  const refreshDashboard = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("https://udlog.z3us.ai/auto-trigger-dhl-tracking", { method: "GET" });
      if (!response.ok) throw new Error("Failed to trigger DHL tracking update");
      toast({ title: "Atualização em andamento", description: "A atualização do rastreio foi iniciada." });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await fetchDashboardData();
    } catch (error: any) {
      console.error("Error refreshing dashboard:", error);
      toast({ title: "Erro ao atualizar", description: "Não foi possível atualizar os dados do rastreio.", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("columnVisibility", JSON.stringify(columnVisibility));
    }
  }, [columnVisibility]);

  useEffect(() => {
    if (selectedAwb) {
      setBugAlertExplication(getBugAlertDescription(selectedAwb));
    } else {
      setBugAlertExplication(null);
    }
  }, [selectedAwb]);

  // Filter & Sort Logic
  const filteredAwbs = awbs.filter((awb) => {
    const matchesSearch =
      awb.awb?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      awb.consignee?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      awb.customer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      awb.consignee_email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAnalyst = analystFilter === "all" || awb.analyst === analystFilter;

    const matchesAlert =
      alertFilter === "all" ||
      (alertFilter === "on_time" && !awb.bug_alert && (awb.days_in_transit ?? 0) <= 10 && (awb.nfd_counter ?? 0) <= 2 && awb.status !== "ALERTA" && awb.status !== "DELAYED") ||
      (alertFilter === "delayed" && !awb.bug_alert && ((awb.days_in_transit ?? 0) > 10 || (awb.nfd_counter ?? 0) > 2 || awb.status === "ALERTA" || awb.status === "DELAYED")) ||
      (alertFilter === "critical" && (awb.bug_alert || (awb.days_in_transit ?? 0) > 15 || (awb.nfd_counter ?? 0) > 2));

    const matchesEmailFilter =
      emailFilter === "all" ||
      (emailFilter === "email_enabled" && awb.email_alert) ||
      (emailFilter === "email_disabled" && !awb.email_alert);

    return matchesSearch && matchesAnalyst && matchesAlert && matchesEmailFilter;
  });

  const sortedAwbs = [...filteredAwbs].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedAwbs.length / ITEMS_PER_PAGE);
  const paginatedAwbs = sortedAwbs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handlePageChange = (direction: "prev" | "next") => {
    if (direction === "prev" && currentPage > 1) setCurrentPage((prev) => prev - 1);
    else if (direction === "next" && currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handleSort = (field: keyof DhlAwbTracking) => {
    if (sortField === field) setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  };

  const handleAwbClick = (awb: DhlAwbTracking) => {
    setSelectedAwb(awb);
    setBugAlertExplication(getBugAlertDescription(awb));
  };

  // Column Visibility Handlers
  const handleToggleColumn = (column: keyof ColumnVisibility) => {
    setColumnVisibility((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const handleResetColumns = () => setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);

  // Toggle Handlers
  const handleEmailToggle = async (awbNumber: string, currentValue: boolean | undefined) => {
    const newValue = !currentValue;
    const confirmed = window.confirm(`Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} os envios de email para a AWB ${awbNumber}?`);
    if (!confirmed) return;

    try {
      const { error } = await db.from("dhl_awb_tracking").update({ email_alert: newValue }).eq("awb", awbNumber);
      if (error) throw error;
      setAwbs((prev) => prev.map((awb) => (awb.awb === awbNumber ? { ...awb, email_alert: newValue } : awb)));
      toast({ title: `Email ${newValue ? "ativado" : "desativado"}`, description: `Os envios de email foram ${newValue ? "ativados" : "desativados"} para AWB ${awbNumber}.` });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar email_alert", description: error.message, variant: "destructive" });
    }
  };

  const handleWhatsAppToggle = async (awbNumber: string, currentValue: boolean | undefined) => {
    const newValue = !currentValue;
    const confirmed = window.confirm(`Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} os envios de WhatsApp para a AWB ${awbNumber}?`);
    if (!confirmed) return;

    try {
      const { error } = await db.from("dhl_awb_tracking").update({ whatsapp_alert: newValue }).eq("awb", awbNumber);
      if (error) throw error;
      setAwbs((prev) => prev.map((awb) => (awb.awb === awbNumber ? { ...awb, whatsapp_alert: newValue } : awb)));
      toast({ title: `WhatsApp ${newValue ? "ativado" : "desativado"}`, description: `Os envios de WhatsApp foram ${newValue ? "ativados" : "desativados"} para AWB ${awbNumber}.` });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar whatsapp_alert", description: error.message, variant: "destructive" });
    }
  };

  const handleBugAlertToggle = async (awbNumber: string, currentValue: boolean | undefined) => {
    const newValue = !currentValue;
    const confirmed = window.confirm(`Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} o BUG ALERT para a AWB ${awbNumber}?`);
    if (!confirmed) return;

    try {
      const { error } = await db.from("dhl_awb_tracking").update({ bug_alert: newValue }).eq("awb", awbNumber);
      if (error) throw error;
      setAwbs((prev) => prev.map((awb) => (awb.awb === awbNumber ? { ...awb, bug_alert: newValue } : awb)));
      if (selectedAwb && selectedAwb.awb === awbNumber) setSelectedAwb((prev) => (prev ? { ...prev, bug_alert: newValue } : prev));
      toast({ title: `BUG ALERT ${newValue ? "ativado" : "desativado"}`, description: `O BUG ALERT foi ${newValue ? "ativado" : "desativado"} para AWB ${awbNumber}.` });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar BUG ALERT", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkBugAlertToggle = async (newValue: boolean) => {
    const confirmed = window.confirm(`Tem certeza que deseja ${newValue ? "ATIVAR" : "DESATIVAR"} o BUG ALERT para todas as AWBs filtradas?`);
    if (!confirmed) return;

    try {
      const filteredAwbNumbers = filteredAwbs.map((awb) => awb.awb).filter(Boolean) as string[];
      const { error } = await db.from("dhl_awb_tracking").update({ bug_alert: newValue }).in("awb", filteredAwbNumbers);
      if (error) throw error;
      setAwbs((prev) => prev.map((awb) => (filteredAwbNumbers.includes(awb.awb || "") ? { ...awb, bug_alert: newValue } : awb)));
      toast({ title: `BUG ALERT em massa ${newValue ? "ativado" : "desativado"}`, description: `O BUG ALERT foi ${newValue ? "ativado" : "desativado"} para todas as AWBs filtradas.` });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar BUG ALERT em massa", description: error.message, variant: "destructive" });
    }
  };

  // Modal Handlers
  const openLogModal = async (awbNumber: string) => {
    setIsLogLoading(true);
    setIsLogModalOpen(true);
    setSelectedAwb(awbs.find((awb) => awb.awb?.replace(/\D/g, "") === awbNumber.replace(/\D/g, "")) || null);

    const { data, error } = await db.from("udlog_zeus_console_log_udlog_airfreight").select("*").ilike("awb", `%${awbNumber}%`).order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar logs", description: error.message, variant: "destructive" });
    } else {
      setLogData(data?.map((logEntry: any) => ({ ...logEntry, new_value: JSON.parse(logEntry.new_value || "{}") })) || []);
    }
    setIsLogLoading(false);
  };

  const openEmailModal = (awb: DhlAwbTracking) => {
    setSelectedAwbForEmail(awb.awb || null);
    setEmailRecipient(awb.customer_email || awb.consignee_email || "");
    setEmailSubject(`Atualização de Rastreamento - AWB ${awb.awb || ""}`);
    setEmailContent(`Olá ${awb.consignee || "cliente"},\n\nSegue atualização do rastreio da sua carga:\n\nAWB: ${awb.awb || "N/A"}\nCliente: ${awb.consignee || "N/A"}\nStatus: ${awb.status || "N/A"}\nÚltimo evento: ${awb.last_event || "N/A"}\nÚltima atualização: ${awb.last_update || "N/A"}\nDias em trânsito: ${awb.days_in_transit ?? "N/A"}\nQtd de NFDs: ${awb.nfd_counter ?? "N/A"}\n\nAtenciosamente,\nEquipe DACHSER BRASIL`);
    setIsEmailModalOpen(true);
  };

  const handleSendEmail = async () => {
    if (!selectedAwbForEmail || !emailRecipient || !emailSubject || !emailContent) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos antes de enviar o email.", variant: "destructive" });
      return;
    }
    setIsEmailSending(true);
    try {
      logToConsole(`Iniciando envio de e-mail para AWB ${selectedAwbForEmail}`);
      const { data, error } = await supabase.functions.invoke("email-daclient", { body: { awb: selectedAwbForEmail, to: emailRecipient, subject: emailSubject, content: emailContent } });
      if (error) throw error;
      logToConsole(`Resposta da função de email: ${JSON.stringify(data)}`);
      toast({ title: "Email enviado", description: data?.message || `Email enviado com sucesso para ${emailRecipient}` });
      setIsEmailModalOpen(false);
    } catch (error: any) {
      toast({ title: "Erro ao enviar email", description: error.message, variant: "destructive" });
    } finally {
      setIsEmailSending(false);
    }
  };

  const openEmailHistoryModal = async (awbNumber: string) => {
    setIsEmailHistoryLoading(true);
    setIsEmailHistoryModalOpen(true);
    const { data, error } = await db.from("udlog_af_email_history").select("*").eq("awb", awbNumber).order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
    } else {
      setEmailHistory(data || []);
    }
    setIsEmailHistoryLoading(false);
  };

  const openRemarkModal = (awb: DhlAwbTracking) => {
    setCurrentRemarkAwb(awb.awb || null);
    setCurrentRemarkText(awb.notes || "");
    setRemarkModalOpen(true);
  };

  const handleRemarkSave = async () => {
    if (!currentRemarkAwb) return;
    const trimmedRemark = currentRemarkText.trim();
    if (!trimmedRemark) { setRemarkModalOpen(false); return; }

    try {
      setIsUpdatingAwb(currentRemarkAwb);
      const { error } = await db.from("dhl_awb_tracking").update({ notes: trimmedRemark }).eq("awb", currentRemarkAwb);
      if (error) throw error;
      setAwbs((prev) => prev.map((awb) => (awb.awb === currentRemarkAwb ? { ...awb, notes: trimmedRemark } : awb)));
      setRemarkModalOpen(false);
      toast({ title: "Observação salva", description: "Sua observação foi salva com sucesso." });
    } catch (error: any) {
      toast({ title: "Erro ao salvar observação", description: error.message, variant: "destructive" });
    } finally {
      setIsUpdatingAwb(null);
    }
  };

  const triggerTrackingUpdate = async (awbNumber: string) => {
    if (!awbNumber) return;
    try {
      logToConsole(`Iniciando atualização de rastreio para AWB ${awbNumber}`);
      const response = await fetch(`https://udlog.z3us.ai/manual-trigger-dhl-tracking?awb=${awbNumber}`, { method: "GET" });
      if (!response.ok) throw new Error("Falha ao iniciar atualização de rastreio");
      toast({ title: "Atualização de rastreio iniciada", description: `A atualização do rastreio para AWB ${awbNumber} foi iniciada.` });
      await fetchDashboardData();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar rastreio", description: error.message, variant: "destructive" });
    }
  };

  const alertSummary = useMemo(() => {
    if (!selectedAwb) return "Selecione uma AWB para ver os detalhes do alerta.";
    const parts = [];
    if (selectedAwb.bug_alert) parts.push("BUG ALERT ativo para essa carga.");
    if ((selectedAwb.days_in_transit ?? 0) > 15) parts.push("Tempo em trânsito considerado crítico (mais de 15 dias).");
    else if ((selectedAwb.days_in_transit ?? 0) > 10) parts.push("Tempo em trânsito elevado (mais de 10 dias).");
    if ((selectedAwb.nfd_counter ?? 0) > 2) parts.push("Ocorrência de NFD acima do esperado.");
    if (selectedAwb.status === "ALERTA" || selectedAwb.status === "DELAYED") parts.push("Status atual do rastreio indica alerta.");
    return parts.length === 0 ? "Nenhuma condição crítica identificada para esta AWB." : parts.join(" ");
  }, [selectedAwb]);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${dachserBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.8)",
        }}
      />
      <div
        className="fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(circle at 10% 50%, rgba(255,200,0,0.18), transparent 50%),
            radial-gradient(circle at 90% 50%, rgba(255,200,0,0.12), transparent 50%),
            linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.82))
          `,
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center px-4 py-2 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card text-foreground border border-border transition-colors"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Voltar
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-widest text-foreground">
                D A C H S E R
              </h1>
              <p className="text-xs text-muted-foreground tracking-[0.3em]">
                Aéreo – Rastreamento de AWBs
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">@rastreio.aereo</span>
          </div>
        </header>

        {/* Stats Cards */}
        <TrackingStatsCards stats={stats} />

        {/* Filters */}
        <TrackingFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          analystFilter={analystFilter}
          setAnalystFilter={setAnalystFilter}
          analysts={analysts}
          alertFilter={alertFilter}
          setAlertFilter={setAlertFilter}
          emailFilter={emailFilter}
          setEmailFilter={setEmailFilter}
          isColumnSelectorOpen={isColumnSelectorOpen}
          setIsColumnSelectorOpen={setIsColumnSelectorOpen}
          columnVisibility={columnVisibility}
          handleToggleColumn={handleToggleColumn}
          handleResetColumns={handleResetColumns}
          handleBulkBugAlertToggle={handleBulkBugAlertToggle}
          refreshDashboard={refreshDashboard}
          isRefreshing={isRefreshing}
          setCurrentPage={setCurrentPage}
        />

        {/* Main Content */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-6">
          {/* Table */}
          <div className="bg-card/90 border border-border rounded-2xl overflow-hidden shadow-lg backdrop-blur-sm">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-[0.25em] text-muted-foreground uppercase">
                  Lista de AWBs
                </span>
                <Badge className="bg-muted border border-border text-[10px] font-normal rounded-full px-2 py-0">
                  {sortedAwbs.length} registros
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="hidden sm:inline">Página {currentPage} de {totalPages || 1}</span>
                <div className="flex items-center border border-border rounded-full overflow-hidden">
                  <button onClick={() => handlePageChange("prev")} disabled={currentPage === 1} className="px-3 py-1 text-xs hover:bg-muted disabled:opacity-40">
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <div className="px-3 py-1 text-[10px] border-x border-border bg-card">{currentPage} / {totalPages || 1}</div>
                  <button onClick={() => handlePageChange("next")} disabled={currentPage === totalPages || totalPages === 0} className="px-3 py-1 text-xs hover:bg-muted disabled:opacity-40">
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-xs">
                <thead className="bg-card/70">
                  <tr>
                    {columnVisibility.awb && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold cursor-pointer hover:bg-muted/50" onClick={() => handleSort("awb")}>
                        <div className="flex items-center gap-1">AWB<ArrowUpDown className="w-3 h-3 text-muted-foreground" /></div>
                      </th>
                    )}
                    {columnVisibility.hawb && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">HAWB</th>}
                    {columnVisibility.consignee && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Cliente</th>}
                    {columnVisibility.route && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Rota</th>}
                    {columnVisibility.status && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Rastreio</th>}
                    {columnVisibility.last_event && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Último Evento</th>}
                    {columnVisibility.last_update && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Última Atualização</th>}
                    {columnVisibility.last_checked && (
                      <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold cursor-pointer hover:bg-muted/50" onClick={() => handleSort("last_checked" as keyof DhlAwbTracking)}>
                        <div className="flex items-center gap-1">Última Verificação<ArrowUpDown className="w-3 h-3 text-muted-foreground" /></div>
                      </th>
                    )}
                    {columnVisibility.analyst && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Nome Analista</th>}
                    {columnVisibility.terminal && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Terminal</th>}
                    {columnVisibility.whatsapp_alert && <th className="px-3 py-3 text-center text-foreground uppercase text-xs font-bold">WhatsApp</th>}
                    {columnVisibility.email_alert && <th className="px-3 py-3 text-center text-foreground uppercase text-xs font-bold">E-mail</th>}
                    {columnVisibility.delivered_at && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Data Entrega</th>}
                    {columnVisibility.estimated_delivery && <th className="px-3 py-3 text-left text-foreground uppercase text-xs font-bold">Previsão Entrega</th>}
                    {columnVisibility.days_in_transit && <th className="px-3 py-3 text-right text-foreground uppercase text-xs font-bold">Dias</th>}
                    {columnVisibility.nfd_counter && <th className="px-3 py-3 text-right text-foreground uppercase text-xs font-bold">NFDs</th>}
                    <th className="px-3 py-3 text-right text-foreground uppercase text-xs font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedAwbs.length === 0 && (
                    <tr><td colSpan={17} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma AWB encontrada com os filtros atuais.</td></tr>
                  )}
                  {paginatedAwbs.map((awb) => {
                    const isSelected = selectedAwb?.awb === awb.awb;
                    const bugColor = getBugAlertColor(awb, isSelected);

                    return (
                      <tr key={awb.id} className={`text-xs cursor-pointer hover:bg-muted/50 ${isSelected ? "bg-muted/70" : ""}`} onClick={() => handleAwbClick(awb)}>
                        {columnVisibility.awb && (
                          <TableCell className="px-3 py-2 font-mono whitespace-nowrap">
                            <button type="button" className="text-blue-400 hover:underline" onClick={(e) => { e.stopPropagation(); openLogModal(awb.awb || ""); }}>
                              {formatAwbForDisplay(awb.awb || "")}
                            </button>
                          </TableCell>
                        )}
                        {columnVisibility.hawb && <TableCell className="px-3 py-2 truncate max-w-[160px]">{awb.hawb || "-"}</TableCell>}
                        {columnVisibility.consignee && <TableCell className="px-3 py-2 truncate max-w-[220px]">{awb.consignee || "-"}</TableCell>}
                        {columnVisibility.route && <TableCell className="px-3 py-2 whitespace-nowrap">{awb.route || "-"}</TableCell>}
                        {columnVisibility.status && (
                          <TableCell className="px-3 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${getStatusBadgeColor(awb)}`}>{getStatusLabel(awb)}</span>
                          </TableCell>
                        )}
                        {columnVisibility.last_event && <TableCell className={`px-3 py-2 font-mono text-xs ${getStatusTextColor(awb.last_event || null)}`}>{awb.last_event || "-"}</TableCell>}
                        {columnVisibility.last_update && <TableCell className="px-3 py-2">{formatDateTime(awb.last_update || null)}</TableCell>}
                        {columnVisibility.last_checked && <TableCell className="px-3 py-2">{formatDateTime(awb.last_checked || null)}</TableCell>}
                        {columnVisibility.analyst && <TableCell className="px-3 py-2 whitespace-nowrap">{awb.analyst || "-"}</TableCell>}
                        {columnVisibility.terminal && <TableCell className="px-3 py-2 whitespace-nowrap">{awb.terminal || "-"}</TableCell>}
                        {columnVisibility.whatsapp_alert && (
                          <TableCell className="px-3 py-2 text-center">
                            <Checkbox checked={!!awb.whatsapp_alert} onCheckedChange={() => handleWhatsAppToggle(awb.awb || "", awb.whatsapp_alert)} onClick={(e) => e.stopPropagation()} className="border-border data-[state=checked]:bg-green-500 data-[state=checked]:border-green-400" />
                          </TableCell>
                        )}
                        {columnVisibility.email_alert && (
                          <TableCell className="px-3 py-2 text-center">
                            <Checkbox checked={!!awb.email_alert} onCheckedChange={() => handleEmailToggle(awb.awb || "", awb.email_alert)} onClick={(e) => e.stopPropagation()} className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                          </TableCell>
                        )}
                        {columnVisibility.delivered_at && <TableCell className="px-3 py-2">{formatDate(awb.delivered_at || null)}</TableCell>}
                        {columnVisibility.estimated_delivery && <TableCell className="px-3 py-2">{formatDate(awb.estimated_delivery || null)}</TableCell>}
                        {columnVisibility.days_in_transit && <TableCell className="px-3 py-2 text-right tabular-nums">{awb.days_in_transit ?? "-"}</TableCell>}
                        {columnVisibility.nfd_counter && <TableCell className="px-3 py-2 text-right tabular-nums">{awb.nfd_counter ?? "-"}</TableCell>}
                        <TableCell className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted" title="Abrir rastreio externo" onClick={(e) => { e.stopPropagation(); const link = getFormattedTrackingLink(awb.awb || ""); if (link) window.open(link, "_blank"); }}>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted" title="Ver logs" onClick={(e) => { e.stopPropagation(); openLogModal(awb.awb || ""); }}>
                              <Database className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted" title="Enviar e-mail" onClick={(e) => { e.stopPropagation(); openEmailModal(awb); }}>
                              <Mail className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted" title="Histórico de e-mails" onClick={(e) => { e.stopPropagation(); openEmailHistoryModal(awb.awb || ""); }}>
                              <LogOut className="w-3 h-3 rotate-180" />
                            </Button>
                            <Button variant="ghost" size="icon" className={`h-7 w-7 border ${bugColor} hover:opacity-80`} title="BUG ALERT / Lista de atenção" onClick={(e) => { e.stopPropagation(); handleBugAlertToggle(awb.awb || "", awb.bug_alert); }}>
                              <AlertTriangle className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar */}
          <TrackingDetailsSidebar
            selectedAwb={selectedAwb}
            alertSummary={alertSummary}
            bugAlertExplication={bugAlertExplication}
            triggerTrackingUpdate={triggerTrackingUpdate}
            openRemarkModal={openRemarkModal}
            openEmailModal={openEmailModal}
          />
        </section>

        {/* Console Log */}
        {consoleLog.length > 0 && (
          <div className="mt-4 bg-card/90 border border-border rounded-xl p-3 text-[10px] text-muted-foreground max-h-40 overflow-auto backdrop-blur-sm">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                <span className="uppercase tracking-[0.25em] text-[9px] text-muted-foreground">Console Técnico</span>
              </div>
              <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors" onClick={() => setConsoleLog([])}>Limpar</button>
            </div>
            <ul className="space-y-1">{consoleLog.map((line, index) => <li key={index} className="whitespace-pre-wrap">{line}</li>)}</ul>
          </div>
        )}
      </div>

      {/* Modals */}
      <LogModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} selectedAwb={selectedAwb} logData={logData} isLoading={isLogLoading} />
      <EmailModal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} selectedAwbForEmail={selectedAwbForEmail} emailRecipient={emailRecipient} setEmailRecipient={setEmailRecipient} emailSubject={emailSubject} setEmailSubject={setEmailSubject} emailContent={emailContent} setEmailContent={setEmailContent} handleSendEmail={handleSendEmail} isEmailSending={isEmailSending} />
      <EmailHistoryModal isOpen={isEmailHistoryModalOpen} onClose={() => setIsEmailHistoryModalOpen(false)} selectedAwbForEmail={selectedAwbForEmail} emailHistory={emailHistory} isLoading={isEmailHistoryLoading} />
      <RemarkModal isOpen={remarkModalOpen} onClose={() => setRemarkModalOpen(false)} currentRemarkAwb={currentRemarkAwb} currentRemarkText={currentRemarkText} setCurrentRemarkText={setCurrentRemarkText} handleSave={handleRemarkSave} isUpdating={!!isUpdatingAwb} />
    </div>
  );
};

export default Index;
