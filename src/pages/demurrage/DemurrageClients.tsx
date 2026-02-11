import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TablePagination } from "@/components/layout/TablePagination";
import { Users, Plus, Edit, Bell, BellOff, Search, DollarSign, AlertTriangle, Mail, Send, History, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { useDemurrageData, useSendTestAlert, useDemurrageAlerts, useMarkAlertReturned } from "@/hooks/useDemurrageData";
import { useClientProfiles, useCreateClientProfile, useUpdateClientProfile } from "@/hooks/useClientProfiles";
import { ClientProfileDialog, ClientProfileData } from "@/components/demurrage/ClientProfileDialog";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type QuickFilter = "all" | "reports" | "no_reports" | "demurrage" | "pending";
const PAGE_SIZE = 15;

interface ClientProfileView {
  cliente: string;
  auto_alert_enabled: boolean;
  alert_days_before: number;
  report_frequency: string;
  contact_emails: string[];
  containers: number;
  total_demurrage: number;
  exceeded: number;
  hasProfile: boolean;
}

export default function DemurrageClients() {
  const [activeTab, setActiveTab] = useState("perfis");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterReports, setFilterReports] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ClientProfileData | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [alertHistoryOpen, setAlertHistoryOpen] = useState(false);
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<string | null>(null);

  // Email tab state
  const [emailSearchTerm, setEmailSearchTerm] = useState("");
  const [emailCurrentPage, setEmailCurrentPage] = useState(1);

  const { data: containers = [], isLoading } = useDemurrageData();
  const { data: clientProfiles = [] } = useClientProfiles();
  const { data: alertHistory = [] } = useDemurrageAlerts(selectedClientForHistory || undefined);
  const { data: allAlerts = [] } = useDemurrageAlerts();
  const createProfile = useCreateClientProfile();
  const updateProfile = useUpdateClientProfile();
  const sendTestAlert = useSendTestAlert();
  const markReturned = useMarkAlertReturned();

  // Create a map of profiles by cliente name
  const profileMap = useMemo(() => {
    const map = new Map<string, typeof clientProfiles[0]>();
    clientProfiles.forEach(p => map.set(p.cliente, p));
    return map;
  }, [clientProfiles]);

  // Group containers by client and merge with profiles
  const clientProfileViews = useMemo(() => {
    const clientMap = new Map<string, ClientProfileView>();

    containers.forEach(c => {
      const clientName = c.cliente || 'SEM CLIENTE';
      const existingProfile = profileMap.get(clientName);
      
      if (!clientMap.has(clientName)) {
        clientMap.set(clientName, {
          cliente: clientName,
          auto_alert_enabled: existingProfile?.auto_alert_enabled ?? c.client_auto_alert ?? false,
          alert_days_before: existingProfile?.alert_days_before ?? c.client_alert_days_before ?? 3,
          report_frequency: existingProfile?.report_frequency ?? c.client_report_frequency ?? 'WEEKLY',
          contact_emails: existingProfile?.contact_emails ?? [],
          containers: 0,
          total_demurrage: 0,
          exceeded: 0,
          hasProfile: !!existingProfile,
        });
      }

      const profile = clientMap.get(clientName)!;
      profile.containers += 1;
      profile.total_demurrage += c.expected_cost_usd || 0;
      if (['exceeded', 'critical'].includes(c.risk_status)) {
        profile.exceeded += 1;
      }
    });

    return Array.from(clientMap.values()).sort((a, b) => b.total_demurrage - a.total_demurrage);
  }, [containers, profileMap]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const stats = useMemo(() => {
    const total = clientProfileViews.length;
    const reportsEnabled = clientProfileViews.filter(p => p.auto_alert_enabled).length;
    const noReports = clientProfileViews.filter(p => !p.auto_alert_enabled).length;
    const totalDemurrage = clientProfileViews.reduce((sum, p) => sum + p.total_demurrage, 0);
    const pendingProfiles = clientProfileViews.filter(p => !p.hasProfile).length;

    return { total, reportsEnabled, noReports, totalDemurrage, pendingProfiles };
  }, [clientProfileViews]);

  const filteredProfiles = useMemo(() => {
    return clientProfileViews.filter(p => {
      const matchesSearch = p.cliente.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesQuickFilter = true;
      if (quickFilter === "reports") {
        matchesQuickFilter = p.auto_alert_enabled;
      } else if (quickFilter === "no_reports") {
        matchesQuickFilter = !p.auto_alert_enabled;
      } else if (quickFilter === "pending") {
        matchesQuickFilter = !p.hasProfile;
      }
      
      const matchesFilter = filterReports === "all" || 
        (filterReports === "reports" && p.auto_alert_enabled) ||
        (filterReports === "no-reports" && !p.auto_alert_enabled);
      return matchesSearch && matchesQuickFilter && matchesFilter;
    });
  }, [clientProfileViews, searchTerm, quickFilter, filterReports]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, quickFilter, filterReports]);

  const totalPages = Math.ceil(filteredProfiles.length / PAGE_SIZE);
  const paginatedProfiles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProfiles.slice(start, start + PAGE_SIZE);
  }, [filteredProfiles, currentPage]);

  // Emails Enviados tab data
  const filteredAlerts = useMemo(() => {
    if (!emailSearchTerm) return allAlerts;
    const lower = emailSearchTerm.toLowerCase();
    return allAlerts.filter(a =>
      (a.client_name || '').toLowerCase().includes(lower) ||
      (a.container_number || '').toLowerCase().includes(lower) ||
      (a.shipment_master || '').toLowerCase().includes(lower)
    );
  }, [allAlerts, emailSearchTerm]);

  useEffect(() => { setEmailCurrentPage(1); }, [emailSearchTerm]);

  const emailTotalPages = Math.ceil(filteredAlerts.length / PAGE_SIZE);
  const paginatedAlerts = useMemo(() => {
    const start = (emailCurrentPage - 1) * PAGE_SIZE;
    return filteredAlerts.slice(start, start + PAGE_SIZE);
  }, [filteredAlerts, emailCurrentPage]);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const handleNewProfile = () => {
    setSelectedProfile(null);
    setIsNewProfile(true);
    setDialogOpen(true);
  };

  const handleEditProfile = (profile: ClientProfileView) => {
    setSelectedProfile({
      cliente: profile.cliente,
      auto_alert_enabled: profile.auto_alert_enabled,
      alert_days_before: profile.alert_days_before,
      report_frequency: profile.report_frequency,
      contact_emails: profile.contact_emails,
    });
    setIsNewProfile(false);
    setDialogOpen(true);
  };

  const handleToggleAlert = async (profile: ClientProfileView) => {
    try {
      if (profile.hasProfile) {
        await updateProfile.mutateAsync({ cliente: profile.cliente, auto_alert_enabled: !profile.auto_alert_enabled });
      } else {
        await createProfile.mutateAsync({
          cliente: profile.cliente, auto_alert_enabled: !profile.auto_alert_enabled,
          alert_days_before: profile.alert_days_before, report_frequency: profile.report_frequency, contact_emails: [],
        });
      }
      toast.success(profile.auto_alert_enabled ? "Alertas desativados" : "Alertas ativados");
    } catch (error) {
      console.error('Error toggling alert:', error);
      toast.error("Erro ao atualizar alertas");
    }
  };

  const handleSubmitProfile = async (data: ClientProfileData) => {
    try {
      if (isNewProfile) {
        await createProfile.mutateAsync(data);
        toast.success("Perfil criado com sucesso!");
      } else {
        await updateProfile.mutateAsync(data);
        toast.success("Perfil atualizado com sucesso!");
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error(isNewProfile ? "Erro ao criar perfil" : "Erro ao atualizar perfil");
      throw error;
    }
  };

  const getReportFrequencyLabel = (freq: string) => {
    const labels: Record<string, string> = { DAILY: 'Diário', WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal', NONE: 'Sem relatório' };
    return labels[freq] || freq;
  };

  const handleSendTestAlert = async (profile: ClientProfileView) => {
    if (profile.contact_emails.length === 0) {
      toast.error("Configure e-mails de contato para enviar alertas");
      return;
    }
    try {
      await sendTestAlert.mutateAsync({ clientName: profile.cliente, emails: profile.contact_emails });
      toast.success("Alerta de teste enviado com sucesso");
    } catch (error) {
      console.error("Error sending test alert:", error);
      toast.error("Erro ao enviar alerta de teste");
    }
  };

  const handleViewAlertHistory = (cliente: string) => {
    setSelectedClientForHistory(cliente);
    setAlertHistoryOpen(true);
  };

  const handleMarkReturned = async (alertId: number) => {
    try {
      await markReturned.mutateAsync({ alertId, userName: 'manual' });
      toast.success("Cliente marcado como retornado");
    } catch (error) {
      console.error('Error marking returned:', error);
      toast.error("Erro ao marcar retorno");
    }
  };

  const formatAlertDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return dateStr; }
  };

  const getAlertTypeLabel = (type: string | null) => {
    const labels: Record<string, string> = {
      'initial_notice': 'Aviso Inicial',
      're_notification': 'Re-notificação',
      'cost_statement': 'Demonstrativo',
      'risk_warning': 'Alerta Risco',
      'risk_critical': 'Crítico',
      'exceeded': 'Excedido',
    };
    return labels[type || ''] || type || 'N/A';
  };

  const rightActions = (
    <Button onClick={handleNewProfile} className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
      <Plus className="h-4 w-4 mr-2" />
      Novo Perfil
    </Button>
  );

  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard title="TOTAL PERFIS" value={stats.total} subtitle="Clientes com containers" icon={<Users className="h-6 w-6" />} variant="default" isActive={quickFilter === "all"} onClick={() => handleQuickFilterChange("all")} />
      <KpiCard title="REPORTA DEMURRAGE" value={stats.reportsEnabled} subtitle="Com alertas ativos" icon={<Bell className="h-6 w-6" />} variant="warning" isActive={quickFilter === "reports"} onClick={() => handleQuickFilterChange("reports")} />
      <KpiCard title="NÃO REPORTA" value={stats.noReports} subtitle="Sem alertas" icon={<BellOff className="h-6 w-6" />} variant="info" isActive={quickFilter === "no_reports"} onClick={() => handleQuickFilterChange("no_reports")} />
      <KpiCard title="DEMURRAGE TOTAL" value={formatCurrency(stats.totalDemurrage)} subtitle="Valor consolidado" icon={<DollarSign className="h-6 w-6" />} variant="default" isActive={quickFilter === "demurrage"} onClick={() => handleQuickFilterChange("demurrage")} />
      <KpiCard title="SEM PERFIL" value={stats.pendingProfiles} subtitle="Aguardando cadastro" icon={<AlertTriangle className="h-6 w-6" />} variant="critical" isActive={quickFilter === "pending"} onClick={() => handleQuickFilterChange("pending")} />
    </div>
  );

  const isUpdating = createProfile.isPending || updateProfile.isPending;

  return (
    <DemurrageLayout rightActions={rightActions} customCards={customCards} loading={isLoading}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="perfis">
            <Users className="h-4 w-4 mr-2" />
            Perfis por Cliente
          </TabsTrigger>
          <TabsTrigger value="emails">
            <Mail className="h-4 w-4 mr-2" />
            E-mails Enviados
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB: Perfis ============ */}
        <TabsContent value="perfis">
          <div className="space-y-4">
            <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
              <CardContent className="pt-4 pb-4">
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar cliente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]" />
                    </div>
                  </div>
                  <Select value={filterReports} onValueChange={setFilterReports}>
                    <SelectTrigger className="w-48 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"><SelectValue placeholder="Filtrar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="reports">Reporta Demurrage</SelectItem>
                      <SelectItem value="no-reports">Não Reporta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-foreground text-base">
                  <Users className="h-5 w-5 text-[#ffc800]" />
                  Perfis por Cliente
                </CardTitle>
                <CardDescription>{filteredProfiles.length} perfil(is)</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredProfiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mb-4 opacity-50" />
                    <p>Nenhum perfil encontrado</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[rgba(255,255,255,0.1)]">
                          <TableHead>Cliente</TableHead>
                          <TableHead>Reporta</TableHead>
                          <TableHead>Frequência</TableHead>
                          <TableHead className="text-center">E-mails</TableHead>
                          <TableHead className="text-center">Containers</TableHead>
                          <TableHead className="text-right">Demurrage</TableHead>
                          <TableHead className="text-center">Excedidos</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TooltipProvider>
                          {paginatedProfiles.map((profile) => (
                            <TableRow key={profile.cliente} className="border-[rgba(255,255,255,0.1)]">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {profile.cliente}
                                  {!profile.hasProfile && (
                                    <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">Sem perfil</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant={profile.auto_alert_enabled ? "default" : "secondary"}
                                      className={profile.auto_alert_enabled ? "gap-1 bg-green-500/20 text-green-500 hover:bg-green-500/30 border-green-500/30" : "gap-1 bg-[rgba(255,255,255,0.1)] text-muted-foreground"}
                                      onClick={() => handleToggleAlert(profile)} disabled={isUpdating}>
                                      {profile.auto_alert_enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                                      {profile.auto_alert_enabled ? 'Sim' : 'Não'}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Clique para {profile.auto_alert_enabled ? 'desativar' : 'ativar'} alertas</TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{getReportFrequencyLabel(profile.report_frequency)}</TableCell>
                              <TableCell className="text-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center gap-1">
                                      <Mail className="h-3 w-3 text-muted-foreground" />
                                      <span>{profile.contact_emails.length}</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>{profile.contact_emails.length > 0 ? profile.contact_emails.join(', ') : 'Nenhum e-mail configurado'}</TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-center font-medium">{profile.containers}</TableCell>
                              <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(profile.total_demurrage)}</TableCell>
                              <TableCell className="text-center">
                                {profile.exceeded ? <Badge variant="destructive">{profile.exceeded}</Badge> : <Badge variant="outline" className="text-muted-foreground">0</Badge>}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-white h-8 w-8 p-0" onClick={() => handleEditProfile(profile)}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent>Editar perfil</TooltipContent></Tooltip>
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-[#ffc800] h-8 w-8 p-0"
                                      onClick={() => handleSendTestAlert(profile)} disabled={sendTestAlert.isPending || !profile.auto_alert_enabled}>
                                      {sendTestAlert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger><TooltipContent>{profile.auto_alert_enabled ? "Enviar alerta de teste" : "Ative os alertas para testar"}</TooltipContent></Tooltip>
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-blue-400 h-8 w-8 p-0"
                                      onClick={() => handleViewAlertHistory(profile.cliente)}>
                                      <History className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent>Ver histórico de alertas</TooltipContent></Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TooltipProvider>
                      </TableBody>
                    </Table>
                    <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} maxVisiblePages={5} showFirstLast={false} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ TAB: E-mails Enviados ============ */}
        <TabsContent value="emails">
          <div className="space-y-4">
            <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
              <CardContent className="pt-4 pb-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por cliente, container ou MBL..." value={emailSearchTerm} onChange={(e) => setEmailSearchTerm(e.target.value)}
                    className="pl-10 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-foreground text-base">
                  <Mail className="h-5 w-5 text-[#ffc800]" />
                  Histórico de E-mails Enviados
                </CardTitle>
                <CardDescription>{filteredAlerts.length} alerta(s)</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Mail className="h-12 w-12 mb-4 opacity-50" />
                    <p>Nenhum e-mail enviado</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[rgba(255,255,255,0.1)]">
                          <TableHead>Data Envio</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Container</TableHead>
                          <TableHead>MBL</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-center">Retorno</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TooltipProvider>
                          {paginatedAlerts.map((alert) => {
                            const alertAny = alert as any;
                            const isReturned = alertAny.client_returned === 1 || alertAny.client_returned === true;
                            return (
                              <TableRow key={alert.id} className="border-[rgba(255,255,255,0.1)]">
                                <TableCell className="text-sm">{formatAlertDate(alert.sent_at)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {getAlertTypeLabel(alert.alert_type)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-medium">{alert.client_name || '-'}</TableCell>
                                <TableCell className="font-mono text-sm">{alert.container_number || '-'}</TableCell>
                                <TableCell className="font-mono text-sm">{alert.shipment_master || '-'}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline"
                                    className={alert.status === 'sent' ? 'text-green-400 border-green-400/30' : alert.status === 'failed' ? 'text-red-400 border-red-400/30' : 'text-yellow-400 border-yellow-400/30'}>
                                    {alert.status === 'sent' ? 'Enviado' : alert.status === 'failed' ? 'Falhou' : 'Pendente'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  {isReturned ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="bg-green-500/20 text-green-400 border-green-400/30">
                                          <CheckCircle2 className="h-3 w-3 mr-1" />
                                          Retornou
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {alertAny.client_returned_at ? `Em ${formatAlertDate(alertAny.client_returned_at)}` : 'Retornado'}
                                        {alertAny.client_returned_by ? ` por ${alertAny.client_returned_by}` : ''}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">Sem retorno</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {!isReturned && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost"
                                          className="text-muted-foreground hover:text-green-400 h-8 w-8 p-0"
                                          onClick={() => handleMarkReturned(alert.id)}
                                          disabled={markReturned.isPending}>
                                          {markReturned.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Marcar "Cliente Retornou"</TooltipContent>
                                    </Tooltip>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TooltipProvider>
                      </TableBody>
                    </Table>
                    <TablePagination currentPage={emailCurrentPage} totalPages={emailTotalPages} onPageChange={setEmailCurrentPage} maxVisiblePages={5} showFirstLast={false} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Profile Dialog */}
      <ClientProfileDialog open={dialogOpen} onOpenChange={setDialogOpen} profile={selectedProfile} isNew={isNewProfile} onSubmit={handleSubmitProfile} isLoading={isUpdating} />

      {/* Alert History Sheet */}
      <Sheet open={alertHistoryOpen} onOpenChange={setAlertHistoryOpen}>
        <SheetContent className="bg-[#0a0a0a] border-[rgba(255,255,255,0.1)] w-[500px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="text-[#ffc800] flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Alertas
            </SheetTitle>
            <SheetDescription>Alertas enviados para {selectedClientForHistory}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
            {alertHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum alerta enviado</p>
              </div>
            ) : (
              alertHistory.map((alert) => (
                <div key={alert.id} className="p-4 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline"
                          className={alert.status === 'sent' ? 'text-green-400 border-green-400/30' : alert.status === 'failed' ? 'text-red-400 border-red-400/30' : 'text-yellow-400 border-yellow-400/30'}>
                          {alert.status === 'sent' ? 'Enviado' : alert.status === 'failed' ? 'Falhou' : 'Pendente'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatAlertDate(alert.sent_at)}</span>
                      </div>
                      <p className="text-sm mt-2">{getAlertTypeLabel(alert.alert_type)}</p>
                      {alert.container_number && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono">Container: {alert.container_number}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </DemurrageLayout>
  );
}
