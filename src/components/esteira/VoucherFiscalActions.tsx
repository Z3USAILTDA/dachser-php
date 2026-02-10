import { useState, useEffect } from "react";
import { Voucher, VoucherFilho } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Edit3, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface VoucherFiscalActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherFiscalActions = ({ voucher, onUpdate }: VoucherFiscalActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [comentarios, setComentarios] = useState(voucher.comentariosFiscal || "");
  const [necessitaAjuste, setNecessitaAjuste] = useState(false);
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [novoNumeroSpo, setNovoNumeroSpo] = useState("");
  const [isUpdatingNumero, setIsUpdatingNumero] = useState(false);
  const [vouchersFilhos, setVouchersFilhos] = useState<VoucherFilho[]>([]);
  const [filhosExpanded, setFilhosExpanded] = useState(false);
  const { toast } = useToast();

  const isMaster = voucher.isMaster || voucher.origemCriacao === "MASTER" || voucher.numeroSPO?.startsWith("MASTER-");

  // Fetch child vouchers if this is a master
  useEffect(() => {
    if (isMaster) {
      loadVouchersFilhos();
    }
  }, [voucher.id, isMaster]);

  const loadVouchersFilhos = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_voucher_filhos",
          master_id: voucher.id,
        },
      });

      if (error) throw error;
      if (data?.data) {
        setVouchersFilhos(data.data.map((f: any) => ({
          id: f.id,
          numeroSPO: f.numero_spo,
          fornecedor: f.fornecedor,
          valor: f.valor,
          moeda: f.moeda,
          vencimento: f.vencimento,
          etapaAtual: f.etapa_atual,
        })));
      }
    } catch (error) {
      console.error("Error loading child vouchers:", error);
    }
  };

  // Get user data from localStorage (MariaDB auth)
  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  const handleAtualizarNumeroSpo = async () => {
    if (!novoNumeroSpo.trim()) {
      toast({
        title: "Número obrigatório",
        description: "Informe o novo número do SPO/RM",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUpdatingNumero(true);
      const userData = getUserData();

      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_numero_spo",
          voucher_id: voucher.id,
          novo_numero_spo: novoNumeroSpo.trim(),
          user_id: userData.id?.toString(),
          user_name: userData.username,
        },
      });

      if (error) throw error;

      toast({
        title: "Número atualizado!",
        description: `Número alterado para: ${novoNumeroSpo}`,
      });

      setNovoNumeroSpo("");
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar número",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingNumero(false);
    }
  };

  const handleAprovar = async () => {
    try {
      setLoading(true);
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "FINANCEIRO",
          comentarios_fiscal: comentarios || null,
          responsavel_fiscal_user_id: userData.id?.toString(),
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
          acao: "APROVADO_FISCAL",
          detalhe: "Voucher/SPO aprovado pelo Fiscal e enviado para Financeiro",
        },
      });

      toast({
        title: "Voucher/SPO aprovado!",
        description: "Voucher/SPO enviado para Financeiro",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao aprovar voucher/SPO",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDevolver = async () => {
    if (!motivoAjuste.trim()) {
      toast({
        title: "Motivo obrigatório",
        description: "Informe o motivo da devolução para a Operação",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "AJUSTE_OPERACAO",
          ajuste_operacao: motivoAjuste,
          comentarios_fiscal: comentarios || null,
          responsavel_fiscal_user_id: userData.id?.toString(),
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
          acao: "DEVOLVIDO_FISCAL",
          detalhe: `Devolvido para Operação: ${motivoAjuste}`,
        },
      });

      // OPERACAO não recebe e-mail (quem inicia o processo)

      toast({
        title: "Voucher/SPO devolvido",
        description: "Voucher/SPO devolvido para Operação para ajustes",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao devolver voucher/SPO",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Ações - Fiscal</h3>
        <p className="text-sm text-muted-foreground">
          Revise os dados e documentos da Operação
        </p>
      </div>

      {/* Master Voucher Indicator and Child Vouchers */}
      {isMaster && (
        <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/10">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-5 w-5 text-purple-400" />
            <span className="font-medium text-purple-400">Voucher Master</span>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
              {vouchersFilhos.length} vouchers consolidados
            </Badge>
          </div>
          
          {vouchersFilhos.length > 0 && (
            <Collapsible open={filhosExpanded} onOpenChange={setFilhosExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-purple-400 hover:text-purple-300">
                  Ver vouchers consolidados
                  {filhosExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {vouchersFilhos.map((filho) => (
                  <div key={filho.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                    <div>
                      <span className="font-mono text-sm">{filho.numeroSPO}</span>
                      {filho.fornecedor && (
                        <span className="text-xs text-muted-foreground ml-2">- {filho.fornecedor}</span>
                      )}
                    </div>
                    <span className="text-sm font-medium">
                      {filho.moeda || 'BRL'} {filho.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                    </span>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Update numero_spo field - only for masters */}
          <div className="mt-4 pt-4 border-t border-purple-500/20">
            <Label htmlFor="novo-numero-spo" className="text-sm text-purple-400 flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Atualizar Nº SPO (número do RM)
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Substitua o número gerado automaticamente pelo número oficial do RM
            </p>
            <div className="flex gap-2">
              <Input
                id="novo-numero-spo"
                value={novoNumeroSpo}
                onChange={(e) => setNovoNumeroSpo(e.target.value)}
                placeholder="Ex: 8647525655"
                className="bg-background/50 border-border"
              />
              <Button
                onClick={handleAtualizarNumeroSpo}
                disabled={isUpdatingNumero || !novoNumeroSpo.trim()}
                variant="outline"
                className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
              >
                {isUpdatingNumero ? "Salvando..." : "Atualizar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="comentarios-fiscal">Comentários Fiscal</Label>
          <Textarea
            id="comentarios-fiscal"
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Observações sobre a análise fiscal..."
            rows={3}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="necessita-ajuste"
            checked={necessitaAjuste}
            onCheckedChange={(checked) => setNecessitaAjuste(checked as boolean)}
          />
          <Label htmlFor="necessita-ajuste" className="cursor-pointer">
            Necessita ajuste da Operação?
          </Label>
        </div>

        {necessitaAjuste && (
          <div className="space-y-2">
            <Label htmlFor="motivo-ajuste">
              Motivo do Ajuste <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="motivo-ajuste"
              value={motivoAjuste}
              onChange={(e) => setMotivoAjuste(e.target.value)}
              placeholder="Descreva detalhadamente o que precisa ser ajustado..."
              rows={3}
              className="border-orange-500/50"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {necessitaAjuste ? (
          <Button
            onClick={handleDevolver}
            disabled={loading}
            variant="outline"
            className="gap-2 border-orange-500 text-orange-500 hover:bg-orange-500/10"
          >
            <XCircle className="h-4 w-4" />
            Devolver para Operação
          </Button>
        ) : (
          <Button
            onClick={handleAprovar}
            disabled={loading}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprovar e Enviar para Financeiro
          </Button>
        )}

      </div>
    </div>
  );
};
