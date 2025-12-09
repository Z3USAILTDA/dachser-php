import { Voucher } from "@/types/voucher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { FilePreview } from "./FilePreview";

interface VoucherDetailsViewProps {
  voucher: Voucher;
}

export const VoucherDetailsView = ({ voucher }: VoucherDetailsViewProps) => {
  const { toast } = useToast();

  const isImageFile = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Erro ao baixar arquivo",
        description: "Não foi possível baixar o arquivo",
        variant: "destructive",
      });
    }
  };

  const handleDragStart = async (e: React.DragEvent, fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("DownloadURL", `${blob.type}:${fileName}:${fileUrl}`);
      e.dataTransfer.setData("text/plain", fileUrl);
    } catch (error) {
      console.error("Erro ao preparar arquivo para drag:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Informações Básicas */}
      <Card>
        <CardHeader>
          <CardTitle>Informações do Voucher</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nº SPO</p>
              <p className="font-mono font-medium">{voucher.numeroSPO}</p>
            </div>
            {voucher.fornecedor && (
              <div>
                <p className="text-sm text-muted-foreground">Fornecedor</p>
                <p className="text-sm font-medium">{voucher.fornecedor}</p>
              </div>
            )}
            {voucher.cnpjFornecedor && (
              <div>
                <p className="text-sm text-muted-foreground">CNPJ Fornecedor</p>
                <p className="text-sm font-mono">{voucher.cnpjFornecedor}</p>
              </div>
            )}
            {voucher.valor && (
              <div>
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-sm font-medium">
                  {voucher.moeda} {voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Vencimento</p>
              <p className="font-medium">
                {format(voucher.vencimento, "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
            {voucher.dataEmissaoDocumento && (
              <div>
                <p className="text-sm text-muted-foreground">Data Emissão</p>
                <p className="text-sm">
                  {format(voucher.dataEmissaoDocumento, "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
            )}
            {voucher.tipoDocumento && (
              <div>
                <p className="text-sm text-muted-foreground">Tipo Documento</p>
                <Badge variant="outline">{voucher.tipoDocumento.replace("_", " ")}</Badge>
              </div>
            )}
            {voucher.filial && (
              <div>
                <p className="text-sm text-muted-foreground">Filial</p>
                <p className="text-sm">{voucher.filial}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Cobrança em nome de</p>
              <Badge variant="outline">{voucher.cobrancaEmNomeDe}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Forma de Pagamento</p>
              <p className="text-sm">{voucher.formaPagamento.replace("_", "/")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remessa</p>
              <p className="text-sm">{voucher.remessa.replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status da Etapa</p>
              <Badge>{voucher.etapaAtual.replace("_", " ")}</Badge>
            </div>
            {voucher.statusFinanceiro && (
              <div>
                <p className="text-sm text-muted-foreground">Status Financeiro</p>
                <Badge variant={
                  voucher.statusFinanceiro === "CONCLUIDO" ? "default" :
                  voucher.statusFinanceiro === "PROCESSANDO" ? "secondary" :
                  "outline"
                }>
                  {voucher.statusFinanceiro}
                </Badge>
              </div>
            )}
          </div>

          {voucher.urgenciaTipo && voucher.urgenciaTipo !== "NORMAL" && (
            <div className={`border rounded-lg p-4 flex gap-3 ${
              voucher.urgenciaTipo === "URGENTE_REAL" 
                ? "bg-destructive/10 border-destructive/20" 
                : "bg-amber-500/10 border-amber-500/20"
            }`}>
              <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${
                voucher.urgenciaTipo === "URGENTE_REAL" ? "text-destructive" : "text-amber-500"
              }`} />
              <div>
                <p className={`font-medium ${
                  voucher.urgenciaTipo === "URGENTE_REAL" ? "text-destructive" : "text-amber-500"
                }`}>
                  {voucher.urgenciaTipo === "URGENTE_REAL" ? "Urgente Real" : "Urgência Automática"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {voucher.urgenciaTipo === "URGENTE_REAL" 
                    ? "Este voucher foi marcado como urgente e requer aprovação do supervisor"
                    : "Urgência aplicada automaticamente por tipo de documento (ICMS/Armazenagem)"}
                </p>
              </div>
            </div>
          )}

          {voucher.clienteEmail && (
            <div>
              <p className="text-sm text-muted-foreground">Email do Cliente</p>
              <p className="text-sm">{voucher.clienteEmail}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comentários */}
      {(voucher.comentariosOperacao || voucher.comentariosFiscal || voucher.comentariosFinanceiro) && (
        <Card>
          <CardHeader>
            <CardTitle>Comentários</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {voucher.comentariosOperacao && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Operação</p>
                <p className="text-sm">{voucher.comentariosOperacao}</p>
              </div>
            )}
            {voucher.comentariosFiscal && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Fiscal</p>
                <p className="text-sm">{voucher.comentariosFiscal}</p>
              </div>
            )}
            {voucher.comentariosFinanceiro && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Financeiro</p>
                <p className="text-sm">{voucher.comentariosFinanceiro}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ajustes Solicitados */}
      {(voucher.ajusteOperacao || voucher.ajusteFiscal) && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-amber-500">Ajustes Solicitados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {voucher.ajusteOperacao && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Para Operação</p>
                <p className="text-sm">{voucher.ajusteOperacao}</p>
              </div>
            )}
            {voucher.ajusteFiscal && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Para Fiscal</p>
                <p className="text-sm">{voucher.ajusteFiscal}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Anexos */}
      <Card>
        <CardHeader>
          <CardTitle>Anexos</CardTitle>
        </CardHeader>
        <CardContent>
          {voucher.anexos.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhum anexo</p>
          ) : (
            <div className="space-y-2">
              {voucher.anexos.map((anexo) => (
                <div
                  key={anexo.id}
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, anexo.fileUrl, anexo.fileName)}
                  className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-secondary/30 transition-colors cursor-move"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isImageFile(anexo.fileName) ? (
                      <div className="relative h-12 w-12 shrink-0 rounded-md overflow-hidden bg-muted border border-border">
                        <img
                          src={anexo.fileUrl}
                          alt={anexo.fileName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{anexo.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {anexo.tipo.replace("_", " ")}
                        {anexo.fileSize && ` • ${(anexo.fileSize / 1024 / 1024).toFixed(2)} MB`}
                        <span className="ml-2 text-primary">• Arraste para baixar</span>
                      </p>
                    </div>
                  </div>
                  <FilePreview
                    fileName={anexo.fileName}
                    fileUrl={anexo.fileUrl}
                    fileType={anexo.tipo}
                    onDownload={() => handleDownload(anexo.fileUrl, anexo.fileName)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
