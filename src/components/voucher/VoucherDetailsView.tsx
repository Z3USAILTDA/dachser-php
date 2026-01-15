import { Voucher, ETAPA_LABELS } from "@/types/voucher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, File, Trash2, AlertTriangle } from "lucide-react";
import { formatDateOnlyBR, formatDateTimeBR } from "@/utils/timezone";

interface VoucherDetailsViewProps {
  voucher: Voucher;
  onUpdate: () => void;
  canEditAttachments?: boolean;
}

export const VoucherDetailsView = ({ voucher, canEditAttachments = false }: VoucherDetailsViewProps) => {
  const InfoItem = ({ label, value, highlight = false }: { label: string; value: string | number | undefined; highlight?: boolean }) => (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`font-medium ${highlight ? 'text-primary' : 'text-foreground'}`}>{value || '-'}</p>
    </div>
  );

  const getUrgenciaBadge = () => {
    switch (voucher.urgenciaTipo) {
      case "URGENTE_REAL":
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Urgente Real</Badge>;
      case "URGENTE_AUTOMATICO":
        return <Badge className="bg-warning text-warning-foreground">Urgente Automático</Badge>;
      default:
        return <Badge variant="outline">Normal</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Info Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="Número SPO" value={voucher.numeroSPO} highlight />
        <InfoItem label="Fornecedor" value={voucher.fornecedor} />
        <InfoItem label="CNPJ" value={voucher.cnpjFornecedor} />
        <InfoItem label="Filial" value={voucher.filial} />
        
        <InfoItem 
          label="Valor" 
          value={voucher.valor ? `${voucher.moeda} ${voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined} 
          highlight 
        />
        <InfoItem 
          label="Vencimento" 
          value={formatDateOnlyBR(voucher.vencimento)} 
        />
        <InfoItem 
          label="Data Emissão" 
          value={voucher.dataEmissaoDocumento ? formatDateOnlyBR(voucher.dataEmissaoDocumento) : undefined} 
        />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Urgência</p>
          {getUrgenciaBadge()}
        </div>
      </div>

      {/* Payment Info */}
      <Card className="bg-muted/20 border-border/30">
        <CardContent className="pt-6">
          <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Informações de Pagamento</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="Cobrança em Nome De" value={voucher.cobrancaEmNomeDe} />
            <InfoItem label="Forma de Pagamento" value={voucher.formaPagamento} />
            <InfoItem label="Tipo de Documento" value={voucher.tipoDocumento} />
            <InfoItem label="Remessa" value={voucher.remessa} />
          </div>
        </CardContent>
      </Card>

      {/* Status Info */}
      <Card className="bg-muted/20 border-border/30">
        <CardContent className="pt-6">
          <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Status do Workflow</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Etapa Atual</p>
              <Badge className="bg-primary text-primary-foreground">{ETAPA_LABELS[voucher.etapaAtual]}</Badge>
            </div>
            <InfoItem label="Status Baixa" value={voucher.statusBaixa} />
            <InfoItem label="Status Financeiro" value={voucher.statusFinanceiro} />
            <InfoItem label="Envio Cliente" value={voucher.statusEnvioCliente} />
          </div>
        </CardContent>
      </Card>

      {/* Responsáveis */}
      <Card className="bg-muted/20 border-border/30">
        <CardContent className="pt-6">
          <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Responsáveis</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Criado Por" value={voucher.criadoPorUserName} />
            <InfoItem label="Resp. Operação" value={voucher.responsavelOperacaoUserName} />
            <InfoItem label="Resp. Fiscal" value={voucher.responsavelFiscalUserName} />
            <InfoItem label="Resp. Supervisor" value={voucher.responsavelSupervisorUserName} />
            <InfoItem label="Resp. Financeiro" value={voucher.responsavelFinanceiroUserName} />
            <InfoItem label="Aprovado Por" value={voucher.aprovadoPorUserName} />
          </div>
        </CardContent>
      </Card>

      {/* Comentários */}
      {(voucher.comentariosOperacao || voucher.comentariosFiscal || voucher.comentariosFinanceiro) && (
        <Card className="bg-muted/20 border-border/30">
          <CardContent className="pt-6">
            <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Comentários</h4>
            <div className="space-y-4">
              {voucher.comentariosOperacao && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Operação:</p>
                  <p className="text-sm bg-background/50 p-3 rounded-lg">{voucher.comentariosOperacao}</p>
                </div>
              )}
              {voucher.comentariosFiscal && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fiscal:</p>
                  <p className="text-sm bg-background/50 p-3 rounded-lg">{voucher.comentariosFiscal}</p>
                </div>
              )}
              {voucher.comentariosFinanceiro && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Financeiro:</p>
                  <p className="text-sm bg-background/50 p-3 rounded-lg">{voucher.comentariosFinanceiro}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anexos */}
      <Card className="bg-muted/20 border-border/30">
        <CardContent className="pt-6">
          <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Anexos</h4>
          {voucher.anexos.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhum anexo</p>
          ) : (
            <div className="space-y-2">
              {voucher.anexos.map((anexo) => (
                <div 
                  key={anexo.id} 
                  className="flex items-center justify-between p-3 bg-background/50 rounded-lg hover:bg-background/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <File className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{anexo.fileName}</p>
                      <p className="text-xs text-muted-foreground">{anexo.tipo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <a href={anexo.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {canEditAttachments && (
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <p>Criado em: {formatDateTimeBR(voucher.createdAt)}</p>
        <p>Atualizado em: {formatDateTimeBR(voucher.updatedAt)}</p>
      </div>
    </div>
  );
};
