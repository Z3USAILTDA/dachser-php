import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Activity, 
  Database, 
  Mail, 
  Ship, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ServiceHealth {
  service: string;
  status: "healthy" | "degraded" | "unhealthy";
  latency_ms: number;
  message?: string;
  last_checked: string;
}

interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  total_latency_ms: number;
  timestamp: string;
  services: ServiceHealth[];
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  Database: <Database className="h-5 w-5" />,
  JSONCARGO: <Ship className="h-5 w-5" />,
  "Resend (Email)": <Mail className="h-5 w-5" />,
};

export function HealthDashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const runHealthCheck = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("demurrage-health-check", {
        body: testEmail ? { test_email: testEmail } : {},
      });

      if (error) throw error;
      setHealthData(data);
      
      if (data.status === "healthy") {
        toast.success("Todos os serviços estão operacionais");
      } else if (data.status === "degraded") {
        toast.warning("Alguns serviços estão degradados");
      } else {
        toast.error("Há serviços com problemas");
      }
    } catch (error) {
      console.error("Health check error:", error);
      toast.error("Erro ao verificar saúde dos serviços");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Operacional
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Degradado
          </Badge>
        );
      case "unhealthy":
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
            <XCircle className="h-3 w-3 mr-1" />
            Indisponível
          </Badge>
        );
      default:
        return <Badge variant="secondary">Desconhecido</Badge>;
    }
  };

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500/10 border-green-500/30";
      case "degraded":
        return "bg-yellow-500/10 border-yellow-500/30";
      case "unhealthy":
        return "bg-red-500/10 border-red-500/30";
      default:
        return "bg-gray-500/10 border-gray-500/30";
    }
  };

  return (
    <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Activity className="h-5 w-5 text-[#ffc800]" />
          Saúde do Sistema
        </CardTitle>
        <CardDescription>
          Status das integrações e serviços do módulo Demurrage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Email Input */}
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="testEmail">Email para teste (opcional)</Label>
            <Input
              id="testEmail"
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="seu@email.com"
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
            />
          </div>
          <Button
            onClick={runHealthCheck}
            disabled={isLoading}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Verificar Saúde
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {healthData && (
          <div className="space-y-4">
            {/* Overall Status */}
            <div className={`p-4 rounded-lg border ${getOverallStatusColor(healthData.status)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Status Geral</p>
                  <div className="flex items-center gap-3 mt-1">
                    {getStatusBadge(healthData.status)}
                    <span className="text-sm text-muted-foreground">
                      Latência: {healthData.total_latency_ms}ms
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(healthData.timestamp).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>

            {/* Individual Services */}
            <div className="grid gap-3">
              {healthData.services.map((service, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    service.status === "healthy"
                      ? "bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.1)]"
                      : service.status === "degraded"
                        ? "bg-yellow-500/5 border-yellow-500/20"
                        : "bg-red-500/5 border-red-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        service.status === "healthy"
                          ? "bg-green-500/10 text-green-400"
                          : service.status === "degraded"
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-red-500/10 text-red-400"
                      }`}>
                        {SERVICE_ICONS[service.service] || <Activity className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{service.service}</p>
                        <p className="text-xs text-muted-foreground">{service.message}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(service.status)}
                      <p className="text-xs text-muted-foreground mt-1">
                        {service.latency_ms}ms
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!healthData && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Clique em "Verificar Saúde" para executar diagnóstico</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
