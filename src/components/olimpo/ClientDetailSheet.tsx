import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Mail,
  Save,
  Loader2,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface CnpjDetail {
  cnpj: string;
  cnpjClean: string;
  not_due: number;
  aging_30: number;
  aging_90: number;
  aging_180: number;
  aging_240: number;
  aging_360: number;
  aging_360_plus: number;
  totalCount: number;
}

interface Observacao {
  cnpj: string;
  observacao: string;
  updated_by: string | null;
  updated_at: string | null;
}

interface AgingRow {
  product: string;
  cnpjs?: string[];
}

interface ClientDetailSheetProps {
  client: AgingRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const agingKeys = ["not_due", "aging_30", "aging_90", "aging_180", "aging_240", "aging_360", "aging_360_plus"] as const;
const AGING_LABELS: Record<string, string> = {
  not_due: "Not Due",
  aging_30: "0-30",
  aging_90: "31-90",
  aging_180: "91-180",
  aging_240: "181-240",
  aging_360: "241-360",
  aging_360_plus: "> 360",
};
const AGING_COLORS: Record<string, string> = {
  not_due: "#22c55e",
  aging_30: "#84cc16",
  aging_90: "#eab308",
  aging_180: "#f97316",
  aging_240: "#ef4444",
  aging_360: "#dc2626",
  aging_360_plus: "#991b1b",
};

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export function ClientDetailSheet({ client, open, onOpenChange }: ClientDetailSheetProps) {
  const [cnpjData, setCnpjData] = useState<CnpjDetail[]>([]);
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [savingCnpj, setSavingCnpj] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchDetail = useCallback(async () => {
    if (!client?.product) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_client_cnpj_detail", clientName: client.product },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro");
      setCnpjData(data.data || []);
      const obsMap: Record<string, string> = {};
      for (const obs of (data.observacoes || []) as Observacao[]) {
        obsMap[obs.cnpj] = obs.observacao || "";
      }
      setObservacoes(obsMap);
    } catch (err: any) {
      console.error("Error fetching client detail:", err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [client?.product]);

  useEffect(() => {
    if (open && client) fetchDetail();
  }, [open, client, fetchDetail]);

  const handleSaveObs = async (cnpj: string) => {
    setSavingCnpj(cnpj);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "save_cobranca_observacao", cnpj, observacao: observacoes[cnpj] || "" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro");
      toast({ title: "Observação salva" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSavingCnpj(null);
    }
  };

  if (!client) return null;

  const totalCount = cnpjData.reduce((s, c) => s + c.totalCount, 0);
  const totalValue = cnpjData.reduce((s, c) => s + agingKeys.reduce((v, k) => v + c[k], 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            {client.product}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">CNPJs</p>
              <p className="text-lg font-bold text-foreground">{cnpjData.length}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Faturas</p>
              <p className="text-lg font-bold text-foreground">{totalCount}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-sm font-bold text-foreground">{formatBRL(totalValue)}</p>
            </div>
          </div>

          {/* Email Status */}
          <div className="bg-muted/20 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Disparo automático de cobrança</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Status: <Badge variant="outline" className="text-[10px] ml-1">Ativo</Badge></p>
              <p>Régua: Pré-vencimento → Vencido 7d → Vencido 15d → Vencido 30d</p>
            </div>
          </div>

          <Separator />

          {/* CNPJ Breakdown */}
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Detalhamento por CNPJ
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cnpjData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum CNPJ encontrado</p>
          ) : (
            cnpjData.map((cnpj) => {
              const cnpjTotal = agingKeys.reduce((s, k) => s + cnpj[k], 0);
              const overdue = cnpjTotal - cnpj.not_due;
              return (
                <div key={cnpj.cnpjClean} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono font-medium text-foreground">{cnpj.cnpj || cnpj.cnpjClean}</span>
                    <Badge variant="outline" className="text-[10px]">{cnpj.totalCount} faturas</Badge>
                  </div>

                  {/* Mini aging bar */}
                  <div className="flex rounded overflow-hidden h-2">
                    {agingKeys.map((k) => {
                      const pct = cnpjTotal > 0 ? (cnpj[k] / cnpjTotal) * 100 : 0;
                      if (pct <= 0) return null;
                      return (
                        <div key={k} style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: AGING_COLORS[k] }}
                          title={`${AGING_LABELS[k]}: ${formatBRL(cnpj[k])}`} />
                      );
                    })}
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Total: {formatBRL(cnpjTotal)}</span>
                    {overdue > 0 && (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Overdue: {formatBRL(overdue)}
                      </span>
                    )}
                  </div>

                  {/* Observação */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Observação</label>
                    <Textarea
                      value={observacoes[cnpj.cnpjClean] || ""}
                      onChange={(e) => setObservacoes((prev) => ({ ...prev, [cnpj.cnpjClean]: e.target.value }))}
                      placeholder="Adicionar observação..."
                      className="min-h-[60px] text-xs bg-background border-border"
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      disabled={savingCnpj === cnpj.cnpjClean}
                      onClick={() => handleSaveObs(cnpj.cnpjClean)}>
                      {savingCnpj === cnpj.cnpjClean ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
