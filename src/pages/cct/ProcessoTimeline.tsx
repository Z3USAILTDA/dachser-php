import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/cct/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, SLAInfoBadge } from "@/components/cct/StatusBadge";
import { InnerNavTabs } from "@/components/cct/InnerNavTabs";
import { EventTimeline } from "@/components/cct/EventTimeline";
import { useProcessosCCT, useRegistrarPeso, useUpdateDecolagem, useCCTEvents } from "@/hooks/useCCTData";
import { toast } from "sonner";
import {
  Clock,
  Package,
  Plane,
  AlertTriangle,
  CheckCircle,
  Scale,
  Calendar,
  User,
  Mail,
  MapPin,
  FileText,
  Edit3,
  Save,
  X,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ProcessoCCT } from "@/types/cct";


export default function ProcessoTimeline() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: processos = [], isLoading } = useProcessosCCT();
  const registrarPeso = useRegistrarPeso();
  const updateDecolagem = useUpdateDecolagem();

  // Find the processo to get the AWB for events query
  const processo = useMemo(() => {
    return processos.find(p => p.shipment.id === id);
  }, [processos, id]);

  // Fetch events from history table using the AWB (house - HAWB) + Master (MAWB) for RFB lookup
  const { data: eventosHistorico = [], isLoading: isLoadingEvents } = useCCTEvents(processo?.shipment.house || '', processo?.shipment.master || '');

  const [activeTab, setActiveTab] = useState("timeline");
  const [editingPeso, setEditingPeso] = useState(false);
  const [editingDecolagem, setEditingDecolagem] = useState(false);

  // Form states
  const [pesoConstatado, setPesoConstatado] = useState("");
  const [volumeConstatado, setVolumeConstatado] = useState("");
  const [dataDecolagem, setDataDecolagem] = useState("");

  // Combine historic events with fallback evento from processo

  // Initialize form values when processo loads - use useEffect to properly update state
  useEffect(() => {
    if (processo) {
      setPesoConstatado(processo.shipment.peso_constatado?.toString() || "");
      setVolumeConstatado(processo.shipment.volume_constatado?.toString() || "");
      
      // Usar dep_datetime como fonte primária para data de decolagem
      const depDate = processo.shipment.dep_datetime || processo.shipment.data_decolagem_ultimo_trecho;
      setDataDecolagem(depDate 
        ? format(new Date(depDate), "yyyy-MM-dd'T'HH:mm")
        : "");
    }
  }, [processo]);

  const handleSavePeso = async () => {
    if (!processo) return;
    try {
      await registrarPeso.mutateAsync({
        shipmentId: processo.shipment.id,
        peso_declarado: processo.shipment.peso_declarado || 0,
        peso_constatado: parseFloat(pesoConstatado) || 0,
        volume_declarado: processo.shipment.volume_declarado || undefined,
        volume_constatado: parseInt(volumeConstatado) || undefined,
      });
      toast.success("Peso atualizado com sucesso");
      setEditingPeso(false);
    } catch (error) {
      toast.error("Erro ao atualizar peso");
    }
  };

  const handleSaveDecolagem = async () => {
    if (!processo) return;
    try {
      await updateDecolagem.mutateAsync({
        shipmentId: processo.shipment.id,
        data_decolagem: dataDecolagem ? new Date(dataDecolagem).toISOString() : null,
      });
      toast.success("Data de decolagem atualizada");
      setEditingDecolagem(false);
    } catch (error) {
      toast.error("Erro ao atualizar decolagem");
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  if (isLoading) {
    return (
      <PageLayout title="DACHSER" subtitle="Carregando processo...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-[#ffc800]" />
        </div>
      </PageLayout>
    );
  }

  if (!processo) {
    return (
      <PageLayout title="DACHSER" subtitle="Processo não encontrado">
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-10 text-center">
          <AlertTriangle className="h-12 w-12 text-[#888] mx-auto mb-4" />
          <p className="text-[#aaa] mb-4">Processo não encontrado</p>
          <button
            onClick={() => navigate("/air/cct")}
            className="px-4 py-2 rounded-full bg-[#ffc800]/15 text-[#ffc800] border border-[#ffc800]/40 hover:bg-[#ffc800]/25 transition"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </PageLayout>
    );
  }

  const { shipment, status_atual, eventos: eventosFallback, excecoes } = processo;

  // Use historic events if available, otherwise fallback to processo.eventos
  const allEventos = eventosHistorico.length > 0 ? eventosHistorico : eventosFallback;

  return (
    <PageLayout
      title="DACHSER"
      subtitle={`Processo ${shipment.house}`}
      pageIcon={Clock}
      hideNavTabs={true}
      headerActions={
        <div className="flex items-center gap-2 text-sm text-[#888]">
          <span 
            className="cursor-pointer hover:text-[#ffc800] transition"
            onClick={() => navigate("/air/cct")}
          >
            CCT Dashboard
          </span>
          <ChevronRight className="h-4 w-4" />
          <span className="text-white">{shipment.house}</span>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header Card */}
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Shipment Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#888] text-sm">
                <Package className="h-4 w-4" />
                <span>Identificação</span>
              </div>
              <div>
                <p className="text-[#ffc800] font-mono text-lg">{shipment.house}</p>
                <p className="text-[#888] font-mono text-sm">{shipment.master}</p>
              </div>
              <p className="text-white text-sm">{shipment.cliente}</p>
            </div>

            {/* Route */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#888] text-sm">
                <Plane className="h-4 w-4" />
                <span>Rota</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.1)] text-white font-medium">
                  {shipment.aeroporto_origem}
                </span>
                <span className="text-[#666]">→</span>
                <span className="px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.1)] text-white font-medium">
                  {shipment.aeroporto_destino}
                </span>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#888] text-sm">
                <Clock className="h-4 w-4" />
                <span>Status</span>
              </div>
              <div className="flex flex-col gap-2">
                <StatusBadge status={status_atual?.status_cct_oficial || "AGUARDANDO_MANIFESTACAO"} />
                <SLAInfoBadge 
                  slaInfo={(status_atual as any)?.sla_info || { 
                    status: status_atual?.sla_status || 'OK', 
                    horasRestantes: null 
                  }} 
                />
              </div>
            </div>

            {/* Analyst */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#888] text-sm">
                <User className="h-4 w-4" />
                <span>Analista</span>
              </div>
              <div>
                <p className="text-white text-sm">{shipment.analista?.nome || shipment.nome_analista_legado || "—"}</p>
                {shipment.analista?.email && (
                  <p className="text-[#888] text-xs flex items-center gap-1 mt-1">
                    <Mail className="h-3 w-3" />
                    {shipment.analista.email}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <InnerNavTabs
          tabs={[
            { id: 'timeline', label: 'Timeline', icon: Clock },
            { id: 'dados', label: 'Dados', icon: FileText },
            { id: 'excecoes', label: 'Exceções', icon: AlertTriangle, count: excecoes.length }
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden mt-6">
            <div className="p-4 border-b border-[rgba(255,255,255,0.08)]">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#ffc800]" />
                Timeline de Eventos ({allEventos.length})
                {isLoadingEvents && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#888]" />
                )}
              </h3>
            </div>
            
            <EventTimeline eventos={allEventos} />
          </div>
        )}

        {/* Dados Tab */}
        {activeTab === 'dados' && (
          <div className="mt-6 space-y-6">
            {/* Peso e Volume */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <Scale className="h-5 w-5 text-[#ffc800]" />
                  Peso e Volume
                </h3>
                {!editingPeso ? (
                  <button
                    onClick={() => setEditingPeso(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#aaa] hover:text-[#ffc800] border border-[rgba(255,255,255,0.15)] hover:border-[#ffc800]/40 transition"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSavePeso}
                      disabled={registrarPeso.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingPeso(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#888] border border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.05)] transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-[#888]">Peso Declarado</Label>
                  <p className="text-white font-mono mt-1">{shipment.peso_declarado?.toFixed(2) || "—"} kg</p>
                </div>
                <div>
                  <Label className="text-xs text-[#888]">Peso Constatado</Label>
                  {editingPeso ? (
                    <Input
                      type="number"
                      value={pesoConstatado}
                      onChange={(e) => setPesoConstatado(e.target.value)}
                      className="mt-1 h-9 bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.12)]"
                      placeholder="0.00"
                    />
                  ) : (
                    <p className="text-white font-mono mt-1">{shipment.peso_constatado?.toFixed(2) || "—"} kg</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-[#888]">Volume Declarado</Label>
                  <p className="text-white font-mono mt-1">{shipment.volume_declarado || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-[#888]">Volume Constatado</Label>
                  {editingPeso ? (
                    <Input
                      type="number"
                      value={volumeConstatado}
                      onChange={(e) => setVolumeConstatado(e.target.value)}
                      className="mt-1 h-9 bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.12)]"
                      placeholder="0"
                    />
                  ) : (
                    <p className="text-white font-mono mt-1">{shipment.volume_constatado || "—"}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Data de Decolagem */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#ffc800]" />
                  Data de Decolagem
                </h3>
                {!editingDecolagem ? (
                  <button
                    onClick={() => setEditingDecolagem(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#aaa] hover:text-[#ffc800] border border-[rgba(255,255,255,0.15)] hover:border-[#ffc800]/40 transition"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDecolagem}
                      disabled={updateDecolagem.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingDecolagem(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#888] border border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.05)] transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              
              {editingDecolagem ? (
                <Input
                  type="datetime-local"
                  value={dataDecolagem}
                  onChange={(e) => setDataDecolagem(e.target.value)}
                  className="max-w-xs h-9 bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.12)]"
                />
              ) : (
                <p className="text-white font-mono">
                  {formatDate(shipment.dep_datetime || shipment.data_decolagem_ultimo_trecho)}
                </p>
              )}
            </div>

            {/* Tratamentos Especiais - Display Only */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-[#ffc800]" />
                  Tratamentos Especiais
                </h3>
              </div>
              
              {(() => {
                // Get raw value from shipment
                const rawTratamentos = shipment.tratamentos_especiais as string | string[] | null | undefined;
                
                // Parse tratamentos - handle string or array
                let tratamentosList: string[] = [];
                if (Array.isArray(rawTratamentos)) {
                  tratamentosList = rawTratamentos.filter(Boolean);
                } else if (typeof rawTratamentos === "string" && rawTratamentos.trim()) {
                  // Filter out common "no treatment" phrases
                  const normalized = rawTratamentos.trim();
                  if (!normalized.toLowerCase().includes("sem tratamento") && 
                      !normalized.toLowerCase().includes("nenhum") &&
                      normalized.length > 0) {
                    tratamentosList = normalized.split(/[,;\s]+/).filter(Boolean);
                  }
                }
                
                if (tratamentosList.length === 0) {
                  return (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-[#aaa] text-sm">Sem tratamento especial</span>
                    </div>
                  );
                }
                
                return (
                  <div className="flex flex-wrap gap-2">
                    {tratamentosList.map((t, idx) => (
                      <Badge
                        key={idx}
                        className="px-3 py-1.5 text-xs font-medium bg-[#ffc800]/20 text-[#ffc800] border-[#ffc800]/40"
                      >
                        {t.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Exceções Tab */}
        {activeTab === 'excecoes' && (
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden mt-6">
            <div className="p-4 border-b border-[rgba(255,255,255,0.08)]">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#ffc800]" />
                Exceções Operacionais ({excecoes.length})
              </h3>
            </div>
            
            {excecoes.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
                <p className="text-[#888]">Nenhuma exceção registrada</p>
              </div>
            ) : (
              <div className="divide-y divide-[rgba(255,255,255,0.08)]">
                {excecoes.map((exc) => (
                  <div key={exc.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={cn(
                            "text-xs",
                            exc.status_excecao === "ABERTA" && "bg-red-500/20 text-red-400 border-red-500/30",
                            exc.status_excecao === "EM_ANALISE" && "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                            exc.status_excecao === "RESOLVIDA" && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          )}>
                            {exc.status_excecao.replace(/_/g, " ")}
                          </Badge>
                          <Badge className="text-xs bg-[rgba(255,200,0,0.1)] text-[#ffc800] border-[#ffc800]/30">
                            {exc.tipo_excecao.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-[#aaa] text-sm">{exc.descricao}</p>
                        <p className="text-[#666] text-xs mt-2">
                          Criado em {formatDate(exc.created_at)}
                          {exc.fonte_detectou && ` • Fonte: ${exc.fonte_detectou}`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
