import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { KpiCard } from "@/components/demurrage/KpiCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Plus, Edit, Trash2, Clock, TrendingUp, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const CONTAINER_TYPES = [
  { value: "20DV", label: "20' Dry Van" },
  { value: "40DV", label: "40' Dry Van" },
  { value: "40HC", label: "40' High Cube" },
  { value: "20RF", label: "20' Reefer" },
  { value: "40RF", label: "40' Reefer" },
  { value: "45HC", label: "45' High Cube" },
];

// Mock data
const mockRates = [
  { id: "1", armador: "MSC", container_type: "40HC", free_time_days: 7, period_type: "first_period", rate_usd: 150, period_start_day: 8, period_end_day: 14 },
  { id: "2", armador: "MSC", container_type: "40HC", free_time_days: 7, period_type: "second_period", rate_usd: 200, period_start_day: 15, period_end_day: 21 },
  { id: "3", armador: "HAPAG", container_type: "20DV", free_time_days: 10, period_type: "first_period", rate_usd: 100, period_start_day: 11, period_end_day: 17 },
  { id: "4", armador: "MAERSK", container_type: "40DV", free_time_days: 7, period_type: "first_period", rate_usd: 180, period_start_day: 8, period_end_day: 14 },
];

export default function DemurrageRates() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [filterArmador, setFilterArmador] = useState<string>("all");

  const [formData, setFormData] = useState({
    container_type: '',
    free_time_days: '7',
    period_type: 'first_period',
    rate_usd: '150',
    period_start_day: '',
    period_end_day: '',
    armador: '',
  });

  const armadors = [...new Set(mockRates.map(r => r.armador))].sort();

  const filteredRates = mockRates.filter(rate => {
    if (activeTab !== 'all' && rate.container_type !== activeTab) return false;
    if (filterArmador !== 'all' && rate.armador !== filterArmador) return false;
    return true;
  });

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const formatPeriodType = (pt: string) => ({
    free_period: 'Free Time',
    first_period: '1º Período',
    second_period: '2º Período',
    third_period: '3º Período'
  }[pt] || pt);

  const getPeriodBadgeColor = (pt: string) => {
    switch (pt) {
      case 'free_period': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'first_period': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'second_period': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'third_period': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return '';
    }
  };

  const handleSave = () => {
    toast.success("Tarifa salva com sucesso!");
    setShowAddDialog(false);
  };

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention — Tarifas"
      pageIcon={DollarSign}
    >
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-end">
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Tarifa
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {CONTAINER_TYPES.slice(0, 6).map((type, index) => {
            const count = mockRates.filter(r => r.container_type === type.value).length;
            const isActive = activeTab === type.value;
            return (
              <KpiCard
                key={type.value}
                title={type.value}
                value={count}
                subtitle={`${7} dias FT`}
                icon={<Clock className="h-5 w-5" />}
                variant={isActive ? "primary" : "default"}
                onClick={() => setActiveTab(activeTab === type.value ? 'all' : type.value)}
                className={isActive ? "ring-2 ring-primary" : ""}
              />
            );
          })}
        </div>

        {/* Filters */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros:</span>
              </div>
              <Select value={filterArmador} onValueChange={setFilterArmador}>
                <SelectTrigger className="w-48 bg-background/50">
                  <SelectValue placeholder="Armador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Armadores</SelectItem>
                  {armadors.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(activeTab !== 'all' || filterArmador !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => { setActiveTab('all'); setFilterArmador('all'); }}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rates Table */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <TrendingUp className="h-5 w-5 text-primary" />
              Tarifas Configuradas
            </CardTitle>
            <CardDescription>
              {filteredRates.length} tarifa(s) {activeTab !== 'all' ? `para ${activeTab}` : ''} {filterArmador !== 'all' ? `- ${filterArmador}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!filteredRates.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma tarifa encontrada</p>
              </div>
            ) : (
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
                  {filteredRates.map((rate) => (
                    <TableRow key={rate.id} className="border-[rgba(255,255,255,0.1)]">
                      <TableCell className="font-medium">{rate.armador}</TableCell>
                      <TableCell><span className="font-mono">{rate.container_type}</span></TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-green-500/10 text-green-600">
                          <Clock className="h-3 w-3 mr-1" />
                          {rate.free_time_days}d
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPeriodBadgeColor(rate.period_type)}>
                          {formatPeriodType(rate.period_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {rate.period_start_day}-{rate.period_end_day}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {formatCurrency(rate.rate_usd)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova Tarifa de Demurrage</DialogTitle>
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
                    />
                  </div>
                  <div>
                    <Label>Tipo de Container</Label>
                    <Select value={formData.container_type} onValueChange={(v) => setFormData(p => ({...p, container_type: v}))}>
                      <SelectTrigger>
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

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-3">Free Time e Período</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Free Time (dias)</Label>
                    <Input 
                      type="number" 
                      value={formData.free_time_days} 
                      onChange={e => setFormData({...formData, free_time_days: e.target.value})} 
                    />
                  </div>
                  <div>
                    <Label>Período</Label>
                    <Select value={formData.period_type} onValueChange={(v) => setFormData(p => ({...p, period_type: v}))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_period">1º Período</SelectItem>
                        <SelectItem value="second_period">2º Período</SelectItem>
                        <SelectItem value="third_period">3º Período</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Taxa USD/dia</Label>
                    <Input 
                      type="number" 
                      value={formData.rate_usd} 
                      onChange={e => setFormData({...formData, rate_usd: e.target.value})} 
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
              <Button onClick={handleSave}>Salvar Tarifa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}
