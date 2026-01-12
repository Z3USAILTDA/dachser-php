import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, Loader2, Mail, X, Plus, Bell } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

const emailSchema = z.string().email({ message: "E-mail inválido" }).max(255);

export interface ClientProfileData {
  cliente: string;
  auto_alert_enabled: boolean;
  alert_days_before: number;
  report_frequency: string;
  contact_emails: string[];
}

interface ClientProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ClientProfileData | null;
  isNew?: boolean;
  onSubmit: (data: ClientProfileData) => Promise<void>;
  isLoading?: boolean;
}

const REPORT_FREQUENCIES = [
  { value: "DAILY", label: "Diário" },
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
  { value: "MONTHLY", label: "Mensal" },
  { value: "NONE", label: "Sem relatório" },
];

const ALERT_DAYS_OPTIONS = [1, 2, 3, 5, 7, 10, 14];

export function ClientProfileDialog({ 
  open, 
  onOpenChange, 
  profile, 
  isNew = false,
  onSubmit, 
  isLoading 
}: ClientProfileDialogProps) {
  const [clientName, setClientName] = useState("");
  const [autoAlertEnabled, setAutoAlertEnabled] = useState(true);
  const [alertDaysBefore, setAlertDaysBefore] = useState(3);
  const [reportFrequency, setReportFrequency] = useState("WEEKLY");
  const [contactEmails, setContactEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (profile) {
      setClientName(profile.cliente);
      setAutoAlertEnabled(profile.auto_alert_enabled);
      setAlertDaysBefore(profile.alert_days_before);
      setReportFrequency(profile.report_frequency);
      setContactEmails(profile.contact_emails || []);
    } else {
      setClientName("");
      setAutoAlertEnabled(true);
      setAlertDaysBefore(3);
      setReportFrequency("WEEKLY");
      setContactEmails([]);
    }
    setNewEmail("");
    setEmailError("");
  }, [profile, open]);

  const handleAddEmail = () => {
    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) return;

    const result = emailSchema.safeParse(trimmedEmail);
    if (!result.success) {
      setEmailError(result.error.errors[0].message);
      return;
    }

    if (contactEmails.includes(trimmedEmail)) {
      setEmailError("E-mail já adicionado");
      return;
    }

    if (contactEmails.length >= 10) {
      setEmailError("Máximo de 10 e-mails permitidos");
      return;
    }

    setContactEmails([...contactEmails, trimmedEmail]);
    setNewEmail("");
    setEmailError("");
  };

  const handleRemoveEmail = (email: string) => {
    setContactEmails(contactEmails.filter(e => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleSubmit = async () => {
    if (isNew && !clientName.trim()) {
      toast.error("Nome do cliente é obrigatório");
      return;
    }

    try {
      await onSubmit({
        cliente: clientName,
        auto_alert_enabled: autoAlertEnabled,
        alert_days_before: alertDaysBefore,
        report_frequency: reportFrequency,
        contact_emails: contactEmails,
      });
      onOpenChange(false);
    } catch {
      // Error handled by parent
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Users className="h-5 w-5 text-[#ffc800]" />
            {isNew ? "Novo Perfil de Cliente" : "Editar Perfil"}
          </DialogTitle>
          <DialogDescription>
            {isNew ? "Configure alertas e relatórios para o cliente" : `Configurações para ${profile?.cliente}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Client Name (only for new) */}
          {isNew && (
            <div className="space-y-2">
              <Label htmlFor="clientName">Nome do Cliente</Label>
              <Input
                id="clientName"
                placeholder="Nome do cliente"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
                maxLength={100}
              />
            </div>
          )}

          {/* Auto Alert Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-[#ffc800]" />
              <div>
                <p className="font-medium">Alertas Automáticos</p>
                <p className="text-xs text-muted-foreground">Enviar alertas de demurrage</p>
              </div>
            </div>
            <Switch 
              checked={autoAlertEnabled} 
              onCheckedChange={setAutoAlertEnabled}
            />
          </div>

          {autoAlertEnabled && (
            <>
              {/* Alert Days Before */}
              <div className="space-y-2">
                <Label htmlFor="alertDays">Alertar dias antes do vencimento</Label>
                <Select value={alertDaysBefore.toString()} onValueChange={(v) => setAlertDaysBefore(parseInt(v))}>
                  <SelectTrigger className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_DAYS_OPTIONS.map((days) => (
                      <SelectItem key={days} value={days.toString()}>
                        {days} {days === 1 ? "dia" : "dias"} antes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Report Frequency */}
              <div className="space-y-2">
                <Label htmlFor="reportFrequency">Frequência de Relatórios</Label>
                <Select value={reportFrequency} onValueChange={setReportFrequency}>
                  <SelectTrigger className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_FREQUENCIES.map((freq) => (
                      <SelectItem key={freq.value} value={freq.value}>
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contact Emails */}
              <div className="space-y-2">
                <Label>E-mails de Contato</Label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="email@exemplo.com"
                      value={newEmail}
                      onChange={(e) => {
                        setNewEmail(e.target.value);
                        setEmailError("");
                      }}
                      onKeyDown={handleKeyDown}
                      className="pl-9 bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
                      maxLength={255}
                    />
                  </div>
                  <Button 
                    type="button"
                    size="icon"
                    onClick={handleAddEmail}
                    className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {emailError && (
                  <p className="text-xs text-red-400">{emailError}</p>
                )}
                
                {contactEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {contactEmails.map((email) => (
                      <Badge 
                        key={email} 
                        variant="secondary" 
                        className="bg-[rgba(255,255,255,0.1)] text-foreground gap-1 pr-1"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(email)}
                          className="ml-1 p-0.5 rounded hover:bg-[rgba(255,255,255,0.2)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {contactEmails.length}/10 e-mails adicionados
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            className="border-[rgba(255,255,255,0.2)]"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isLoading || (isNew && !clientName.trim())}
            className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isNew ? "Criar Perfil" : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
