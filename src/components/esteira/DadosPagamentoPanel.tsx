import { useState } from "react";
import { 
  Copy, 
  Check, 
  Building2, 
  CreditCard, 
  AlertCircle, 
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Barcode,
  Key
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  TipoExecucaoPagamento, 
  isBoleto, 
  requiresBankDetails, 
  requiresPixKey,
  validarProntoParaRobo,
  Voucher
} from "@/types/voucher";

interface DadosBancarios {
  banco: string;
  agencia: string;
  digito_agencia?: string;
  conta_corrente: string;
  digito_conta?: string;
  razao_social: string;
  cnpj: string;
  chave_pix?: string;
  pix_tipo_chave?: string;
}

interface DadosPagamentoPanelProps {
  voucherId: string;
  formaPagamento: string;
  linhaDigitavel?: string;
  codigoBarras?: string;
  cnpjFornecedor?: string;
  dadosBancarios?: DadosBancarios;
  tipoExecucao?: TipoExecucaoPagamento;
  onUpdate?: () => void;
}

export const DadosPagamentoPanel = ({
  voucherId,
  formaPagamento,
  linhaDigitavel,
  codigoBarras,
  cnpjFornecedor,
  dadosBancarios,
  tipoExecucao,
  onUpdate
}: DadosPagamentoPanelProps) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [reextracting, setReextracting] = useState(false);
  const [editingLinhaDigitavel, setEditingLinhaDigitavel] = useState(false);
  const [linhaDigitavelInput, setLinhaDigitavelInput] = useState(linhaDigitavel || "");
  const [savingLinhaDigitavel, setSavingLinhaDigitavel] = useState(false);
  const { toast } = useToast();

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast({ title: "Copiado!", description: "Texto copiado para a área de transferência" });
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const handleReextract = async () => {
    setReextracting(true);
    try {
      // TODO: Implement re-extraction logic by calling extract-boleto-barcode with the boleto file
      toast({ title: "Re-extração", description: "Funcionalidade em desenvolvimento" });
    } catch (error: unknown) {
      toast({ 
        title: "Erro na re-extração", 
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive" 
      });
    } finally {
      setReextracting(false);
    }
  };

  const handleSaveLinhaDigitavel = async () => {
    setSavingLinhaDigitavel(true);
    try {
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "save_linha_digitavel", 
          voucher_id: voucherId, 
          linha_digitavel: linhaDigitavelInput.trim() 
        }
      });
      if (error) throw error;
      toast({ title: "Linha digitável salva com sucesso" });
      setEditingLinhaDigitavel(false);
      onUpdate?.();
    } catch (error: unknown) {
      toast({ 
        title: "Erro ao salvar", 
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive" 
      });
    } finally {
      setSavingLinhaDigitavel(false);
    }
  };

  const showBoletoSection = isBoleto(formaPagamento as any);
  const showBankSection = !showBoletoSection; // Sempre mostrar dados bancários para não-boleto
  const showPixSection = false; // PIX como tipo de execução foi removido

  // Completeness indicators
  const hasLinhaDigitavel = !!linhaDigitavel;
  const hasCodigoBarras = !!codigoBarras;
  const hasBankData = dadosBancarios && dadosBancarios.banco && dadosBancarios.agencia && dadosBancarios.conta_corrente;
  const hasPixKey = dadosBancarios?.chave_pix;

  const formatBankData = (dados: DadosBancarios) => {
    return `Banco: ${dados.banco}
Agência: ${dados.agencia}${dados.digito_agencia ? `-${dados.digito_agencia}` : ""}
Conta: ${dados.conta_corrente}${dados.digito_conta ? `-${dados.digito_conta}` : ""}
Razão Social: ${dados.razao_social}
CNPJ: ${dados.cnpj}`;
  };

  return (
    <div className="space-y-4">
      {/* Completeness Summary */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border border-border">
        <span className="text-sm font-medium text-muted-foreground">Completude:</span>
        <div className="flex items-center gap-3">
          {showBoletoSection && (
            <div className="flex items-center gap-1.5">
              {hasLinhaDigitavel ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs">Linha Digitável</span>
            </div>
          )}
          {showBankSection && (
            <div className="flex items-center gap-1.5">
              {hasBankData ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs">Dados Bancários</span>
            </div>
          )}
          {showPixSection && (
            <div className="flex items-center gap-1.5">
              {hasPixKey ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs">Chave PIX</span>
            </div>
          )}
        </div>
      </div>

      {/* Boleto Section */}
      {showBoletoSection && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Barcode className="h-4 w-4 text-primary" />
            <span>Dados do Boleto</span>
          </div>
          
          <div className="rounded-lg bg-card border border-border p-4 space-y-3">
            {/* Linha Digitável */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Linha Digitável</Label>
              
              {editingLinhaDigitavel ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={linhaDigitavelInput}
                    onChange={(e) => setLinhaDigitavelInput(e.target.value)}
                    placeholder="Digite a linha digitável..."
                    className="font-mono"
                  />
                  <Button 
                    size="sm" 
                    onClick={handleSaveLinhaDigitavel}
                    disabled={savingLinhaDigitavel}
                  >
                    {savingLinhaDigitavel ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => {
                      setEditingLinhaDigitavel(false);
                      setLinhaDigitavelInput(linhaDigitavel || "");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : linhaDigitavel ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-muted/50 px-3 py-2 rounded border border-border text-foreground break-all">
                    {linhaDigitavel}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(linhaDigitavel, "linha")}
                  >
                    {copiedField === "linha" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingLinhaDigitavel(true)}
                  >
                    Editar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-yellow-500">
                    <AlertCircle className="h-4 w-4" />
                    <span>Não cadastrada</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReextract}
                      disabled={reextracting}
                    >
                      {reextracting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Re-extrair do Anexo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLinhaDigitavel(true)}
                    >
                      Digitar Manualmente
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Código de Barras */}
            {codigoBarras && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Código de Barras (44 dígitos)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-muted/50 px-3 py-2 rounded border border-border text-foreground">
                    {codigoBarras}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(codigoBarras, "barcode")}
                  >
                    {copiedField === "barcode" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bank Details Section */}
      {showBankSection && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" />
            <span>Dados Bancários</span>
          </div>
          
          <div className="rounded-lg bg-card border border-border p-4">
            {dadosBancarios ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Banco:</span>{" "}
                    <span className="text-foreground font-medium">{dadosBancarios.banco}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Agência:</span>{" "}
                    <span className="text-foreground font-medium">
                      {dadosBancarios.agencia}{dadosBancarios.digito_agencia ? `-${dadosBancarios.digito_agencia}` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Conta:</span>{" "}
                    <span className="text-foreground font-medium">
                      {dadosBancarios.conta_corrente}{dadosBancarios.digito_conta ? `-${dadosBancarios.digito_conta}` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Razão Social:</span>{" "}
                    <span className="text-foreground font-medium">{dadosBancarios.razao_social}</span>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(formatBankData(dadosBancarios), "bank")}
                >
                  {copiedField === "bank" ? (
                    <Check className="h-4 w-4 text-green-500 mr-2" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  Copiar Dados Bancários
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-yellow-500">
                <AlertCircle className="h-4 w-4" />
                <span>Dados bancários não encontrados para CNPJ: {cnpjFornecedor}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PIX Section */}
      {showPixSection && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Key className="h-4 w-4 text-primary" />
            <span>Dados PIX</span>
          </div>
          
          <div className="rounded-lg bg-card border border-border p-4">
            {dadosBancarios?.chave_pix ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  <Badge variant="outline" className="text-xs">{dadosBancarios.pix_tipo_chave || "N/A"}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-muted/50 px-3 py-2 rounded border border-border text-foreground">
                    {dadosBancarios.chave_pix}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(dadosBancarios.chave_pix!, "pix")}
                  >
                    {copiedField === "pix" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-yellow-500">
                <AlertCircle className="h-4 w-4" />
                <span>Chave PIX não cadastrada para este fornecedor</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
