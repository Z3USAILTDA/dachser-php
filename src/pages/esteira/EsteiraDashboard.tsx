import { useEffect, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, 
  AlertCircle, 
  FileWarning, 
  TrendingUp,
  Users,
  CheckCircle2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


interface DashboardMetrics {
  pendentesOperacao: number;
  pendentesFiscal: number;
  pendentesSupervisor: number;
  pendentesFinanceiro: number;
  urgentesReal: number;
  urgentesAutomatico: number;
  vencendo24h: number;
  vencidos: number;
  baixados: number;
}

const EsteiraDashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    pendentesOperacao: 0,
    pendentesFiscal: 0,
    pendentesSupervisor: 0,
    pendentesFinanceiro: 0,
    urgentesReal: 0,
    urgentesAutomatico: 0,
    vencendo24h: 0,
    vencidos: 0,
    baixados: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);

      const { data: vouchers, error } = await (supabase as any)
        .from("vouchers")
        .select("etapa_atual, urgencia_tipo, vencimento, status_baixa");

      if (error) throw error;

      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const newMetrics: DashboardMetrics = {
        pendentesOperacao: vouchers?.filter((v: any) => v.etapa_atual === "OPERACAO").length || 0,
        pendentesFiscal: vouchers?.filter((v: any) => v.etapa_atual === "FISCAL").length || 0,
        pendentesSupervisor: vouchers?.filter((v: any) => v.etapa_atual === "SUPERVISOR").length || 0,
        pendentesFinanceiro: vouchers?.filter((v: any) => v.etapa_atual === "FINANCEIRO").length || 0,
        urgentesReal: vouchers?.filter((v: any) => v.urgencia_tipo === "URGENTE_REAL").length || 0,
        urgentesAutomatico: vouchers?.filter((v: any) => v.urgencia_tipo === "URGENTE_AUTOMATICO").length || 0,
        vencendo24h: vouchers?.filter((v: any) => {
          const vencimento = new Date(v.vencimento);
          return vencimento >= now && vencimento <= tomorrow && v.etapa_atual !== "ROBO";
        }).length || 0,
        vencidos: vouchers?.filter((v: any) => {
          const vencimento = new Date(v.vencimento);
          return vencimento < now && v.etapa_atual !== "ROBO";
        }).length || 0,
        baixados: vouchers?.filter((v: any) => v.etapa_atual === "ROBO" || v.status_baixa !== "PENDENTE").length || 0,
      };

      setMetrics(newMetrics);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar métricas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({ 
    title, 
    value, 
    icon: Icon, 
    variant = "default",
    delay = 0
  }: { 
    title: string; 
    value: number; 
    icon: any; 
    variant?: "default" | "warning" | "destructive" | "success";
    delay?: number;
  }) => {
    const colorClasses = {
      default: "text-primary",
      warning: "text-warning",
      destructive: "text-destructive",
      success: "text-success",
    };

    const bgClasses = {
      default: "bg-primary/10",
      warning: "bg-warning/10",
      destructive: "bg-destructive/10",
      success: "bg-success/10",
    };

    return (
      <Card 
        className={cn(
          "bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in"
        )}
        style={{ animationDelay: `${delay}ms` }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className={cn("p-2 rounded-lg", bgClasses[variant])}>
            <Icon className={cn("h-4 w-4", colorClasses[variant])} />
          </div>
        </CardHeader>
        <CardContent>
          <div className={cn("text-3xl font-bold", colorClasses[variant])}>{value}</div>
        </CardContent>
      </Card>
    );
  };

  return (
    <PageLayout>
      <PageHeader 
        title="Dashboard"
        subtitle="Visão geral do workflow de vouchers"
      />

      <main className="container mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando métricas...</div>
        ) : (
          <>
            {/* Seção: Vouchers por Etapa */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
                <Users className="h-5 w-5 text-primary" />
                Vouchers por Etapa
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Pendentes - Operação"
                  value={metrics.pendentesOperacao}
                  icon={Clock}
                  variant="default"
                  delay={0}
                />
                <MetricCard
                  title="Pendentes - Fiscal"
                  value={metrics.pendentesFiscal}
                  icon={Clock}
                  variant="default"
                  delay={50}
                />
                <MetricCard
                  title="Pendentes - Supervisor"
                  value={metrics.pendentesSupervisor}
                  icon={AlertCircle}
                  variant="warning"
                  delay={100}
                />
                <MetricCard
                  title="Pendentes - Financeiro"
                  value={metrics.pendentesFinanceiro}
                  icon={Clock}
                  variant="default"
                  delay={150}
                />
              </div>
            </section>

            {/* Seção: Urgências */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Vouchers Urgentes
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard
                  title="Urgentes Real (Aprovação Manual)"
                  value={metrics.urgentesReal}
                  icon={FileWarning}
                  variant="destructive"
                  delay={200}
                />
                <MetricCard
                  title="Urgentes Automático (ICMS/Armazenagem)"
                  value={metrics.urgentesAutomatico}
                  icon={TrendingUp}
                  variant="warning"
                  delay={250}
                />
              </div>
            </section>

            {/* Seção: Vencimentos e Status */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
                <Clock className="h-5 w-5 text-info" />
                Vencimentos e Status
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard
                  title="Vencendo em 24h"
                  value={metrics.vencendo24h}
                  icon={Clock}
                  variant="warning"
                  delay={300}
                />
                <MetricCard
                  title="Vencidos"
                  value={metrics.vencidos}
                  icon={AlertCircle}
                  variant="destructive"
                  delay={350}
                />
                <MetricCard
                  title="Baixados"
                  value={metrics.baixados}
                  icon={CheckCircle2}
                  variant="success"
                  delay={400}
                />
              </div>
            </section>

            {/* Alertas de SLA */}
            {(metrics.vencidos > 0 || metrics.vencendo24h > 0) && (
              <Card className="border-warning/30 bg-warning/5 backdrop-blur-sm animate-fade-in" style={{ animationDelay: '450ms' }}>
                <CardHeader>
                  <CardTitle className="text-warning flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Alertas de SLA
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {metrics.vencidos > 0 && (
                    <div className="flex items-center justify-between p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <div>
                        <p className="font-medium text-destructive">Vouchers Vencidos</p>
                        <p className="text-sm text-muted-foreground">
                          {metrics.vencidos} voucher(s) já passaram do vencimento
                        </p>
                      </div>
                      <Badge className="bg-destructive text-destructive-foreground">{metrics.vencidos}</Badge>
                    </div>
                  )}
                  {metrics.vencendo24h > 0 && (
                    <div className="flex items-center justify-between p-4 bg-warning/10 border border-warning/20 rounded-lg">
                      <div>
                        <p className="font-medium text-warning">Atenção: Vencimento Próximo</p>
                        <p className="text-sm text-muted-foreground">
                          {metrics.vencendo24h} voucher(s) vencem nas próximas 24 horas
                        </p>
                      </div>
                      <Badge className="bg-warning text-warning-foreground">
                        {metrics.vencendo24h}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </PageLayout>
  );
};

export default EsteiraDashboard;
