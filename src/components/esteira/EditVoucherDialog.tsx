import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Voucher } from "@/types/voucher";
import { Loader2 } from "lucide-react";

interface EditVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  voucher: Voucher | null;
}

export const EditVoucherDialog = ({ open, onOpenChange, onSuccess, voucher }: EditVoucherDialogProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    numeroSPO: "",
    fornecedor: "",
    cnpjFornecedor: "",
    valor: "",
    moeda: "BRL",
    vencimento: "",
    dataEmissaoDocumento: "",
    cobrancaEmNomeDe: "DACHSER" as "DACHSER" | "CLIENTE",
    formaPagamento: "BOLETO",
    tipoDocumento: "",
    filial: "",
    urgente: false,
  });

  // Update form data when voucher changes
  useEffect(() => {
    if (voucher) {
      setFormData({
        numeroSPO: voucher.numeroSPO || "",
        fornecedor: voucher.fornecedor || "",
        cnpjFornecedor: voucher.cnpjFornecedor || "",
        valor: voucher.valor?.toString() || "",
        moeda: voucher.moeda || "BRL",
        vencimento: voucher.vencimento ? new Date(voucher.vencimento).toISOString().split("T")[0] : "",
        dataEmissaoDocumento: voucher.dataEmissaoDocumento ? new Date(voucher.dataEmissaoDocumento).toISOString().split("T")[0] : "",
        cobrancaEmNomeDe: (voucher.cobrancaEmNomeDe || "DACHSER") as "DACHSER" | "CLIENTE",
        formaPagamento: voucher.formaPagamento || "BOLETO",
        tipoDocumento: voucher.tipoDocumento || "",
        filial: voucher.filial || "",
        urgente: voucher.urgenciaTipo === "URGENTE_REAL",
      });
    }
  }, [voucher]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucher) return;

    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Determine urgencia_tipo based on tipoDocumento and urgente flag
      let urgenciaTipo = "NORMAL";
      if (formData.tipoDocumento === "ARMAZENAGEM" || formData.tipoDocumento === "ICMS") {
        urgenciaTipo = "URGENTE_AUTOMATICO";
      } else if (formData.urgente) {
        urgenciaTipo = "URGENTE_REAL";
      }

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          numero_spo: formData.numeroSPO,
          fornecedor: formData.fornecedor || null,
          cnpj_fornecedor: formData.cnpjFornecedor || null,
          valor: formData.valor ? parseFloat(formData.valor.replace(",", ".")) : null,
          moeda: formData.moeda,
          vencimento: new Date(formData.vencimento).toISOString(),
          data_emissao_documento: formData.dataEmissaoDocumento ? new Date(formData.dataEmissaoDocumento).toISOString() : null,
          cobranca_em_nome_de: formData.cobrancaEmNomeDe,
          forma_pagamento: formData.formaPagamento,
          tipo_documento: formData.tipoDocumento || null,
          filial: formData.filial || null,
          urgencia_tipo: urgenciaTipo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", voucher.id);

      if (error) throw error;

      // Log update
      if (userData?.user) {
        await (supabase as any).from("voucher_logs").insert({
          voucher_id: voucher.id,
          user_id: userData.user.id,
          acao: "VOUCHER_EDITADO",
          detalhe: `Voucher ${formData.numeroSPO} editado`,
        });
      }

      toast({
        title: "Voucher atualizado!",
        description: "As alterações foram salvas com sucesso.",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Voucher</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-numeroSPO">Nº SPO/Voucher *</Label>
              <Input
                id="edit-numeroSPO"
                value={formData.numeroSPO}
                onChange={(e) => setFormData({ ...formData, numeroSPO: e.target.value })}
                placeholder="Ex: SPO12345"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-fornecedor">Fornecedor</Label>
              <Input
                id="edit-fornecedor"
                value={formData.fornecedor}
                onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
                placeholder="Nome do fornecedor"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cnpj">CNPJ Fornecedor</Label>
              <Input
                id="edit-cnpj"
                value={formData.cnpjFornecedor}
                onChange={(e) => setFormData({ ...formData, cnpjFornecedor: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-valor">Valor</Label>
              <Input
                id="edit-valor"
                type="number"
                step="0.01"
                value={formData.valor}
                onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-moeda">Moeda</Label>
              <Select
                value={formData.moeda}
                onValueChange={(value) => setFormData({ ...formData, moeda: value })}
              >
                <SelectTrigger id="edit-moeda">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-vencimento">Vencimento *</Label>
              <Input
                id="edit-vencimento"
                type="date"
                value={formData.vencimento}
                onChange={(e) => setFormData({ ...formData, vencimento: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-dataEmissao">Data de Emissão</Label>
              <Input
                id="edit-dataEmissao"
                type="date"
                value={formData.dataEmissaoDocumento}
                onChange={(e) => setFormData({ ...formData, dataEmissaoDocumento: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tipoDocumento">Tipo de Documento *</Label>
              <Select
                value={formData.tipoDocumento}
                onValueChange={(value) => {
                  // Se Armazenagem ou ICMS, força urgência automática
                  const forcarUrgencia = value === "ARMAZENAGEM" || value === "ICMS";
                  setFormData({ 
                    ...formData, 
                    tipoDocumento: value,
                    urgente: forcarUrgencia ? true : formData.urgente
                  });
                }}
              >
                <SelectTrigger id="edit-tipoDocumento">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VOUCHER">Voucher</SelectItem>
                  <SelectItem value="SPO">SPO</SelectItem>
                  <SelectItem value="FATURA">Fatura</SelectItem>
                  <SelectItem value="NOTA_FISCAL">Nota Fiscal</SelectItem>
                  <SelectItem value="DEMONSTRATIVO">Demonstrativo</SelectItem>
                  <SelectItem value="ICMS">ICMS (urgente)</SelectItem>
                  <SelectItem value="ARMAZENAGEM">Armazenagem (urgente)</SelectItem>
                  <SelectItem value="NF_SERVICO">NF Serviço</SelectItem>
                  <SelectItem value="NF_DEBITO">NF Débito</SelectItem>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                  <SelectItem value="ADMINISTRATIVO">Administrativo</SelectItem>
                  <SelectItem value="ADF">ADF</SelectItem>
                  <SelectItem value="OUTROS">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-filial">Filial</Label>
              <Input
                id="edit-filial"
                value={formData.filial}
                onChange={(e) => setFormData({ ...formData, filial: e.target.value })}
                placeholder="Ex: SP01"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cobranca">Cobrança em nome de *</Label>
              <Select
                value={formData.cobrancaEmNomeDe}
                onValueChange={(value) => setFormData({ ...formData, cobrancaEmNomeDe: value as "DACHSER" | "CLIENTE" })}
              >
                <SelectTrigger id="edit-cobranca">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DACHSER">Dachser</SelectItem>
                  <SelectItem value="CLIENTE">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-forma">Forma de Pagamento *</Label>
              <Select
                value={formData.formaPagamento}
                onValueChange={(value) => setFormData({ ...formData, formaPagamento: value })}
              >
                <SelectTrigger id="edit-forma">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                  <SelectItem value="TED">TED</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="TRANSFERENCIA_PIX">Transferência/Pix</SelectItem>
                  <SelectItem value="CARTAO">Cartão</SelectItem>
                  <SelectItem value="DEPOSITO">Depósito</SelectItem>
                  <SelectItem value="DARF">DARF</SelectItem>
                  <SelectItem value="GPS">GPS</SelectItem>
                  <SelectItem value="DEBITO">Débito</SelectItem>
                  <SelectItem value="CAMBIO">Câmbio</SelectItem>
                  <SelectItem value="ADF">ADF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="edit-urgente"
              checked={formData.urgente}
              onCheckedChange={(checked) => setFormData({ ...formData, urgente: checked })}
              disabled={formData.tipoDocumento === "ARMAZENAGEM" || formData.tipoDocumento === "ICMS"}
            />
            <Label htmlFor="edit-urgente" className="cursor-pointer">
              Marcar como urgente
              {(formData.tipoDocumento === "ARMAZENAGEM" || formData.tipoDocumento === "ICMS") && (
                <span className="text-xs text-muted-foreground ml-2">(automático para este tipo)</span>
              )}
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};