import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/cct/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, SLABadge } from "@/components/cct/StatusBadge";
import { useProcessosCCT, useRegistrarPeso, useUpdateTratamentos, useUpdateDecolagem } from "@/hooks/useCCTData";
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

const TRATAMENTOS_IATA = [
  { code: "DGR", label: "Dangerous Goods" },
  { code: "PER", label: "Perishable" },
  { code: "VAL", label: "Valuable" },
  { code: "AVI", label: "Live Animals" },
  { code: "HUM", label: "Human Remains" },
  { code: "EAT", label: "Foodstuff" },
  { code: "ICE", label: "Dry Ice" },
  { code: "MAG", label: "Magnetized" },
];

export default function ProcessoTimeline() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: processos = [], isLoading } = useProcessosCCT();
  const registrarPeso = useRegistrarPeso();
  const updateTratamentos = useUpdateTratamentos();
  const updateDecolagem = useUpdateDecolagem();

  const [activeTab, setActiveTab] = useState("timeline");
  const [editingPeso, setEditingPeso] = useState(false);
  const [editingDecolagem, setEditingDecolagem] = useState(false);
  const [editingTratamentos, setEditingTratamentos] = useState(false);

  // Form states
  const [pesoConstatado, setPesoConstatado] = useState("");
  const [volumeConstatado, setVolumeConstatado] = useState("");
  const [dataDecolagem, setDataDecolagem] = useState("");
  const [tratamentosSelecionados, setTratamentosSelecionados] = useState<string[]>([]);

  const processo = useMemo(() => {
    return processos.find(p => p.shipment.id === id);
  }, [processos, id]);

  // Initialize form values when processo loads
  useMemo(() => {
    if (processo) {
      setPesoConstatado(processo.shipment.peso_constatado?.toString() || "");
      setVolumeConstatado(processo.shipment.volume_constatado?.toString() || "");
      setDataDecolagem(processo.shipment.data_decolagem_ultimo_trecho 
        ? format(new Date(processo.shipment.data_decolagem_ultimo_trecho), "yyyy-MM-dd'T'HH:mm")
        : "");
      const tratamentos = processo.shipment.tratamentos_especiais as string[] | string | null | undefined;
      if (Array.isArray(tratamentos)) {
        setTratamentosSelecionados(tratamentos);
      } else if (typeof tratamentos === "string" && tratamentos) {
        setTratamentosSelecionados(tratamentos.split(",").filter(Boolean));
      } else {
        setTratamentosSelecionados([]);
      }
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

  const handleSaveTratamentos = async () => {
    if (!processo) return;
    try {
      await updateTratamentos.mutateAsync({
        shipmentId: processo.shipment.id,
        tratamentos: tratamentosSelecionados,
      });
      toast.success("Tratamentos atualizados");
      setEditingTratamentos(false);
    } catch (error) {
      toast.error("Erro ao atualizar tratamentos");
    }
  };

  const toggleTratamento = (code: string) => {
    setTratamentosSelecionados(prev => 
      prev.includes(code) ? prev.filter(t => t !== code) : [...prev, code]
    );
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

  const { shipment, status_atual, eventos, excecoes } = processo;

  return (
    <PageLayout
      title="DACHSER"
      subtitle={`Processo ${shipment.house}`}
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
                <SLABadge status={status_atual?.sla_status || "OK"} />
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)]">
            <TabsTrigger value="timeline" className="data-[state=active]:bg-[rgba(255,200,0,0.15)] data-[state=active]:text-[#ffc800]">
              <Clock className="h-4 w-4 mr-2" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="dados" className="data-[state=active]:bg-[rgba(255,200,0,0.15)] data-[state=active]:text-[#ffc800]">
              <FileText className="h-4 w-4 mr-2" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="excecoes" className="data-[state=active]:bg-[rgba(255,200,0,0.15)] data-[state=active]:text-[#ffc800]">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Exceções ({excecoes.length})
            </TabsTrigger>
          </TabsList>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-6">
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden">
              <div className="p-4 border-b border-[rgba(255,255,255,0.08)]">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#ffc800]" />
                  Timeline de Eventos ({eventos.length})
                </h3>
              </div>
              
              {eventos.length === 0 ? (
                <div className="p-10 text-center">
                  <Clock className="h-12 w-12 text-[#666] mx-auto mb-4" />
                  <p className="text-[#888]">Nenhum evento registrado</p>
                </div>
              ) : (
                <div className="p-4">
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.1)]" />
                    
                    <div className="space-y-4">
                      {[...eventos]
                        .sort((a, b) => new Date(b.data_hora_evento).getTime() - new Date(a.data_hora_evento).getTime())
                        .map((evento, index) => (
                          <div key={evento.id} className="relative pl-10">
                            <div className={cn(
                              "absolute left-2.5 w-3 h-3 rounded-full border-2",
                              index === 0 
                                ? "border-[#ffc800] bg-[#ffc800] ring-4 ring-[#ffc800]/20" 
                                : "border-[#666] bg-[#666]"
                            )} />
                            
                            <div className={cn(
                              "p-4 rounded-lg border",
                              evento.nivel_confianca === "COMPLEMENTAR"
                                ? "bg-[rgba(255,255,255,0.02)] border-dashed border-[rgba(255,255,255,0.08)]"
                                : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)]"
                            )}>
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-medium text-white">
                                    {evento.codigo_evento}
                                  </span>
                                  <Badge className="text-xs bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                                    {evento.fonte}
                                  </Badge>
                                  {evento.nivel_confianca === "COMPLEMENTAR" && (
                                    <Badge className="text-xs bg-[rgba(255,255,255,0.1)] text-[#888]">
                                      Complementar
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-[#888]">
                                  {formatDate(evento.data_hora_evento)}
                                </span>
                              </div>
                              {evento.descricao && (
                                <p className="text-sm text-[#aaa] mt-2">{evento.descricao}</p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Dados Tab */}
          <TabsContent value="dados" className="mt-6 space-y-6">
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
                <p className="text-white font-mono">{formatDate(shipment.data_decolagem_ultimo_trecho)}</p>
              )}
            </div>

            {/* Tratamentos Especiais */}
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-[#ffc800]" />
                  Tratamentos Especiais IATA
                </h3>
                {!editingTratamentos ? (
                  <button
                    onClick={() => setEditingTratamentos(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#aaa] hover:text-[#ffc800] border border-[rgba(255,255,255,0.15)] hover:border-[#ffc800]/40 transition"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveTratamentos}
                      disabled={updateTratamentos.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingTratamentos(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#888] border border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.05)] transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {TRATAMENTOS_IATA.map((t) => {
                  const isSelected = tratamentosSelecionados.includes(t.code);
                  return (
                    <button
                      key={t.code}
                      onClick={() => editingTratamentos && toggleTratamento(t.code)}
                      disabled={!editingTratamentos}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition",
                        isSelected
                          ? "bg-[#ffc800]/20 text-[#ffc800] border-[#ffc800]/40"
                          : "bg-[rgba(255,255,255,0.05)] text-[#888] border-[rgba(255,255,255,0.1)]",
                        editingTratamentos && "cursor-pointer hover:bg-[rgba(255,255,255,0.1)]"
                      )}
                    >
                      {t.code}
                      {isSelected && <CheckCircle className="inline h-3 w-3 ml-1" />}
                    </button>
                  );
                })}
              </div>
              
              {tratamentosSelecionados.length === 0 && !editingTratamentos && (
                <p className="text-[#666] text-sm mt-2">Nenhum tratamento especial aplicado</p>
              )}
            </div>
          </TabsContent>

          {/* Exceções Tab */}
          <TabsContent value="excecoes" className="mt-6">
            <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.85)] overflow-hidden">
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
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
