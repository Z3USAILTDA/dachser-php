import { useState, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useSlaConfig } from "@/hooks/useSlaConfig";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, RefreshCw, Clock, AlertTriangle, FileText } from "lucide-react";

interface LocalSLAConfig {
  id: string;
  etapa: string;
  horasLimite: number;
  ativo: boolean;
}

interface VoucherRule {
  tipoDocumento: string;
  urgenciaAutomatica: boolean;
  slaVoucher: number;
  slaFiscal: number;
  slaFinanceiro: number;
}

const DEFAULT_RULES: VoucherRule[] = [
  { tipoDocumento: "NF_SERVICO", urgenciaAutomatica: false, slaVoucher: 24, slaFiscal: 48, slaFinanceiro: 24 },
  { tipoDocumento: "NF_DEBITO", urgenciaAutomatica: false, slaVoucher: 24, slaFiscal: 48, slaFinanceiro: 24 },
  { tipoDocumento: "BOLETO", urgenciaAutomatica: false, slaVoucher: 24, slaFiscal: 48, slaFinanceiro: 24 },
  { tipoDocumento: "ARMAZENAGEM", urgenciaAutomatica: true, slaVoucher: 12, slaFiscal: 24, slaFinanceiro: 12 },
  { tipoDocumento: "ICMS", urgenciaAutomatica: true, slaVoucher: 12, slaFiscal: 24, slaFinanceiro: 12 },
  { tipoDocumento: "OUTROS", urgenciaAutomatica: false, slaVoucher: 24, slaFiscal: 48, slaFinanceiro: 24 },
];

const TIPO_DOC_LABELS: Record<string, string> = {
  NF_SERVICO: "NF de Serviço",
  NF_DEBITO: "NF de Débito",
  BOLETO: "Boleto",
  ARMAZENAGEM: "Armazenagem",
  ICMS: "ICMS",
  OUTROS: "Outros",
};

const ETAPA_LABELS: Record<string, string> = {
  OPERACAO: "Operacional",
  FISCAL: "Fiscal",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
  ROBO: "Robô",
  AJUSTE_OPERACAO: "Ajuste Operacional",
  AJUSTE_FISCAL: "Ajuste Fiscal",
};

export default function VoucherRules() {
  const { configs, loading, fetchConfigs, updateConfig } = useSlaConfig();
  const [localConfigs, setLocalConfigs] = useState<LocalSLAConfig[]>([]);
  const [rules, setRules] = useState<VoucherRule[]>(DEFAULT_RULES);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Sync local state when configs are fetched
  useEffect(() => {
    if (configs.length > 0) {
      setLocalConfigs(configs.map(c => ({
        id: c.id,
        etapa: c.etapa,
        horasLimite: c.horas_limite,
        ativo: c.ativo
      })));
    }
  }, [configs]);

  const handleSLAChange = (id: string, field: "horasLimite" | "ativo", value: number | boolean) => {
    setLocalConfigs(prev => prev.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const handleRuleChange = (tipoDocumento: string, field: keyof VoucherRule, value: number | boolean) => {
    setRules(prev => prev.map(r => 
      r.tipoDocumento === tipoDocumento ? { ...r, [field]: value } : r
    ));
  };

  const saveSLAConfigs = async () => {
    try {
      setSaving(true);
      
      for (const config of localConfigs) {
        await updateConfig(config.id, { 
          horas_limite: config.horasLimite, 
          ativo: config.ativo 
        });
      }

      toast({
        title: "Configurações salvas",
        description: "As configurações de SLA foram atualizadas com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout backTo="/fin/esteira">
      <PageHeader
        title="Configuração de Regras"
        subtitle="Gerencie SLAs e regras de urgência automática"
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* SLA por Etapa */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>SLA por Etapa do Workflow</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchConfigs()}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button
                size="sm"
                onClick={saveSLAConfigs}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Limite (horas)</TableHead>
                  <TableHead>Ativo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localConfigs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{ETAPA_LABELS[config.etapa] || config.etapa}</Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        className="w-24"
                        value={config.horasLimite}
                        onChange={(e) => handleSLAChange(config.id, "horasLimite", parseInt(e.target.value) || 1)}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={config.ativo}
                        onCheckedChange={(checked) => handleSLAChange(config.id, "ativo", checked)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Regras de Urgência por Tipo de Documento */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <CardTitle>Regras de Urgência Automática</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de Documento</TableHead>
                  <TableHead>Urgência Automática</TableHead>
                  <TableHead>SLA Voucher (h)</TableHead>
                  <TableHead>SLA Fiscal (h)</TableHead>
                  <TableHead>SLA Financeiro (h)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.tipoDocumento}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {TIPO_DOC_LABELS[rule.tipoDocumento] || rule.tipoDocumento}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.urgenciaAutomatica}
                        onCheckedChange={(checked) => handleRuleChange(rule.tipoDocumento, "urgenciaAutomatica", checked)}
                      />
                      {rule.urgenciaAutomatica && (
                        <Badge variant="destructive" className="ml-2">Auto</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        className="w-20"
                        value={rule.slaVoucher}
                        onChange={(e) => handleRuleChange(rule.tipoDocumento, "slaVoucher", parseInt(e.target.value) || 1)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        className="w-20"
                        value={rule.slaFiscal}
                        onChange={(e) => handleRuleChange(rule.tipoDocumento, "slaFiscal", parseInt(e.target.value) || 1)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        className="w-20"
                        value={rule.slaFinanceiro}
                        onChange={(e) => handleRuleChange(rule.tipoDocumento, "slaFinanceiro", parseInt(e.target.value) || 1)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
              <p><strong>Nota:</strong> ICMS e Armazenagem possuem urgência automática por padrão (regra de negócio).</p>
              <p className="mt-1">A configuração acima permite personalizar os SLAs específicos por tipo de documento.</p>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-info/5 border-info/20">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Settings className="h-5 w-5 text-info shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Sobre as Configurações</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>SLA (Service Level Agreement)</strong>: Tempo máximo que um voucher pode permanecer em cada etapa antes de ser considerado atrasado.</li>
                  <li><strong>Urgência Automática</strong>: Documentos marcados como urgentes automaticamente (ICMS, Armazenagem) passam pelo fluxo com prioridade.</li>
                  <li>Os alertas de SLA são disparados automaticamente via email quando os limites são atingidos.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </PageLayout>
  );
}
