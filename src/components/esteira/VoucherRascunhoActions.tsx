import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Voucher, TipoAnexo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Edit, Send, Trash2, Loader2, Upload, FileText, AlertCircle, CalendarIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileUpload } from "./FileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { parseMariaDBDate } from "@/utils/parseMariaDBDate";

interface VoucherRascunhoActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherRascunhoActions = ({ voucher, onUpdate }: VoucherRascunhoActionsProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEnviarDialog, setShowEnviarDialog] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<TipoAnexo>("FATURA_DEMONSTRATIVO");
  const { toast } = useToast();

  // Estado para vencimento editável no envio
  const initialVencimento = voucher.vencimento instanceof Date ? voucher.vencimento : undefined;
  const [vencimentoEnvio, setVencimentoEnvio] = useState<Date | undefined>(initialVencimento || undefined);

  // Verificar se vencimento está expirado
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isVencimentoExpirado = vencimentoEnvio ? vencimentoEnvio < today : false;

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

      // Extrair linha digitável automaticamente se for boleto e forma de pagamento for BOLETO
      const isBoletoAnexo = selectedTipo === "BOLETO_INSTRUCOES" || selectedTipo === "BOLETO";
      if (isBoletoAnexo && voucher.formaPagamento === "BOLETO") {
        try {
          console.log("Extraindo linha digitável do boleto anexado...");
          const { data: extractionResult, error: extractionError } = await supabase.functions.invoke("extract-boleto-barcode", {
            body: { fileUrl }
          });

          if (!extractionError && extractionResult?.success && extractionResult?.linhaDigitavel) {
            // Salvar linha digitável no voucher
            await supabase.functions.invoke("mariadb-proxy", {
              body: {
                action: "save_linha_digitavel",
                voucher_id: voucher.id,
                linha_digitavel: extractionResult.linhaDigitavel,
                codigo_barras: extractionResult.codigoBarras || null,
              },
            });
            
            toast({
              title: "Linha digitável extraída",
              description: "A linha digitável foi extraída automaticamente do boleto.",
            });
          } else {
            console.warn("Não foi possível extrair linha digitável:", extractionError || extractionResult?.error);
          }
        } catch (extractError) {
          console.error("Erro ao extrair linha digitável:", extractError);
          // Não bloquear o fluxo se a extração falhar
        }
      }

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

  // Helper para formatar data para o banco
  const formatDateForDB = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Enviar voucher (sair do rascunho)
  const handleEnviar = async () => {
    try {
      setLoading(true);
      const userData = getUserData();

      // Se vencimento foi alterado, atualizar antes de mudar etapa
      const originalVenc = initialVencimento?.getTime();
      const newVenc = vencimentoEnvio?.getTime();
      if (vencimentoEnvio && originalVenc !== newVenc) {
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "update_voucher_esteira",
            voucher_id: voucher.id,
            vencimento: formatDateForDB(vencimentoEnvio),
          },
        });

        // Log da alteração de vencimento
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_log",
            voucher_id: voucher.id,
            user_id: userData.id?.toString(),
            user_name: userData.username,
            acao: "VENCIMENTO_ALTERADO",
            detalhe: `Vencimento alterado para ${format(vencimentoEnvio, 'dd/MM/yyyy', { locale: ptBR })} antes do envio`,
          },
        });
      }

      // Determinar próxima etapa (ADF segue fluxo normal)
      let proximaEtapa: "OPERACAO" | "FISCAL" | "FINANCEIRO" | "SUPERVISOR";
      
      if (voucher.urgenciaTipo === "URGENTE_REAL") {
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

      const etapaLabel = proximaEtapa === "SUPERVISOR" ? "Supervisor" : 
                         proximaEtapa === "FISCAL" ? "Fiscal" : "Financeiro";
      
      const isFromAProcessar = voucher.etapaAtual === "A_PROCESSAR";
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: isFromAProcessar ? "VOUCHER_ENVIADO" : "RASCUNHO_ENVIADO",
          detalhe: isFromAProcessar 
            ? `Voucher processado e enviado para ${etapaLabel}`
            : `Rascunho finalizado e enviado para ${etapaLabel}`,
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
      setShowEnviarDialog(false);
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
        title: "Voucher excluído",
        description: "O voucher foi excluído com sucesso.",
      });

      navigate("/fin/esteira");
    } catch (error: any) {
      toast({
        title: "Erro ao excluir voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const isAProcessar = voucher.etapaAtual === "A_PROCESSAR";
  const stageLabel = isAProcessar ? "a processar" : "rascunho";
  const stageLabelCapitalized = isAProcessar ? "A Processar" : "Rascunho";

  return (
    <div className="space-y-6">
      {/* Info sobre rascunho/a processar */}
      <Alert className="bg-amber-500/10 border-amber-500/30">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-foreground">
          Este voucher/SPO está em <strong>{stageLabel}</strong>. Complete os dados e anexos obrigatórios para enviá-lo.
        </AlertDescription>
      </Alert>

      {/* Aviso de vencimento expirado */}
      {isVencimentoExpirado && (
        <Alert className="bg-red-500/10 border-red-500/30">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-400">
            <strong>Data de vencimento expirada!</strong> Altere a data de vencimento para uma data válida (hoje ou futura) antes de enviar o voucher.
          </AlertDescription>
        </Alert>
      )}

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
          <h3 className="text-lg font-semibold">Ações - {stageLabelCapitalized}</h3>
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
          onClick={() => setShowEnviarDialog(true)}
          disabled={loading || !canEnviar || isVencimentoExpirado}
          className="gap-2 bg-primary hover:bg-primary/90"
          title={isVencimentoExpirado ? "Altere a data de vencimento antes de enviar" : undefined}
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
          Excluir Voucher
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

      {/* Dialog de envio com campo de vencimento editável */}
      <Dialog open={showEnviarDialog} onOpenChange={setShowEnviarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Voucher/SPO</DialogTitle>
            <DialogDescription>
              Confirme os dados antes de enviar para a próxima etapa do fluxo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Campo de vencimento editável */}
            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !vencimentoEnvio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {vencimentoEnvio ? format(vencimentoEnvio, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={vencimentoEnvio}
                    onSelect={setVencimentoEnvio}
                    disabled={(date) => {
                      const todayMidnight = new Date();
                      todayMidnight.setHours(0, 0, 0, 0);
                      return date < todayMidnight;
                    }}
                    className="pointer-events-auto"
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Resumo do voucher */}
            <div className="text-sm text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/50">
              <p><span className="font-medium text-foreground">Nº:</span> {voucher.numeroSPO}</p>
              <p><span className="font-medium text-foreground">Valor:</span> {voucher.moeda} {Number(voucher.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p><span className="font-medium text-foreground">Fornecedor:</span> {voucher.fornecedor}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnviarDialog(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Confirmar e Enviar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Voucher</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O voucher e todos os anexos serão excluídos permanentemente.
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
