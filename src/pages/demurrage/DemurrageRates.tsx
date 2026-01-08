import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Plus, Edit, Trash2, Clock, TrendingUp, Filter, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useDemurrageRates, useCreateDemurrageRate, useUpdateDemurrageRate, useDeleteDemurrageRate, DemurrageRate } from "@/hooks/useDemurrageData";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/layout/TablePagination";

const CONTAINER_TYPES = [
  { value: "20DV", label: "20' Dry Van" },
  { value: "40DV", label: "40' Dry Van" },
  { value: "40HC", label: "40' High Cube" },
  { value: "20RF", label: "20' Reefer" },
  { value: "40RF", label: "40' Reefer" },
  { value: "45HC", label: "45' High Cube" },
];

type QuickFilter = "20DV" | "40DV" | "40HC" | "20RF" | "40RF" | "45HC" | "all";
const PAGE_SIZE = 15;

export default function DemurrageRates() {
  const { data: rates = [], isLoading, error } = useDemurrageRates();
  const createRate = useCreateDemurrageRate();
  const updateRate = useUpdateDemurrageRate();
  const deleteRate = useDeleteDemurrageRate();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRate, setEditingRate] = useState<DemurrageRate | null>(null);
  const [deletingRate, setDeletingRate] = useState<DemurrageRate | null>(null);
  const [filterArmador, setFilterArmador] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [formData, setFormData] = useState({
    container_type: '',
    free_time_days: '7',
    period_type: 'first_period',
    rate_usd: '150',
    period_start_day: '',
    period_end_day: '',
    armador: '',
  });

  const armadors = useMemo(() => [...new Set(rates.map(r => r.armador))].sort(), [rates]);

  const filteredRates = useMemo(() => rates.filter(rate => {
    const matchesArmador = filterArmador === 'all' || rate.armador === filterArmador;
    const matchesQuickFilter = quickFilter === 'all' || rate.container_type === quickFilter;
    return matchesArmador && matchesQuickFilter;
  }), [rates, filterArmador, quickFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterArmador, quickFilter]);

  const totalPages = Math.ceil(filteredRates.length / PAGE_SIZE);
  const paginatedRates = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRates.slice(start, start + PAGE_SIZE);
  }, [filteredRates, currentPage]);

  // Calculate KPI stats per container type
  const containerStats = useMemo(() => {
    const stats: Record<string, { count: number; avgFreeTime: number }> = {};
    CONTAINER_TYPES.forEach(ct => {
      const typeRates = rates.filter(r => r.container_type === ct.value);
      const avgFT = typeRates.length > 0 
        ? Math.round(typeRates.reduce((sum, r) => sum + r.free_time_days, 0) / typeRates.length)
        : 0;
      stats[ct.value] = { count: typeRates.length, avgFreeTime: avgFT };
    });
    return stats;
  }, [rates]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPeriodType = (pt: string) => ({
    free_period: 'Free Time',
    first_period: '1º Período',
    second_period: '2º Período',
    third_period: '3º Período',
    standard: 'Padrão',
  }[pt] || pt);

  const getPeriodBadgeColor = (pt: string) => {
    switch (pt) {
      case 'free_period': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'first_period': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'second_period': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'third_period': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'standard': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      default: return '';
    }
  };

  const resetForm = () => {
    setFormData({
      container_type: '',
      free_time_days: '7',
      period_type: 'first_period',
      rate_usd: '150',
      period_start_day: '',
      period_end_day: '',
      armador: '',
    });
  };

  const openAddDialog = () => {
    resetForm();
    setEditingRate(null);
    setShowAddDialog(true);
  };

  const openEditDialog = (rate: DemurrageRate) => {
    setFormData({
      armador: rate.armador,
      container_type: rate.container_type,
      free_time_days: String(rate.free_time_days),
      period_type: rate.period_type || 'standard',
      rate_usd: String(rate.rate_usd),
      period_start_day: rate.period_start_day ? String(rate.period_start_day) : '',
      period_end_day: rate.period_end_day ? String(rate.period_end_day) : '',
    });
    setEditingRate(rate);
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!formData.armador || !formData.container_type) {
      toast.error("Armador e tipo de container são obrigatórios");
      return;
    }

    try {
      const payload = {
        armador: formData.armador.toUpperCase(),
        container_type: formData.container_type,
        free_time_days: parseInt(formData.free_time_days) || 7,
        rate_usd: parseFloat(formData.rate_usd) || 0,
        period_type: formData.period_type,
        period_start_day: formData.period_start_day ? parseInt(formData.period_start_day) : undefined,
        period_end_day: formData.period_end_day ? parseInt(formData.period_end_day) : undefined,
      };

      if (editingRate) {
        await updateRate.mutateAsync({ id: editingRate.id, ...payload });
        toast.success("Tarifa atualizada com sucesso!");
      } else {
        await createRate.mutateAsync(payload);
        toast.success("Tarifa criada com sucesso!");
      }
      setShowAddDialog(false);
      resetForm();
    } catch (err) {
      toast.error(`Erro ao salvar tarifa: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingRate) return;
    try {
      await deleteRate.mutateAsync(deletingRate.id);
      toast.success("Tarifa excluída com sucesso!");
      setDeletingRate(null);
    } catch (err) {
      toast.error(`Erro ao excluir tarifa: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  const handleQuickFilterChange = (filter: QuickFilter) => {
    setQuickFilter(filter);
  };

  const rightActions = (
    <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]" onClick={openAddDialog}>
      <Plus className="h-4 w-4 mr-2" />
      Nova Tarifa
    </Button>
  );

  const customCards = (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {CONTAINER_TYPES.map(ct => (
        <KpiCard
          key={ct.value}
          title={ct.value}
          value={containerStats[ct.value]?.count || 0}
          subtitle={containerStats[ct.value]?.avgFreeTime ? `${containerStats[ct.value].avgFreeTime} dias FT` : '- dias FT'}
          icon={<Clock className="h-5 w-5" />}
          variant="default"
          isActive={quickFilter === ct.value}
          onClick={() => handleQuickFilterChange(ct.value as QuickFilter)}
        />
      ))}
    </div>
  );

  return (
    <DemurrageLayout
      rightActions={rightActions}
      customCards={customCards}
    >
      <div className="space-y-4">
        {/* Filters */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros:</span>
              </div>
              <Select value={filterArmador} onValueChange={setFilterArmador}>
                <SelectTrigger className="w-48 bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                  <SelectValue placeholder="Armador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Armadores</SelectItem>
                  {armadors.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(filterArmador !== 'all' || quickFilter !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterArmador('all'); setQuickFilter('all'); }} className="text-muted-foreground hover:text-white">
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rates Table */}
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <TrendingUp className="h-5 w-5 text-[#ffc800]" />
              Tarifas Configuradas
            </CardTitle>
            <CardDescription>
              {filteredRates.length} tarifa(s) {filterArmador !== 'all' ? `- ${filterArmador}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-400">
                <p>Erro ao carregar tarifas: {error instanceof Error ? error.message : 'Erro desconhecido'}</p>
              </div>
            ) : !filteredRates.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma tarifa encontrada</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead>Armador</TableHead>
                      <TableHead>Container</TableHead>
                      <TableHead className="text-center">Free Time</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-center">Dias</TableHead>
                      <TableHead className="text-right">USD/dia</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRates.map((rate) => (
                      <TableRow key={rate.id} className="border-[rgba(255,255,255,0.1)]">
                        <TableCell className="font-medium">{rate.armador}</TableCell>
                        <TableCell><span className="font-mono">{rate.container_type}</span></TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20"><Clock className="h-3 w-3 mr-1" />{rate.free_time_days}d</Badge></TableCell>
                        <TableCell><Badge className={getPeriodBadgeColor(rate.period_type || 'standard')}>{formatPeriodType(rate.period_type || 'standard')}</Badge></TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{rate.period_start_day && rate.period_end_day ? `${rate.period_start_day}-${rate.period_end_day}` : '-'}</TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(rate.rate_usd)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white" onClick={() => openEditDialog(rate)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-400" onClick={() => setDeletingRate(rate)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} maxVisiblePages={5} showFirstLast={false} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-2xl bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)]">
            <DialogHeader>
              <DialogTitle>{editingRate ? 'Editar Tarifa' : 'Nova Tarifa de Demurrage'}</DialogTitle>
              <DialogDescription>Configure Free Time e tarifas por período</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div>
                <h4 className="text-sm font-medium mb-3">Identificação</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Armador</Label>
                    <Input 
                      value={formData.armador} 
                      onChange={e => setFormData({...formData, armador: e.target.value})} 
                      placeholder="MSC, MAERSK, HAPAG..."
                      className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                    />
                  </div>
                  <div>
                    <Label>Tipo de Container</Label>
                    <Select value={formData.container_type} onValueChange={(v) => setFormData(p => ({...p, container_type: v}))}>
                      <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTAINER_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator className="bg-[rgba(255,255,255,0.1)]" />

              <div>
                <h4 className="text-sm font-medium mb-3">Free Time e Período</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Free Time (dias)</Label>
                    <Input 
                      type="number" 
                      value={formData.free_time_days} 
                      onChange={e => setFormData({...formData, free_time_days: e.target.value})}
                      className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                    />
                  </div>
                  <div>
                    <Label>Período</Label>
                    <Select value={formData.period_type} onValueChange={(v) => setFormData(p => ({...p, period_type: v}))}>
                      <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Padrão</SelectItem>
                        <SelectItem value="first_period">1º Período</SelectItem>
                        <SelectItem value="second_period">2º Período</SelectItem>
                        <SelectItem value="third_period">3º Período</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <Label>Dia Início</Label>
                    <Input 
                      type="number" 
                      value={formData.period_start_day} 
                      onChange={e => setFormData({...formData, period_start_day: e.target.value})}
                      placeholder="Ex: 8"
                      className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                    />
                  </div>
                  <div>
                    <Label>Dia Fim</Label>
                    <Input 
                      type="number" 
                      value={formData.period_end_day} 
                      onChange={e => setFormData({...formData, period_end_day: e.target.value})}
                      placeholder="Ex: 14"
                      className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                    />
                  </div>
                  <div>
                    <Label>Taxa USD/dia</Label>
                    <Input 
                      type="number" 
                      value={formData.rate_usd} 
                      onChange={e => setFormData({...formData, rate_usd: e.target.value})}
                      className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)} className="border-[rgba(255,255,255,0.2)]">
                Cancelar
              </Button>
              <Button 
                onClick={handleSave} 
                className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
                disabled={createRate.isPending || updateRate.isPending}
              >
                {(createRate.isPending || updateRate.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRate ? 'Atualizar' : 'Salvar'} Tarifa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingRate} onOpenChange={(open) => !open && setDeletingRate(null)}>
          <AlertDialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)]">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a tarifa de <strong>{deletingRate?.armador}</strong> para container <strong>{deletingRate?.container_type}</strong>?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[rgba(255,255,255,0.2)]">Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteRate.isPending}
              >
                {deleteRate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DemurrageLayout>
  );
}
