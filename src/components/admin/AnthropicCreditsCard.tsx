import { useState, useEffect } from "react";
import { DollarSign, Plus, AlertTriangle, TrendingDown, Calendar, CreditCard, History, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

// Hook para gerenciar créditos Anthropic
export function useAnthropicCredits() {
  const [isLoading, setIsLoading] = useState(true);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [topups, setTopups] = useState<CreditTopUp[]>([]);

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

  return { balance, topups, isLoading, fetchCreditsData };
}

// Dialog para adicionar recarga
interface AnthropicTopupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AnthropicTopupDialog({ isOpen, onOpenChange, onSuccess }: AnthropicTopupDialogProps) {
  const [newTopup, setNewTopup] = useState({ date: "", amount: "", notes: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error("Error adding topup:", error);
      toast.error("Erro ao registrar recarga");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
            onClick={() => onOpenChange(false)}
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
  );
}

// Dialog para histórico de recargas
interface AnthropicHistoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  topups: CreditTopUp[];
}

export function AnthropicHistoryDialog({ isOpen, onOpenChange, topups }: AnthropicHistoryDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
  );
}

// Obter status do saldo
export function getBalanceStatus(balance: CreditBalance | null) {
  if (!balance) return { color: "text-white/50", bg: "bg-white/10", label: "..." };
  
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
}

// Formatação para exportar
export { formatCurrency as formatAnthropicCurrency };
