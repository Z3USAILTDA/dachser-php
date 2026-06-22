import { useState } from "react";
import { Voucher } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Bot, Clock, FileCheck, ChevronDown, RotateCcw, Trash2, Eye } from "lucide-react";
import { FileUpload } from "./FileUpload";
import { RetornarPendenteDialog } from "./RetornarPendenteDialog";

interface VoucherRoboActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
  canRetornarPendente?: boolean;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const VoucherRoboActions = ({ voucher, onUpdate, canRetornarPendente = true }: VoucherRoboActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [showRetornarDialog, setShowRetornarDialog] = useState(false);
  const [deletingComprovante, setDeletingComprovante] = useState<string | null>(null);
  const { toast } = useToast();

  const comprovantes = voucher.anexos.filter((a) => a.tipo === "COMPROVANTE");
  const hasComprovante = comprovantes.length > 0;
  const currentStatus = voucher.statusComprovante || "PENDENTE";

  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  const postLog = async (body: object) => {
    await fetch(`/api/fin/vouchers/${voucher.id}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const uploadComprovanteFileFn = async (file: File): Promise<string> => {
    const userData = getUserData();
    const file_base64 = await fileToBase64(file);
    const resp = await fetch('/api/fin/vouchers/anexos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_id: voucher.id,
        tipo: 'COMPROVANTE',
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        file_base64,
        user_id: userData.id?.toString(),
        user_name: userData.username,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Falha ao fazer upload do comprovante');
    return data.file_url as string;
  };

  const handleComprovanteUpload = async (_fileUrl: string, fileName: string, _fileSize: number) => {
    const userData = getUserData();
    try {
      await postLog({ user_id: userData.id?.toString(), user_name: userData.username, acao: "COMPROVANTE_ANEXADO", detalhe: `Comprovante ${fileName} anexado` });
      toast({ title: "Comprovante anexado!", description: "Arquivo enviado com sucesso" });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao registrar comprovante", description: error.message, variant: "destructive" });
    }
  };

  const handleChangeStatus = async (newStatus: string) => {
    try {
      setChangingStatus(true);
      const userData = getUserData();
      const resp = await fetch(`/api/fin/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_comprovante: newStatus }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }
      await postLog({ user_id: userData.id?.toString(), user_name: userData.username, acao: "STATUS_COMPROVANTE_ALTERADO", detalhe: `Status do comprovante alterado para ${newStatus}` });
      toast({ title: "Status alterado!", description: `Status do comprovante alterado para ${newStatus}` });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    } finally {
      setChangingStatus(false);
    }
  };

  const handleRetornarPendente = async (justificativa: string) => {
    const userData = getUserData();
    try {
      const resp = await fetch(`/api/fin/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_comprovante: "PENDENTE" }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }
      await postLog({ user_id: userData.id?.toString(), user_name: userData.username, acao: "COMPROVANTE_RETORNADO_PENDENTE", detalhe: `Comprovante retornado para pendente. Justificativa: ${justificativa}` });
      toast({ title: "Status alterado!", description: "Comprovante retornado para pendente. Equipe financeira notificada." });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao retornar status", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  const handleRemoverComprovante = async (comprovanteToRemove: typeof comprovantes[0]) => {
    if (!comprovanteToRemove) return;
    try {
      setDeletingComprovante(comprovanteToRemove.id);
      const userData = getUserData();

      const resp = await fetch(`/api/fin/vouchers/anexos/${comprovanteToRemove.id}`, { method: 'DELETE' });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }

      if (comprovantes.length <= 1) {
        await fetch(`/api/fin/vouchers/${voucher.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status_comprovante: "PENDENTE" }),
        });
      }

      await postLog({ user_id: userData.id?.toString(), user_name: userData.username, acao: "COMPROVANTE_REMOVIDO", detalhe: `Comprovante ${comprovanteToRemove.fileName} removido` });
      toast({ title: "Comprovante removido!", description: "Comprovante removido com sucesso" });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao remover comprovante", description: error.message, variant: "destructive" });
    } finally {
      setDeletingComprovante(null);
    }
  };

  const handleSalvarComprovante = async () => {
    if (!hasComprovante) {
      toast({ title: "Comprovante necessário", description: "É necessário anexar um comprovante antes de salvar", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const userData = getUserData();
      const resp = await fetch(`/api/fin/vouchers/${voucher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_comprovante: "ANEXADO",
          etapa_atual: "CONCLUIDO",
          status_baixa: "BAIXA_SOLICITADA",
          status_financeiro: "CONCLUIDO",
        }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }
      await postLog({ user_id: userData.id?.toString(), user_name: userData.username, acao: "COMPROVANTE_SALVO", detalhe: "Comprovante salvo e voucher concluído" });
      toast({ title: "Comprovante salvo!", description: "Voucher concluído com sucesso" });
      onUpdate();
    } catch (error: any) {
      console.error("Erro ao salvar comprovante:", error);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Processamento Automático</CardTitle>
              <CardDescription>Voucher/SPO aguardando integração com sistema RM</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1">
              <p className="font-medium">Status do Comprovante</p>
              <p className="text-sm text-muted-foreground">
                {currentStatus === "VALIDADO"
                  ? "Comprovante validado"
                  : currentStatus === "ANEXADO"
                  ? "Comprovante anexado e pronto para processamento"
                  : "Aguardando anexo do comprovante de pagamento"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" disabled={changingStatus}>
                  {currentStatus === "VALIDADO" ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" />Validado</>
                  ) : currentStatus === "ANEXADO" ? (
                    <><FileCheck className="h-4 w-4 text-blue-500" />Anexado</>
                  ) : (
                    <><Clock className="h-4 w-4 text-yellow-500" />Pendente</>
                  )}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {currentStatus !== "PENDENTE" && canRetornarPendente && (
                  <>
                    <DropdownMenuItem onClick={() => setShowRetornarDialog(true)} className="text-yellow-600">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Retornar para Pendente
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => handleChangeStatus("ANEXADO")} disabled={currentStatus === "ANEXADO"}>
                  <FileCheck className="h-4 w-4 mr-2 text-blue-500" />
                  Anexado
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleChangeStatus("VALIDADO")} disabled={currentStatus === "VALIDADO"}>
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                  Validado
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-3">
            <FileUpload
              label={hasComprovante ? "Adicionar Comprovante" : "Comprovante de Pagamento"}
              required={!hasComprovante}
              onFileUpload={handleComprovanteUpload}
              uploadFn={uploadComprovanteFileFn}
              accept=".pdf,.jpg,.jpeg,.png"
            />

            {comprovantes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Comprovantes anexados ({comprovantes.length})
                </p>
                {comprovantes.map((comp) => (
                  <div key={comp.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-sm truncate">{comp.fileName}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {comp.fileUrl && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(comp.fileUrl, '_blank')}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {currentStatus === "PENDENTE" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          onClick={() => handleRemoverComprovante(comp)}
                          disabled={deletingComprovante === comp.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleSalvarComprovante}
              disabled={loading || !hasComprovante}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
            >
              <Bot className="h-4 w-4" />
              {loading ? "Salvando..." : "Salvar Comprovante"}
            </Button>
          </div>

          {voucher.statusBaixa === "BAIXA_MANUAL" && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Baixa Manual:</strong> Este voucher/SPO será processado manualmente no sistema RM
              </p>
            </div>
          )}

          {voucher.statusBaixa === "BAIXA_REMESSA" && (
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-sm text-purple-700 dark:text-purple-300">
                <strong>Remessa:</strong> Este voucher/SPO será incluído na remessa bancária ({voucher.remessa})
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <RetornarPendenteDialog
        open={showRetornarDialog}
        onOpenChange={setShowRetornarDialog}
        onConfirm={handleRetornarPendente}
        voucherSpo={voucher.numeroSPO}
      />
    </div>
  );
};
