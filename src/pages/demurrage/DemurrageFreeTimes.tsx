import { useState, useMemo, useEffect } from "react";
import { DemurrageFreeTimeDialog } from "@/components/demurrage/DemurrageFreeTimeDialog";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/layout/TablePagination";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Clock, Edit, Trash2, Search, FileText, Ship, Calendar, 
  CheckCircle2, AlertCircle, Package, Info, Plus
} from "lucide-react";
import { 
  useClientFreeTimeList, 
  useUpdateClientFreeTime, 
  useDeleteClientFreeTime,
  ClientFreeTime,
} from "@/hooks/useClientFreeTime";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRecalcDemurrage } from "@/hooks/useDemurrageData";

type QuickFilter = "all" | "contrato" | "processo" | "active" | "expired";
const PAGE_SIZE = 15;

export default function DemurrageFreeTimes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // Dialog states
  const [editingFreeTime, setEditingFreeTime] = useState<ClientFreeTime | null>(null);
  const [deletingFreeTime, setDeletingFreeTime] = useState<ClientFreeTime | null>(null);
  
  // Queries and mutations
  const { data: freeTimes = [], isLoading, refetch } = useClientFreeTimeList();
  const updateMutation = useUpdateClientFreeTime();
  const deleteMutation = useDeleteClientFreeTime();
  const recalcMutation = useRecalcDemurrage();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const isExpired = (ft: ClientFreeTime) => {
    if (!ft.vigencia_fim) return false;
    return new Date(ft.vigencia_fim) < new Date();
  };

  const stats = useMemo(() => {
    const total = freeTimes.length;
    const contratos = freeTimes.filter(ft => ft.tipo_ft === 'CONTRATO').length;
    const processos = freeTimes.filter(ft => ft.tipo_ft === 'PROCESSO').length;
    const ativos = freeTimes.filter(ft => ft.ativo && !isExpired(ft)).length;
    const expirados = freeTimes.filter(ft => isExpired(ft)).length;

    return { total, contratos, processos, ativos, expirados };
  }, [freeTimes]);

  const filteredFreeTimes = useMemo(() => {
    return freeTimes.filter(ft => {
      const matchesSearch = 
        ft.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ft.mbl?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
        (ft.armador?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      
      let matchesQuickFilter = true;
      if (quickFilter === "contrato") {
        matchesQuickFilter = ft.tipo_ft === 'CONTRATO';
      } else if (quickFilter === "processo") {
        matchesQuickFilter = ft.tipo_ft === 'PROCESSO';
      } else if (quickFilter === "active") {
        matchesQuickFilter = ft.ativo && !isExpired(ft);
      } else if (quickFilter === "expired") {
        matchesQuickFilter = isExpired(ft);
      }
      
      const matchesFilter = filterType === "all" || 
        (filterType === "contrato" && ft.tipo_ft === 'CONTRATO') ||
        (filterType === "processo" && ft.tipo_ft === 'PROCESSO');
        
      return matchesSearch && matchesQuickFilter && matchesFilter;
    });
  }, [freeTimes, searchTerm, quickFilter, filterType]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, quickFilter, filterType]);

  const totalPages = Math.ceil(filteredFreeTimes.length / PAGE_SIZE);
  const paginatedFreeTimes = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFreeTimes.slice(start, start + PAGE_SIZE);
  }, [filteredFreeTimes, currentPage]);

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const handleEdit = (ft: ClientFreeTime) => {
    setEditingFreeTime(ft);
  };

  const handleDelete = (ft: ClientFreeTime) => {
    setDeletingFreeTime(ft);
  };

  const confirmDelete = async () => {
    if (!deletingFreeTime) return;
    await deleteMutation.mutateAsync(deletingFreeTime.id);
    setDeletingFreeTime(null);
    // Trigger recalc after deletion
    recalcMutation.mutate();
  };


  const customCards = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        title="TOTAL CADASTROS"
        value={stats.total}
        subtitle="Free times registrados"
        icon={<Clock className="h-6 w-6" />}
        variant="default"
        isActive={quickFilter === "all"}
        onClick={() => handleQuickFilterChange("all")}
      />
      <KpiCard
        title="CONTRATOS"
        value={stats.contratos}
        subtitle="Acordos por cliente"
        icon={<FileText className="h-6 w-6" />}
        variant="info"
        isActive={quickFilter === "contrato"}
        onClick={() => handleQuickFilterChange("contrato")}
      />
      <KpiCard
        title="PROCESSOS"
        value={stats.processos}
        subtitle="Específicos por MBL"
        icon={<Package className="h-6 w-6" />}
        variant="warning"
        isActive={quickFilter === "processo"}
        onClick={() => handleQuickFilterChange("processo")}
      />
      <KpiCard
        title="ATIVOS"
        value={stats.ativos}
        subtitle="Em vigência"
        icon={<CheckCircle2 className="h-6 w-6" />}
        variant="success"
        isActive={quickFilter === "active"}
        onClick={() => handleQuickFilterChange("active")}
      />
      <KpiCard
        title="EXPIRADOS"
        value={stats.expirados}
        subtitle="Fora de vigência"
        icon={<AlertCircle className="h-6 w-6" />}
        variant="critical"
        isActive={quickFilter === "expired"}
        onClick={() => handleQuickFilterChange("expired")}
      />
    </div>
  );

  return (
    <DemurrageLayout
      customCards={customCards}
      loading={isLoading}
      rightActions={
        <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Cadastrar Free Time
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por cliente, MBL ou armador..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                  />
                </div>
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="contrato">Contrato</SelectItem>
                  <SelectItem value="processo">Processo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Clock className="h-5 w-5 text-[#ffc800]" />
              Free Times Cadastrados
            </CardTitle>
            <CardDescription>{filteredFreeTimes.length} registro(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredFreeTimes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhum Free Time cadastrado</p>
                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg max-w-md text-center">
                  <div className="flex items-center justify-center gap-2 text-blue-400 mb-2">
                    <Info className="h-4 w-4" />
                    <span className="font-medium">Como cadastrar?</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    O cadastro de Free Time é feito na tela de Rastreio de Container/MBL, 
                    diretamente no contexto do processo sendo rastreado.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>MBL</TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead className="text-center">Dias FT</TableHead>
                      <TableHead>Vigência</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFreeTimes.map((ft) => (
                      <TableRow key={ft.id} className="border-[rgba(255,255,255,0.1)]">
                        <TableCell className="font-medium">{ft.cliente_nome}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={ft.tipo_ft === 'CONTRATO' 
                              ? "bg-blue-500/20 text-blue-400 border-blue-500/30" 
                              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                            }
                          >
                            {ft.tipo_ft === 'CONTRATO' ? (
                              <><FileText className="h-3 w-3 mr-1" />Contrato</>
                            ) : (
                              <><Package className="h-3 w-3 mr-1" />Processo</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {ft.mbl || "-"}
                        </TableCell>
                        <TableCell>
                          {ft.armador ? (
                            <div className="flex items-center gap-1">
                              <Ship className="h-3 w-3 text-muted-foreground" />
                              {ft.armador}
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-bold text-[#ffc800]">{ft.free_time_days}</span>
                        </TableCell>
                        <TableCell>
                          {ft.vigencia_inicio || ft.vigencia_fim ? (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(ft.vigencia_inicio)} - {formatDate(ft.vigencia_fim)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sem vigência</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isExpired(ft) ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Expirado
                            </Badge>
                          ) : ft.ativo ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-muted-foreground hover:text-white"
                              onClick={() => handleEdit(ft)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-muted-foreground hover:text-red-400"
                              onClick={() => handleDelete(ft)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination 
                  currentPage={currentPage} 
                  totalPages={totalPages} 
                  onPageChange={setCurrentPage} 
                  maxVisiblePages={5} 
                  showFirstLast={false} 
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>


      {/* Edit Free Time Dialog */}
      <EditFreeTimeDialog
        freeTime={editingFreeTime}
        open={!!editingFreeTime}
        onOpenChange={(open) => !open && setEditingFreeTime(null)}
        onSuccess={() => {
          setEditingFreeTime(null);
          refetch();
          recalcMutation.mutate();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingFreeTime} onOpenChange={(open) => !open && setDeletingFreeTime(null)}>
        <AlertDialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o Free Time de{" "}
              <strong className="text-white">{deletingFreeTime?.cliente_nome}</strong>
              {deletingFreeTime?.mbl && (
                <> (MBL: <span className="font-mono">{deletingFreeTime.mbl}</span>)</>
              )}
              ?
              <br /><br />
              Esta ação não pode ser desfeita e o demurrage será recalculado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[rgba(255,255,255,0.2)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Free Time Dialog */}
      <DemurrageFreeTimeDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          refetch();
          recalcMutation.mutate();
        }}
      />
    </DemurrageLayout>
  );
}

// Edit Dialog Component
interface EditFreeTimeDialogProps {
  freeTime: ClientFreeTime | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function EditFreeTimeDialog({ freeTime, open, onOpenChange, onSuccess }: EditFreeTimeDialogProps) {
  const [formData, setFormData] = useState({
    free_time_days: 0,
    vigencia_inicio: "",
    vigencia_fim: "",
    armador: "",
    notas: "",
  });

  const updateMutation = useUpdateClientFreeTime();

  useEffect(() => {
    if (freeTime) {
      setFormData({
        free_time_days: freeTime.free_time_days,
        vigencia_inicio: freeTime.vigencia_inicio?.split('T')[0] || "",
        vigencia_fim: freeTime.vigencia_fim?.split('T')[0] || "",
        armador: freeTime.armador || "",
        notas: freeTime.notas || "",
      });
    }
  }, [freeTime]);

  const handleSubmit = async () => {
    if (!freeTime) return;

    await updateMutation.mutateAsync({
      id: freeTime.id,
      data: {
        free_time_days: formData.free_time_days,
        vigencia_inicio: formData.vigencia_inicio || undefined,
        vigencia_fim: formData.vigencia_fim || undefined,
        armador: formData.armador || undefined,
        notas: formData.notas || undefined,
      },
    });

    onSuccess();
  };

  if (!freeTime) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-[#ffc800]" />
            Editar Free Time
          </DialogTitle>
          <DialogDescription>
            {freeTime.cliente_nome}
            {freeTime.mbl && <span className="font-mono ml-2">({freeTime.mbl})</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Dias de Free Time</Label>
            <Input
              type="number"
              min={0}
              value={formData.free_time_days}
              onChange={(e) => setFormData(prev => ({ ...prev, free_time_days: parseInt(e.target.value) || 0 }))}
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início Vigência</Label>
              <Input
                type="date"
                value={formData.vigencia_inicio}
                onChange={(e) => setFormData(prev => ({ ...prev, vigencia_inicio: e.target.value }))}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
            </div>
            <div className="space-y-2">
              <Label>Fim Vigência</Label>
              <Input
                type="date"
                value={formData.vigencia_fim}
                onChange={(e) => setFormData(prev => ({ ...prev, vigencia_fim: e.target.value }))}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Armador</Label>
            <Input
              value={formData.armador}
              onChange={(e) => setFormData(prev => ({ ...prev, armador: e.target.value }))}
              placeholder="Ex: HAPAG, MSC, MAERSK..."
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
            />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={formData.notas}
              onChange={(e) => setFormData(prev => ({ ...prev, notas: e.target.value }))}
              placeholder="Observações adicionais..."
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-[rgba(255,255,255,0.2)]"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending || formData.free_time_days <= 0}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
