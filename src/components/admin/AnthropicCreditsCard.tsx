import { useState, useEffect } from "react";
import { DollarSign, Plus, AlertTriangle, TrendingDown, Calendar, CreditCard, History, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageCard } from "@/components/layout/PageCard";
import { cn } from "@/lib/utils";

interface CreditTopUp {
  id: number;
  credit_date: string;
  amount_usd: number;
  notes: string | null;
  created_at: string;
}

interface CreditBalance {
  total_credits: number;
  total_consumption: number;
  estimated_balance: number;
  last_topup_date: string | null;
  last_topup_amount: number | null;
  avg_daily_consumption: number;
  projected_days_remaining: number;
  days_since_last_topup: number;
}

interface AnthropicCreditsCardProps {
  anthropicStats?: {
    total_calls: number;
    error_count: number;
    success_rate: number;
  };
  onRefresh?: () => void;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("pt-BR");
};

export function AnthropicCreditsCard({ anthropicStats, onRefresh }: AnthropicCreditsCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [topups, setTopups] = useState<CreditTopUp[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [newTopup, setNewTopup] = useState({ date: "", amount: "", notes: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCreditsData();
  }, []);

  const fetchCreditsData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_anthropic_credits" },
      });

      if (error) throw error;

      if (data?.success) {
        setBalance(data.balance);
        setTopups(data.topups || []);
      }
    } catch (error) {
      console.error("Error fetching Anthropic credits:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTopup = async () => {
    if (!newTopup.date || !newTopup.amount) {
      toast.error("Data e valor são obrigatórios");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "add_anthropic_credit",
          credit_date: newTopup.date,
          amount_usd: parseFloat(newTopup.amount),
          notes: newTopup.notes || null
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Recarga registrada com sucesso!");
        setNewTopup({ date: "", amount: "", notes: "" });
        setIsAddDialogOpen(false);
        fetchCreditsData();
        onRefresh?.();
      }
    } catch (error) {
      console.error("Error adding topup:", error);
      toast.error("Erro ao registrar recarga");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBalanceStatus = () => {
    if (!balance) return { color: "text-white/50", bg: "bg-white/10", label: "Carregando..." };
    
    if (balance.estimated_balance <= 15) {
      return { color: "text-red-400", bg: "bg-red-500/20 border-red-500/50", label: "Crítico" };
    }
    if (balance.estimated_balance <= 30) {
      return { color: "text-amber-400", bg: "bg-amber-500/20 border-amber-500/50", label: "Atenção" };
    }
    if (balance.estimated_balance <= 50) {
      return { color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/50", label: "Moderado" };
    }
    return { color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/50", label: "Saudável" };
  };

  const status = getBalanceStatus();

  return (
    <>
      <PageCard className="border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-purple-900/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                Anthropic Credits
                <Badge className={cn("text-[10px]", status.bg)}>
                  {status.label}
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground">Sistema de recargas pré-pagas</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsHistoryDialogOpen(true)}
              className="h-8 px-3 text-xs border-white/20 hover:bg-white/5"
            >
              <History className="w-3.5 h-3.5 mr-1.5" />
              Histórico
            </Button>
            <Button
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
              className="h-8 px-3 text-xs bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Registrar Recarga
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : !balance ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm">Nenhuma recarga registrada</p>
            <Button
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
              className="mt-3 bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Registrar primeira recarga
            </Button>
          </div>
        ) : (
          <>
            {/* Balance Alert */}
            {balance.estimated_balance <= 30 && (
              <div className={cn(
                "mb-4 p-3 rounded-lg flex items-start gap-2 border",
                balance.estimated_balance <= 15 
                  ? "bg-red-500/10 border-red-500/40" 
                  : "bg-amber-500/10 border-amber-500/40"
              )}>
                <AlertTriangle className={cn(
                  "w-4 h-4 mt-0.5 flex-shrink-0",
                  balance.estimated_balance <= 15 ? "text-red-400" : "text-amber-400"
                )} />
                <div>
                  <p className={cn(
                    "text-sm font-medium",
                    balance.estimated_balance <= 15 ? "text-red-400" : "text-amber-400"
                  )}>
                    {balance.estimated_balance <= 15 
                      ? "Saldo crítico! Recarregue imediatamente." 
                      : "Saldo baixo. Considere recarregar em breve."}
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">
                    Aproximadamente {balance.projected_days_remaining} dia{balance.projected_days_remaining !== 1 ? 's' : ''} restantes
                  </p>
                </div>
              </div>
            )}

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3" />
                  Saldo Estimado
                </div>
                <div className={cn("text-xl font-bold mt-1", status.color)}>
                  {formatCurrency(balance.estimated_balance)}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Dias Restantes
                </div>
                <div className={cn(
                  "text-xl font-bold mt-1",
                  balance.projected_days_remaining <= 3 ? "text-red-400" :
                  balance.projected_days_remaining <= 7 ? "text-amber-400" : "text-white"
                )}>
                  ~{balance.projected_days_remaining}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3" />
                  Consumo/Dia
                </div>
                <div className="text-xl font-bold mt-1 text-white">
                  {formatCurrency(balance.avg_daily_consumption)}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="w-3 h-3" />
                  Total Recargas
                </div>
                <div className="text-xl font-bold mt-1 text-purple-400">
                  {formatCurrency(balance.total_credits)}
                </div>
              </div>
            </div>

            {/* Last Topup Info */}
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-300">Última recarga</p>
                  <p className="text-sm font-medium text-white mt-0.5">
                    {formatCurrency(balance.last_topup_amount || 0)} em {formatDate(balance.last_topup_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-purple-300">Há</p>
                  <p className="text-sm font-medium text-white mt-0.5">
                    {balance.days_since_last_topup} dia{balance.days_since_last_topup !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Usage Stats from Anthropic */}
            {anthropicStats && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-muted-foreground mb-2">Uso nos últimos 30 dias</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">{anthropicStats.total_calls.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Chamadas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">{anthropicStats.success_rate.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Sucesso</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">{anthropicStats.error_count}</p>
                    <p className="text-[10px] text-muted-foreground">Erros</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </PageCard>

      {/* Add Topup Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md bg-[#0d0e14] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-400" />
              Registrar Recarga Anthropic
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="credit-date">Data da Recarga</Label>
              <Input
                id="credit-date"
                type="date"
                value={newTopup.date}
                onChange={(e) => setNewTopup(prev => ({ ...prev, date: e.target.value }))}
                className="bg-[#0a0b10] border-white/20"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="credit-amount">Valor (USD)</Label>
              <Input
                id="credit-amount"
                type="number"
                step="0.01"
                placeholder="100.00"
                value={newTopup.amount}
                onChange={(e) => setNewTopup(prev => ({ ...prev, amount: e.target.value }))}
                className="bg-[#0a0b10] border-white/20"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="credit-notes">Observações (opcional)</Label>
              <Input
                id="credit-notes"
                placeholder="Ex: Recarga mensal"
                value={newTopup.notes}
                onChange={(e) => setNewTopup(prev => ({ ...prev, notes: e.target.value }))}
                className="bg-[#0a0b10] border-white/20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              className="border-white/20"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddTopup}
              disabled={isSubmitting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl bg-[#0d0e14] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              Histórico de Recargas Anthropic
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            {topups.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhuma recarga registrada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-muted-foreground">Data</TableHead>
                    <TableHead className="text-muted-foreground text-right">Valor</TableHead>
                    <TableHead className="text-muted-foreground">Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topups.map((topup) => (
                    <TableRow key={topup.id} className="border-white/5">
                      <TableCell className="text-white">
                        {formatDate(topup.credit_date)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-purple-400">
                        {formatCurrency(topup.amount_usd)}
                      </TableCell>
                      <TableCell className="text-white/60 text-sm">
                        {topup.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          <div className="pt-4 border-t border-white/10">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total recarregado:</span>
              <span className="font-bold text-purple-400">
                {formatCurrency(topups.reduce((sum, t) => sum + t.amount_usd, 0))}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
