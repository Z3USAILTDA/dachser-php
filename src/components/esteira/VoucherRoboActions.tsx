import { useState } from "react";
import { Voucher, TipoAnexo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Bot, AlertCircle, Clock, FileCheck, ChevronDown } from "lucide-react";
import { FileUpload } from "./FileUpload";

interface VoucherRoboActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherRoboActions = ({ voucher, onUpdate }: VoucherRoboActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [uploadingComprovante, setUploadingComprovante] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const { toast } = useToast();

  const hasComprovante = voucher.anexos.some((a) => a.tipo === "COMPROVANTE");
  const comprovanteFile = voucher.anexos.find((a) => a.tipo === "COMPROVANTE");
  const currentStatus = voucher.statusComprovante || "PENDENTE";

  // Get user data from localStorage (MariaDB auth)
  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  const handleComprovanteUpload = async (fileUrl: string, fileName: string, fileSize: number) => {
    try {
      setUploadingComprovante(true);
      const userData = getUserData();

      // Save attachment to MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_anexo",
          voucher_id: voucher.id,
          tipo: "COMPROVANTE",
          file_name: fileName,
          file_url: fileUrl,
          file_size: fileSize,
        },
      });

      if (error) throw error;

      // Log the action
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "COMPROVANTE_ANEXADO",
          detalhe: `Comprovante ${fileName} anexado`,
        },
      });

      toast({
        title: "Comprovante anexado!",
        description: "Arquivo enviado com sucesso",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao anexar comprovante",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingComprovante(false);
    }
  };

  const handleChangeStatus = async (newStatus: string) => {
    try {
      setChangingStatus(true);
      const userData = getUserData();

      // Update voucher status in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          updates: {
            status_comprovante: newStatus,
          },
        },
      });

      if (error) throw error;

      // Log the action
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "STATUS_COMPROVANTE_ALTERADO",
          detalhe: `Status do comprovante alterado para ${newStatus}`,
        },
      });

      toast({
        title: "Status alterado!",
        description: `Status do comprovante alterado para ${newStatus}`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao alterar status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setChangingStatus(false);
    }
  };

  const handleSalvarComprovante = async () => {
    if (!hasComprovante) {
      toast({
        title: "Comprovante necessário",
        description: "É necessário anexar um comprovante antes de salvar",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const userData = getUserData();

      // Update voucher status in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          status_comprovante: "ANEXADO",
          etapa_atual: "CONCLUIDO",
          status_baixa: "BAIXADO_RM",
        },
      });

      if (error) throw error;

      // Log the action
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "COMPROVANTE_SALVO",
          detalhe: "Comprovante salvo e voucher concluído",
        },
      });

      toast({
        title: "Comprovante salvo!",
        description: "Voucher concluído com sucesso",
      });

      onUpdate();
    } catch (error: any) {
      console.error("Erro ao salvar comprovante:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
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
              <CardDescription>
                Voucher/SPO aguardando integração com sistema RM
              </CardDescription>
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1"
                  disabled={changingStatus}
                >
                  {currentStatus === "VALIDADO" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Validado
                    </>
                  ) : currentStatus === "ANEXADO" ? (
                    <>
                      <FileCheck className="h-4 w-4 text-blue-500" />
                      Anexado
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 text-yellow-500" />
                      Pendente
                    </>
                  )}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => handleChangeStatus("PENDENTE")}
                  disabled={currentStatus === "PENDENTE"}
                >
                  <Clock className="h-4 w-4 mr-2 text-yellow-500" />
                  Pendente
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleChangeStatus("ANEXADO")}
                  disabled={currentStatus === "ANEXADO"}
                >
                  <FileCheck className="h-4 w-4 mr-2 text-blue-500" />
                  Anexado
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleChangeStatus("VALIDADO")}
                  disabled={currentStatus === "VALIDADO"}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                  Validado
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-3">
            {!hasComprovante && (
              <FileUpload
                label="Comprovante de Pagamento"
                required
                onFileUpload={handleComprovanteUpload}
                accept=".pdf,.jpg,.jpeg,.png"
              />
            )}

            {hasComprovante && comprovanteFile && (
              <FileUpload
                label="Comprovante de Pagamento"
                existingFile={{
                  name: comprovanteFile.fileName,
                  url: comprovanteFile.fileUrl,
                }}
                onFileUpload={handleComprovanteUpload}
              />
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
    </div>
  );
};
