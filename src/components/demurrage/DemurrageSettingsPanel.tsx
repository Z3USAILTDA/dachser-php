import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Settings, Save, Loader2, DollarSign, Clock, Mail, AlertTriangle } from "lucide-react";
import { useDemurrageSettings, useUpdateDemurrageSetting } from "@/hooks/useDemurrageData";
import { toast } from "sonner";

interface SettingsForm {
  default_free_time_days: string;
  audit_tolerance_percent: string;
  audit_tolerance_min_usd: string;
  alert_days_before: string;
  alert_email_default: string;
  auto_recalc_enabled: string;
  exchange_rate_usd_brl: string;
  report_frequency: string;
}

export function DemurrageSettingsPanel() {
  const { data: settings, isLoading: loadingSettings } = useDemurrageSettings();
  const updateSetting = useUpdateDemurrageSetting();
  
  const [form, setForm] = useState<SettingsForm>({
    default_free_time_days: "14",
    audit_tolerance_percent: "5",
    audit_tolerance_min_usd: "50",
    alert_days_before: "3",
    alert_email_default: "",
    auto_recalc_enabled: "true",
    exchange_rate_usd_brl: "5.00",
    report_frequency: "weekly",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        default_free_time_days: settings.default_free_time_days || "14",
        audit_tolerance_percent: settings.audit_tolerance_percent || "5",
        audit_tolerance_min_usd: settings.audit_tolerance_min_usd || "50",
        alert_days_before: settings.alert_days_before || "3",
        alert_email_default: settings.alert_email_default || "",
        auto_recalc_enabled: settings.auto_recalc_enabled || "true",
        exchange_rate_usd_brl: settings.exchange_rate_usd_brl || "5.00",
        report_frequency: settings.report_frequency || "weekly",
      });
    }
  }, [settings]);

  const handleChange = (key: keyof SettingsForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises = Object.entries(form).map(([key, value]) => 
        updateSetting.mutateAsync({ key, value })
      );
      await Promise.all(promises);
      toast.success("Configurações salvas com sucesso");
      setHasChanges(false);
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingSettings) {
    return (
      <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#ffc800]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Settings className="h-5 w-5 text-[#ffc800]" />
          Configurações do Módulo
        </CardTitle>
        <CardDescription>
          Parâmetros globais para cálculo de demurrage e alertas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Free Time & Calculation */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#ffc800]" />
            Parâmetros de Cálculo
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default_free_time_days">Free Time Padrão (dias)</Label>
              <Input
                id="default_free_time_days"
                type="number"
                value={form.default_free_time_days}
                onChange={e => handleChange("default_free_time_days", e.target.value)}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
              <p className="text-xs text-muted-foreground">
                Usado quando não há free time específico
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exchange_rate">Taxa Câmbio USD/BRL</Label>
              <Input
                id="exchange_rate"
                type="number"
                step="0.01"
                value={form.exchange_rate_usd_brl}
                onChange={e => handleChange("exchange_rate_usd_brl", e.target.value)}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
              <p className="text-xs text-muted-foreground">
                Para conversão em relatórios
              </p>
            </div>
          </div>
        </div>

        <Separator className="bg-[rgba(255,255,255,0.1)]" />

        {/* Audit Settings */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[#ffc800]" />
            Auditoria de Custos
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="audit_tolerance_percent">Tolerância (%)</Label>
              <Input
                id="audit_tolerance_percent"
                type="number"
                value={form.audit_tolerance_percent}
                onChange={e => handleChange("audit_tolerance_percent", e.target.value)}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
              <p className="text-xs text-muted-foreground">
                Diferença percentual aceitável
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit_tolerance_min_usd">Tolerância Mínima (USD)</Label>
              <Input
                id="audit_tolerance_min_usd"
                type="number"
                value={form.audit_tolerance_min_usd}
                onChange={e => handleChange("audit_tolerance_min_usd", e.target.value)}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
              <p className="text-xs text-muted-foreground">
                Valor mínimo de tolerância
              </p>
            </div>
          </div>
        </div>

        <Separator className="bg-[rgba(255,255,255,0.1)]" />

        {/* Alert Settings */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#ffc800]" />
            Alertas e Notificações
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="alert_days_before">Dias Antes do Vencimento</Label>
              <Input
                id="alert_days_before"
                type="number"
                value={form.alert_days_before}
                onChange={e => handleChange("alert_days_before", e.target.value)}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
              <p className="text-xs text-muted-foreground">
                Enviar alerta X dias antes
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert_email_default">Email Padrão para Alertas</Label>
              <Input
                id="alert_email_default"
                type="email"
                value={form.alert_email_default}
                onChange={e => handleChange("alert_email_default", e.target.value)}
                placeholder="alertas@empresa.com"
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
              <p className="text-xs text-muted-foreground">
                Recebe cópia de todos alertas
              </p>
            </div>
          </div>
        </div>

        <Separator className="bg-[rgba(255,255,255,0.1)]" />

        {/* Report Settings */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#ffc800]" />
            Relatórios Automáticos
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="report_frequency">Frequência de Relatórios</Label>
              <Select 
                value={form.report_frequency} 
                onValueChange={v => handleChange("report_frequency", v)}
              >
                <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="disabled">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recálculo Automático</Label>
              <div className="flex items-center space-x-2 mt-2">
                <Switch
                  checked={form.auto_recalc_enabled === "true"}
                  onCheckedChange={v => handleChange("auto_recalc_enabled", v ? "true" : "false")}
                />
                <Label className="text-sm text-muted-foreground">
                  Recalcular demurrage ao sincronizar
                </Label>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
