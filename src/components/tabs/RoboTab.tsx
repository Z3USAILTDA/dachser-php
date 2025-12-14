import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bot, RefreshCw, Clock, CheckCircle, AlertCircle, Upload } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RoboSyncStatus {
  ultimaSincronizacao: Date | null;
  pendentes: number;
  sincronizados: number;
  erros: number;
}

interface VoucherPendente {
  id: string;
  numeroSPO: string;
  fornecedor: string;
  valor: number;
  vencimento: Date;
  statusComprovante: string;
}

export const RoboTab = () => {
  const [status, setStatus] = useState<RoboSyncStatus>({
    ultimaSincronizacao: null,
    pendentes: 0,
    sincronizados: 0,
    erros: 0,
  });
  const [vouchersPendentes, setVouchersPendentes] = useState<VoucherPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch vouchers in ROBO stage
      const { data, error } = await supabase
        .from("vouchers")
        .select("*")
        .eq("etapa_atual", "ROBO");

      if (error) throw error;

      const mapped = (data || []).map((v: any) => ({
        id: v.id,
        numeroSPO: v.numero_spo,
        fornecedor: v.fornecedor || "N/A",
        valor: v.valor || 0,
        vencimento: new Date(v.vencimento),
        statusComprovante: v.status_comprovante || "PENDENTE",
      }));

      setVouchersPendentes(mapped);
      
      setStatus({
        ultimaSincronizacao: new Date(),
        pendentes: mapped.filter(v => v.statusComprovante === "PENDENTE").length,
        sincronizados: mapped.filter(v => v.statusComprovante === "VALIDADO").length,
        erros: 0,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    // Simulate sync process
    await new Promise(resolve => setTimeout(resolve, 2000));
    await loadData();
    setSyncing(false);
    toast({
      title: "Sincronização concluída",
      description: "Dados atualizados com sucesso",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "VALIDADO":
        return <Badge className="bg-green-500 text-white">Validado</Badge>;
      case "ANEXADO":
        return <Badge className="bg-info text-info-foreground">Anexado</Badge>;
      default:
        return <Badge className="bg-warning text-warning-foreground">Pendente</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/20">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Status Robô</p>
                <p className="text-lg font-bold text-green-500">Ativo</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-warning/20">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Pendentes</p>
                <p className="text-lg font-bold">{status.pendentes}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Sincronizados</p>
                <p className="text-lg font-bold">{status.sincronizados}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Erros</p>
                <p className="text-lg font-bold">{status.erros}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card className="bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Sincronização de Comprovantes
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Sincronizar RM
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {status.ultimaSincronizacao && (
            <p className="text-sm text-muted-foreground mb-4">
              Última sincronização: {format(status.ultimaSincronizacao, "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </p>
          )}
          
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : vouchersPendentes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>Nenhum voucher aguardando comprovante</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>SPO</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status Comprovante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchersPendentes.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono">{v.numeroSPO}</TableCell>
                    <TableCell>{v.fornecedor}</TableCell>
                    <TableCell>R$ {v.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{format(v.vencimento, "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell>{getStatusBadge(v.statusComprovante)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
