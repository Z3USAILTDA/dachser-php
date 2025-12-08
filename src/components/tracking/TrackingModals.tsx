import React from "react";
import { X, Database, Mail, Edit2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogData, EmailHistory, DhlAwbTracking } from "./TrackingTypes";

interface LogModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAwb: DhlAwbTracking | null;
  logData: LogData[];
  isLoading: boolean;
}

export const LogModal: React.FC<LogModalProps> = ({
  isOpen,
  onClose,
  selectedAwb,
  logData,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Logs da AWB {selectedAwb?.awb}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Eventos mais recentes primeiro
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto text-xs">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Carregando logs...
            </div>
          ) : logData.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              Nenhum log encontrado para essa AWB.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {logData.map((log) => (
                <li key={log.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {log.actor_name || log.mimicked_operator_id || "Sistema"}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground mb-1">
                    {log.action || "Ação registrada"}
                  </p>
                  {log.new_value && (
                    <pre className="mt-1 text-[10px] bg-muted border border-border rounded-lg p-2 text-muted-foreground overflow-auto max-h-40">
                      {JSON.stringify(log.new_value, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAwbForEmail: string | null;
  emailRecipient: string;
  setEmailRecipient: (value: string) => void;
  emailSubject: string;
  setEmailSubject: (value: string) => void;
  emailContent: string;
  setEmailContent: (value: string) => void;
  handleSendEmail: () => void;
  isEmailSending: boolean;
}

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  selectedAwbForEmail,
  emailRecipient,
  setEmailRecipient,
  emailSubject,
  setEmailSubject,
  emailContent,
  setEmailContent,
  handleSendEmail,
  isEmailSending,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Enviar e-mail – AWB {selectedAwbForEmail}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Ajuste o destinatário e o conteúdo antes de enviar.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-3 text-xs">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Destinatário</label>
            <Input
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value)}
              className="bg-card border-border text-xs"
              placeholder="email@cliente.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Assunto</label>
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="bg-card border-border text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Conteúdo</label>
            <textarea
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              className="w-full h-40 bg-card border border-border rounded-lg text-xs p-2 resize-none text-foreground"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-7 rounded-full bg-green-600 hover:bg-green-500 text-[11px]"
            onClick={handleSendEmail}
            disabled={isEmailSending}
          >
            {isEmailSending ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Check className="w-3 h-3 mr-1" />
                Enviar e-mail
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface EmailHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAwbForEmail: string | null;
  emailHistory: EmailHistory[];
  isLoading: boolean;
}

export const EmailHistoryModal: React.FC<EmailHistoryModalProps> = ({
  isOpen,
  onClose,
  selectedAwbForEmail,
  emailHistory,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Histórico de e-mails – AWB {selectedAwbForEmail}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Últimos envios registrados no sistema.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto text-xs">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Carregando histórico...
            </div>
          ) : emailHistory.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              Nenhum registro de e-mail para essa AWB.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {emailHistory.map((email) => (
                <li key={email.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(email.created_at).toLocaleString("pt-BR")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {email.created_by}
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-foreground mt-1">
                    {email.subject}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
                    {email.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Destinatário: {email.consignee_email || "-"} — Status: {email.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

interface RemarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRemarkAwb: string | null;
  currentRemarkText: string;
  setCurrentRemarkText: (value: string) => void;
  handleSave: () => void;
  isUpdating: boolean;
}

export const RemarkModal: React.FC<RemarkModalProps> = ({
  isOpen,
  onClose,
  currentRemarkAwb,
  currentRemarkText,
  setCurrentRemarkText,
  handleSave,
  isUpdating,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Observação – AWB {currentRemarkAwb}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Registro interno para a equipe de análise.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          <textarea
            value={currentRemarkText}
            onChange={(e) => setCurrentRemarkText(e.target.value)}
            className="w-full h-40 bg-card border border-border rounded-lg text-xs p-2 resize-none text-foreground"
            placeholder="Digite aqui a observação para essa AWB..."
          />
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-7 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-[11px]"
            onClick={handleSave}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="w-3 h-3 mr-1" />
                Salvar observação
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
