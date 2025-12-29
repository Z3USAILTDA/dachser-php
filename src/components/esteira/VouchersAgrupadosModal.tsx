import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Layers, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface VoucherAgrupado {
  id: string;
  numero_spo: string;
  fornecedor: string | null;
  valor: number | null;
  moeda: string | null;
  vencimento: string;
  etapa_atual: string;
  consolidacao_rm_numero: string;
}

interface VouchersAgrupadosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rmNumero: string;
}

const getEtapaColor = (etapa: string) => {
  const colors: Record<string, string> = {
    A_PROCESSAR: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    RASCUNHO: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    OPERACAO: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    FISCAL: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    SUPERVISOR: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    FINANCEIRO: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    ROBO: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    CONCLUIDO: "bg-green-500/10 text-green-500 border-green-500/20",
    AJUSTE_OPERACAO: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    AJUSTE_FISCAL: "bg-red-500/10 text-red-500 border-red-500/20",
    CANCELADO: "bg-gray-600/20 text-gray-500 border-gray-600/30",
  };
  return colors[etapa] || "bg-gray-500/10 text-gray-500";
};

export const VouchersAgrupadosModal = ({
  open,
  onOpenChange,
  rmNumero,
}: VouchersAgrupadosModalProps) => {
  const [loading, setLoading] = useState(false);
  const [vouchers, setVouchers] = useState<VoucherAgrupado[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (open && rmNumero) {
      loadVouchers();
    }
  }, [open, rmNumero]);

  const loadVouchers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_vouchers_agrupados",
          consolidacao_rm_numero: rmNumero,
        },
      });

      if (error) throw error;
      setVouchers(data?.vouchers || []);
    } catch (err) {
      console.error("Erro ao carregar vouchers agrupados:", err);
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  const totalValor = vouchers.reduce((sum, v) => sum + (v.valor || 0), 0);

  const handleViewVoucher = (voucherId: string) => {
    onOpenChange(false);
    navigate(`/fin/esteira/voucher/${voucherId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-400" />
            Vouchers Agrupados
          </DialogTitle>
          <DialogDescription>
            Grupo RM: <span className="font-mono font-semibold text-violet-400">{rmNumero}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : vouchers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum voucher encontrado neste grupo
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total de vouchers:</span>
                  <span className="ml-2 font-semibold">{vouchers.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor total:</span>
                  <span className="ml-2 font-semibold">
                    BRL {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Voucher List */}
            <ScrollArea className="h-[350px]">
              <div className="space-y-2">
                {vouchers.map((voucher) => (
                  <div
                    key={voucher.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-medium">{voucher.numero_spo}</span>
                        <Badge variant="outline" className={getEtapaColor(voucher.etapa_atual)}>
                          {voucher.etapa_atual}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {voucher.fornecedor || "Sem fornecedor"}
                      </p>
                    </div>
                    <div className="text-right mr-3">
                      <p className="font-medium">
                        {voucher.moeda} {(voucher.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Venc: {voucher.vencimento ? format(new Date(voucher.vencimento), "dd/MM/yyyy") : "-"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewVoucher(voucher.id)}
                      className="gap-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ver
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
