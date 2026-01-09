import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Voucher, TipoAnexo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Edit, Send, Trash2, Loader2, Upload, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileUpload } from "./FileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditVoucherDialog } from "./EditVoucherDialog";

interface VoucherRascunhoActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherRascunhoActions = ({ voucher, onUpdate }: VoucherRascunhoActionsProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEnviarConfirm, setShowEnviarConfirm] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<TipoAnexo>("FATURA_DEMONSTRATIVO");
  const { toast } = useToast();

  // Get user data from localStorage (MariaDB auth)
  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  // Verificar anexos
  const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO" || a.tipo === "FATURA");
  const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES" || a.tipo === "BOLETO");
  const canEnviar = hasFatura && hasBoleto;

  // Função para adicionar novo anexo
  const handleFileUpload = async (fileUrl: string, fileName: string, fileSize: number) => {
    try {
      // Verificar se já existe anexo do mesmo tipo e deletar (substituição)
      const existingAnexo = voucher.anexos.find(a => a.tipo === selectedTipo);
      if (existingAnexo) {
        const match = existingAnexo.fileUrl.match(/voucher-anexos\/(.+)$/);
        if (match) {
          const filePath = match[1];
          await supabase.storage.from("voucher-anexos").remove([filePath]);
        }
        
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "delete_voucher_anexo",
            anexo_id: existingAnexo.id,
          },
        });
      }

      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_anexo",
          voucher_id: voucher.id,
          tipo: selectedTipo,
          file_name: fileName,
          file_url: fileUrl,
          file_size: fileSize,
        },
      });

      if (error) throw error;

      const userData = getUserData();
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: existingAnexo ? "ANEXO_SUBSTITUIDO" : "ANEXO_ADICIONADO",
          detalhe: existingAnexo 
            ? `Anexo "${existingAnexo.fileName}" substituído por "${fileName}" (${selectedTipo})`
            : `Anexo "${fileName}" (${selectedTipo}) adicionado`,
        },
      });

      toast({
        title: existingAnexo ? "Anexo substituído" : "Anexo adicionado",
        description: existingAnexo 
          ? `"${existingAnexo.fileName}" foi substituído por "${fileName}".`
          : `"${fileName}" foi anexado com sucesso.`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar anexo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Enviar voucher (sair do rascunho)
  const handleEnviar = async () => {
    try {
      setLoading(true);

      // Determinar próxima etapa
      let proximaEtapa: "OPERACAO" | "FISCAL" | "FINANCEIRO" | "SUPERVISOR";
      
      if (voucher.tipoDocumento === "ADF") {
        proximaEtapa = "FINANCEIRO";
      } else if (voucher.urgenciaTipo === "URGENTE_REAL") {
        proximaEtapa = "SUPERVISOR";
      } else if (voucher.cobrancaEmNomeDe === "DACHSER") {
        proximaEtapa = "FISCAL";
      } else {
        proximaEtapa = "FINANCEIRO";
      }

      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: proximaEtapa,
          status_envio_cliente: voucher.cobrancaEmNomeDe === "CLIENTE" ? "AGUARDANDO_CLIENTE" : "NAO_APLICA",
        },
      });

      if (error) throw error;

      const userData = getUserData();
      const etapaLabel = proximaEtapa === "SUPERVISOR" ? "Supervisor" : 
                         proximaEtapa === "FISCAL" ? "Fiscal" : "Financeiro";
      
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "RASCUNHO_ENVIADO",
          detalhe: `Rascunho finalizado e enviado para ${etapaLabel}`,
        },
      });

      toast({
        title: "Voucher/SPO enviado!",
        description: `Voucher/SPO enviado para ${etapaLabel}`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar voucher/SPO",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowEnviarConfirm(false);
    }
  };

  // Excluir rascunho
  const handleDelete = async () => {
    try {
      setLoading(true);

      // Delete attachments from storage
      for (const anexo of voucher.anexos) {
        const match = anexo.fileUrl.match(/voucher-anexos\/(.+)$/);
        if (match) {
          await supabase.storage.from("voucher-anexos").remove([match[1]]);
        }
      }

      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "delete_voucher_esteira",
          voucher_id: voucher.id,
        },
      });

      if (error) throw error;

      toast({
        title: "Rascunho excluído",
        description: "O rascunho foi excluído com sucesso.",
      });

      navigate("/fin/esteira");
    } catch (error: any) {
      toast({
        title: "Erro ao excluir rascunho",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Info sobre rascunho */}
      <Alert className="bg-amber-500/10 border-amber-500/30">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-foreground">
          Este voucher/SPO está em <strong>rascunho</strong>. Complete os dados e anexos obrigatórios para enviá-lo.
        </AlertDescription>
      </Alert>

      {/* Checklist de anexos */}
      <Card className="border-[rgba(255,255,255,0.12)]" style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Anexos Obrigatórios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasFatura ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
              {hasFatura ? '✓' : '○'}
            </div>
            <span className={hasFatura ? 'text-foreground' : 'text-muted-foreground'}>
              Fatura / Demonstrativo
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasBoleto ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
              {hasBoleto ? '✓' : '○'}
            </div>
            <span className={hasBoleto ? 'text-foreground' : 'text-muted-foreground'}>
              Boleto / Instruções de Pagamento
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Upload de anexos */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-primary">
            <Upload className="h-5 w-5" />
            Adicionar Anexos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium whitespace-nowrap">Tipo do anexo:</label>
            <Select value={selectedTipo} onValueChange={(v) => setSelectedTipo(v as TipoAnexo)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FATURA_DEMONSTRATIVO">Fatura/Demonstrativo</SelectItem>
                <SelectItem value="BOLETO_INSTRUCOES">Boleto/Instruções</SelectItem>
                <SelectItem value="COMPROVANTE">Comprovante</SelectItem>
                <SelectItem value="OUTROS">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <FileUpload
            label="Selecionar arquivo"
            multiple
            onFileUpload={handleFileUpload}
          />
        </CardContent>
      </Card>

      {/* Ações */}
      <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.12)]">
        <div>
          <h3 className="text-lg font-semibold">Ações do Rascunho</h3>
          <p className="text-sm text-muted-foreground">
            {canEnviar 
              ? "Anexos completos! Você pode enviar o voucher/SPO." 
              : "Adicione os anexos obrigatórios para enviar."}
          </p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button
          variant="outline"
          onClick={() => setShowEditDialog(true)}
          className="gap-2"
        >
          <Edit className="h-4 w-4" />
          Editar Dados
        </Button>

        <Button
          onClick={() => setShowEnviarConfirm(true)}
          disabled={loading || !canEnviar}
          className="gap-2 bg-primary hover:bg-primary/90"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar Voucher/SPO
        </Button>

        <Button
          variant="destructive"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={loading}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Excluir Rascunho
        </Button>
      </div>

      {/* Dialog de edição */}
      {showEditDialog && (
        <EditVoucherDialog
          voucher={voucher}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onSuccess={onUpdate}
        />
      )}

      {/* Confirmação de envio */}
      <AlertDialog open={showEnviarConfirm} onOpenChange={setShowEnviarConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar Voucher/SPO</AlertDialogTitle>
            <AlertDialogDescription>
              Ao enviar, o voucher/SPO sairá do modo rascunho e seguirá para a próxima etapa do fluxo.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnviar} disabled={loading}>
              {loading ? "Enviando..." : "Enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Rascunho</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O rascunho e todos os anexos serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={loading} className="bg-destructive hover:bg-destructive/90">
              {loading ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
