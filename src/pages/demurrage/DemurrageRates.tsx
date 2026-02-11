import { useState, useMemo, useEffect } from "react";
import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Plus, Edit, Trash2, Clock, TrendingUp, Filter, Loader2, FileSpreadsheet, CheckSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useDemurrageRates, useCreateDemurrageRate, useUpdateDemurrageRate, useDeleteDemurrageRate, useBulkDeleteDemurrageRates, DemurrageRate } from "@/hooks/useDemurrageData";
import { Checkbox } from "@/components/ui/checkbox";
import { ImportRatesDialog } from "@/components/demurrage/ImportRatesDialog";
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
  const bulkDelete = useBulkDeleteDemurrageRates();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingRate, setEditingRate] = useState<DemurrageRate | null>(null);
  const [deletingRate, setDeletingRate] = useState<DemurrageRate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
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

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    // Optional armador field - only validate length if provided
    if (formData.armador.length > 50) {
      errors.armador = "Máximo 50 caracteres";
    }
    
    if (!formData.container_type) {
      errors.container_type = "Tipo de container é obrigatório";
    }
    
    // Free time validation (1-365 days)
    const freeTimeDays = parseInt(formData.free_time_days);
    if (isNaN(freeTimeDays) || freeTimeDays < 1) {
      errors.free_time_days = "Mínimo: 1 dia";
    } else if (freeTimeDays > 365) {
      errors.free_time_days = "Máximo: 365 dias";
    }
    
    // Rate validation (0.01 - 10000 USD)
    const rateUsd = parseFloat(formData.rate_usd);
    if (isNaN(rateUsd) || rateUsd < 0.01) {
      errors.rate_usd = "Mínimo: $0.01";
    } else if (rateUsd > 10000) {
      errors.rate_usd = "Máximo: $10,000";
    }
    
    // Period days validation
    const startDay = formData.period_start_day ? parseInt(formData.period_start_day) : null;
    const endDay = formData.period_end_day ? parseInt(formData.period_end_day) : null;
    
    if (startDay !== null) {
      if (startDay < 1) {
        errors.period_start_day = "Mínimo: 1";
      } else if (startDay > 365) {
        errors.period_start_day = "Máximo: 365";
      }
    }
    
    if (endDay !== null) {
      if (endDay < 1) {
        errors.period_end_day = "Mínimo: 1";
      } else if (endDay > 365) {
        errors.period_end_day = "Máximo: 365";
      }
    }
    
    // Cross-field validation: start day must be less than end day
    if (startDay !== null && endDay !== null && startDay >= endDay) {
      errors.period_start_day = "Deve ser menor que dia fim";
      errors.period_end_day = "Deve ser maior que dia início";
    }
    
    // If one period field is filled, the other should be too
    if ((startDay !== null && endDay === null) || (startDay === null && endDay !== null)) {
      if (!startDay) errors.period_start_day = "Preencha ambos os dias";
      if (!endDay) errors.period_end_day = "Preencha ambos os dias";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
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
    if (!validateForm()) {
      toast.error("Corrija os erros no formulário");
      return;
    }

    try {
      const payload = {
        armador: formData.armador.trim().toUpperCase(),
        container_type: formData.container_type,
        free_time_days: parseInt(formData.free_time_days),
        rate_usd: parseFloat(formData.rate_usd),
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

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRates.map(r => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    try {
      await bulkDelete.mutateAsync(Array.from(selectedIds));
      toast.success(`${selectedIds.size} tarifa(s) excluída(s) com sucesso!`);
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
    } catch (err) {
      toast.error(`Erro ao excluir tarifas: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  const rightActions = (
    <div className="flex gap-2">
      <Button 
        variant="outline"
        className="bg-[rgba(0,0,0,0.7)] border-[rgba(255,255,255,0.25)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,0.9)]"
        onClick={() => setShowImportDialog(true)}
      >
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Importar Excel
      </Button>
      <Button className="bg-[#ffc800] text-black hover:bg-[#e6b400]" onClick={openAddDialog}>
        <Plus className="h-4 w-4 mr-2" />
        Nova Tarifa
      </Button>
    </div>
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-foreground text-base">
                  <TrendingUp className="h-5 w-5 text-[#ffc800]" />
                  Tarifas Configuradas
                </CardTitle>
                <CardDescription>
                  {filteredRates.length} tarifa(s) {filterArmador !== 'all' ? `- ${filterArmador}` : ''}
                </CardDescription>
              </div>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir {selectedIds.size} selecionada(s)
                </Button>
              )}
            </div>
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
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filteredRates.length > 0 && selectedIds.size === filteredRates.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Armador</TableHead>
                      <TableHead>Container</TableHead>
                      <TableHead className="text-center">Free Time</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-center">Dias</TableHead>
                      <TableHead className="text-right">USD/dia</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRates.map((rate) => (
                      <TableRow key={rate.id} className={`border-[rgba(255,255,255,0.1)] ${selectedIds.has(rate.id) ? 'bg-primary/5' : ''}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(rate.id)}
                            onCheckedChange={() => toggleSelect(rate.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{rate.armador}</TableCell>
                        <TableCell><span className="font-mono">{rate.container_type}</span></TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20"><Clock className="h-3 w-3 mr-1" />{rate.free_time_days}d</Badge></TableCell>
                        <TableCell><Badge className={getPeriodBadgeColor(rate.period_type || 'standard')}>{formatPeriodType(rate.period_type || 'standard')}</Badge></TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{rate.period_start_day && rate.period_end_day ? `${rate.period_start_day}-${rate.period_end_day}` : '-'}</TableCell>
                        <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(rate.rate_usd)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rate.created_at 
                            ? new Date(rate.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) 
                            : '-'}
                        </TableCell>
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
                  <div className="space-y-1">
                    <Label>Armador</Label>
                    <Input 
                      value={formData.armador} 
                      onChange={e => {
                        setFormData({...formData, armador: e.target.value});
                        if (formErrors.armador) setFormErrors(prev => ({ ...prev, armador: '' }));
                      }} 
                      placeholder="MSC, MAERSK, HAPAG..."
                      className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${formErrors.armador ? 'border-red-500' : ''}`}
                      maxLength={50}
                    />
                    {formErrors.armador && <p className="text-xs text-red-400">{formErrors.armador}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de Container</Label>
                    <Select 
                      value={formData.container_type} 
                      onValueChange={(v) => {
                        setFormData(p => ({...p, container_type: v}));
                        if (formErrors.container_type) setFormErrors(prev => ({ ...prev, container_type: '' }));
                      }}
                    >
                      <SelectTrigger className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${formErrors.container_type ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTAINER_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.container_type && <p className="text-xs text-red-400">{formErrors.container_type}</p>}
                  </div>
                </div>
              </div>

              <Separator className="bg-[rgba(255,255,255,0.1)]" />

              <div>
                <h4 className="text-sm font-medium mb-3">Free Time e Período</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Free Time (dias)</Label>
                    <Input 
                      type="number" 
                      min={1}
                      max={365}
                      value={formData.free_time_days} 
                      onChange={e => {
                        setFormData({...formData, free_time_days: e.target.value});
                        if (formErrors.free_time_days) setFormErrors(prev => ({ ...prev, free_time_days: '' }));
                      }}
                      className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${formErrors.free_time_days ? 'border-red-500' : ''}`}
                    />
                    {formErrors.free_time_days && <p className="text-xs text-red-400">{formErrors.free_time_days}</p>}
                    <p className="text-xs text-muted-foreground">1-365 dias</p>
                  </div>
                  <div className="space-y-1">
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
                  <div className="space-y-1">
                    <Label>Dia Início</Label>
                    <Input 
                      type="number"
                      min={1}
                      max={365}
                      value={formData.period_start_day} 
                      onChange={e => {
                        setFormData({...formData, period_start_day: e.target.value});
                        if (formErrors.period_start_day) setFormErrors(prev => ({ ...prev, period_start_day: '', period_end_day: '' }));
                      }}
                      placeholder="Ex: 8"
                      className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${formErrors.period_start_day ? 'border-red-500' : ''}`}
                    />
                    {formErrors.period_start_day && <p className="text-xs text-red-400">{formErrors.period_start_day}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Dia Fim</Label>
                    <Input 
                      type="number"
                      min={1}
                      max={365}
                      value={formData.period_end_day} 
                      onChange={e => {
                        setFormData({...formData, period_end_day: e.target.value});
                        if (formErrors.period_end_day) setFormErrors(prev => ({ ...prev, period_start_day: '', period_end_day: '' }));
                      }}
                      placeholder="Ex: 14"
                      className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${formErrors.period_end_day ? 'border-red-500' : ''}`}
                    />
                    {formErrors.period_end_day && <p className="text-xs text-red-400">{formErrors.period_end_day}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Taxa USD/dia</Label>
                    <Input 
                      type="number"
                      min={0.01}
                      max={10000}
                      step={0.01}
                      value={formData.rate_usd} 
                      onChange={e => {
                        setFormData({...formData, rate_usd: e.target.value});
                        if (formErrors.rate_usd) setFormErrors(prev => ({ ...prev, rate_usd: '' }));
                      }}
                      className={`bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] ${formErrors.rate_usd ? 'border-red-500' : ''}`}
                    />
                    {formErrors.rate_usd && <p className="text-xs text-red-400">{formErrors.rate_usd}</p>}
                    <p className="text-xs text-muted-foreground">$0.01 - $10,000</p>
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

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)]">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {selectedIds.size} Tarifa(s)</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir <strong>{selectedIds.size}</strong> tarifa(s) selecionada(s)?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[rgba(255,255,255,0.2)]">Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700"
                disabled={bulkDelete.isPending}
              >
                {bulkDelete.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Excluir {selectedIds.size} Tarifa(s)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import Excel Dialog */}
        <ImportRatesDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
        />
      </div>
    </DemurrageLayout>
  );
}
