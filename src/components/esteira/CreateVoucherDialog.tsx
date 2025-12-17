import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload, X, Search, FileText, RefreshCw, Plane, Ship, FileCheck, AlertCircle, Loader2, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { 
  TipoAnexo,
} from "@/types/voucher";
import { Badge } from "@/components/ui/badge";

// CNPJ formatting and validation utilities
const formatCNPJ = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const validateCNPJ = (cnpj: string): boolean => {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // All same digits
  
  // Calculate verification digits
  const calcDigit = (base: string, weights: number[]): number => {
    const sum = base.split("").reduce((acc, digit, i) => acc + parseInt(digit) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  const digit1 = calcDigit(digits.slice(0, 12), weights1);
  const digit2 = calcDigit(digits.slice(0, 12) + digit1, weights2);
  
  return digits.slice(12) === `${digit1}${digit2}`;
};

const formSchema = z.object({
  numeroRM: z.string().optional(),
  processoId: z.string().optional(),
  origemProcesso: z.enum(["AIR", "SEA", "CHB"]).optional(),
  fornecedor: z.string().optional(),
  beneficiario: z.string().optional(),
  cnpjFornecedor: z.string().optional().refine(
    (val) => !val || val.replace(/\D/g, "").length === 0 || validateCNPJ(val),
    { message: "CNPJ inválido" }
  ),
  valor: z.string().optional(),
  moeda: z.string().default("BRL"),
  vencimento: z.date().optional(),
  dataEmissaoDocumento: z.date().optional(),
  cobrancaEmNomeDe: z.enum(["DACHSER", "CLIENTE"]),
  formaPagamento: z.string(),
  tipoDocumento: z.string().optional(),
  filial: z.string().optional(),
  urgente: z.boolean().default(false),
  comentariosOperacao: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RMData {
  idMovRM: number;
  idLanRM: number;
  fornecedor: string;
  beneficiario: string;
  vencimento: string | null;
  formaPagamento: string;
  formaPagamentoOriginal: string | null;
  valor: number | null;
  dataBaixa: string | null;
  statusLan: number | null;
  cnpjFornecedor: string | null;
}

interface CreateVoucherDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
  onVoucherCreated?: () => void;
}

type EntryMode = "rm" | "manual";
type OrigemProcesso = "AIR" | "SEA" | "CHB";

export const CreateVoucherDialog = ({ 
  open: controlledOpen, 
  onOpenChange, 
  onSuccess,
  onVoucherCreated 
}: CreateVoucherDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchingRM, setIsSearchingRM] = useState(false);
  const [rmDataLoaded, setRmDataLoaded] = useState(false);
  const [cnpjNotFound, setCnpjNotFound] = useState(false); // CNPJ não encontrado via RM
  const [entryMode, setEntryMode] = useState<EntryMode>("rm");
  const [origemProcesso, setOrigemProcesso] = useState<OrigemProcesso | null>(null);
  const [faturaFiles, setFaturaFiles] = useState<File[]>([]);
  const [boletoFiles, setBoletoFiles] = useState<File[]>([]);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      numeroRM: "",
      processoId: "",
      fornecedor: "",
      beneficiario: "",
      cnpjFornecedor: "",
      valor: "",
      moeda: "BRL",
      cobrancaEmNomeDe: "DACHSER",
      formaPagamento: "TRANSFERENCIA_PIX",
      tipoDocumento: "",
      filial: "",
      urgente: false,
      comentariosOperacao: "",
    },
  });

  const handleSearchRM = async () => {
    const numeroRM = form.getValues("numeroRM");
    if (!numeroRM || numeroRM.trim() === "") {
      toast({
        title: "💡 Digite o número do voucher",
        description: "Informe o número do voucher no RM para buscar os dados automaticamente.",
      });
      return;
    }

    setIsSearchingRM(true);
    try {
      const { data, error } = await supabase.functions.invoke("voucher-integrate-rm", {
        body: { action: "fetch", numeroVoucherRM: numeroRM.trim() },
      });

      if (error) throw error;

      if (!data.success) {
        if (data.alreadyProcessed) {
          toast({
            title: "ℹ️ Voucher já baixado",
            description: "Este voucher já possui baixa registrada. Informe outro número ou use a entrada manual.",
          });
        } else {
          toast({
            title: "🔍 Voucher não localizado",
            description: "Não encontramos este voucher no RM. Verifique o número ou use a entrada manual.",
          });
        }
        setIsSearchingRM(false);
        return;
      }

      const rmData: RMData = data.data;
      
      // Fill form with RM data
      form.setValue("fornecedor", rmData.fornecedor || "");
      form.setValue("beneficiario", rmData.beneficiario || "");
      form.setValue("formaPagamento", rmData.formaPagamento);
      
      if (rmData.cnpjFornecedor) {
        form.setValue("cnpjFornecedor", rmData.cnpjFornecedor);
        setCnpjNotFound(false);
      } else {
        form.setValue("cnpjFornecedor", "");
        setCnpjNotFound(true);
        toast({
          title: "📝 CNPJ não encontrado",
          description: "Preencha o CNPJ do fornecedor manualmente no campo abaixo.",
        });
      }
      
      if (rmData.valor) {
        form.setValue("valor", rmData.valor.toFixed(2).replace(".", ","));
      }
      
      if (rmData.vencimento) {
        form.setValue("vencimento", new Date(rmData.vencimento));
      }

      setRmDataLoaded(true);
      
      toast({
        title: "Dados carregados",
        description: `Voucher RM ${numeroRM} encontrado. Dados preenchidos automaticamente.`,
      });
    } catch (error: any) {
      console.error("Erro ao buscar RM:", error);
      toast({
        title: "Erro ao buscar voucher",
        description: error.message || "Não foi possível buscar os dados do RM",
        variant: "destructive",
      });
    } finally {
      setIsSearchingRM(false);
    }
  };
  const handleFaturaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFaturaFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleModeChange = (mode: EntryMode) => {
    if (mode !== entryMode) {
      setEntryMode(mode);
      setRmDataLoaded(false);
      setCnpjNotFound(false);
      // Reset RM-related fields when switching modes
      form.setValue("numeroRM", "");
      form.setValue("fornecedor", "");
      form.setValue("beneficiario", "");
      form.setValue("cnpjFornecedor", "");
      form.setValue("valor", "");
      form.setValue("vencimento", undefined);
    }
  };

  const handleBoletoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setBoletoFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFaturaFile = (index: number) => {
    setFaturaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeBoletoFile = (index: number) => {
    setBoletoFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: FormValues) => {
    // Validation
    if (entryMode === "manual" && !values.numeroRM?.trim()) {
      toast({
        title: "Erro de validação",
        description: "Nº do Voucher é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (entryMode === "manual" && !values.fornecedor) {
      toast({
        title: "Erro de validação",
        description: "Fornecedor é obrigatório no modo manual",
        variant: "destructive",
      });
      return;
    }

    if (!values.vencimento) {
      toast({
        title: "Erro de validação",
        description: "Data de vencimento é obrigatória",
        variant: "destructive",
      });
      return;
    }

    if (faturaFiles.length === 0) {
      toast({
        title: "Erro de validação",
        description: "Fatura e Demonstrativo é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (boletoFiles.length === 0) {
      toast({
        title: "Erro de validação",
        description: "Boleto ou Instruções de Pagamento é obrigatório",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        throw new Error("Usuário não autenticado");
      }

      // Check if tipoDocumento triggers auto-urgency
      const autoUrgent = values.tipoDocumento ? ["ICMS", "ARMAZENAGEM"].includes(values.tipoDocumento) : false;
      const urgenciaTipo = values.urgente 
        ? "URGENTE_REAL" 
        : autoUrgent 
          ? "URGENTE_AUTOMATICO" 
          : "NORMAL";

      const voucherData = {
        numero_spo: values.numeroRM || `MANUAL-${Date.now()}`,
        fornecedor: values.fornecedor || null,
        cnpj_fornecedor: values.cnpjFornecedor || null,
        valor: values.valor ? parseFloat(values.valor.replace(",", ".")) : null,
        moeda: values.moeda,
        vencimento: values.vencimento.toISOString(),
        data_emissao_documento: values.dataEmissaoDocumento?.toISOString() || null,
        cobranca_em_nome_de: values.cobrancaEmNomeDe,
        forma_pagamento: values.formaPagamento,
        tipo_documento: values.tipoDocumento || null,
        filial: values.filial || null,
        urgencia_tipo: urgenciaTipo,
        comentarios_operacao: values.comentariosOperacao || null,
        etapa_atual: values.tipoDocumento === "ADF" ? "FINANCEIRO" : "OPERACAO",
        status_baixa: "PENDENTE",
        status_financeiro: "PENDENTE",
        criado_por_user_id: userData.user.id,
      };

      const { data: voucher, error: voucherError } = await (supabase as any)
        .from("vouchers")
        .insert(voucherData)
        .select()
        .single();

      if (voucherError) throw voucherError;

      // Upload fatura files
      for (const file of faturaFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${voucher.id}/${Date.now()}-fatura.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("voucher-anexos")
          .upload(filePath, file);

        if (uploadError) {
          console.error("Erro ao fazer upload:", uploadError);
          continue;
        }

        const { data: publicUrl } = supabase.storage
          .from("voucher-anexos")
          .getPublicUrl(filePath);

        await (supabase as any).from("voucher_anexos").insert({
          voucher_id: voucher.id,
          tipo: "FATURA" as TipoAnexo,
          file_name: file.name,
          file_url: publicUrl.publicUrl,
          file_size: file.size,
          uploaded_by_user_id: userData.user.id,
        });
      }

      // Upload boleto files
      for (const file of boletoFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${voucher.id}/${Date.now()}-boleto.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("voucher-anexos")
          .upload(filePath, file);

        if (uploadError) {
          console.error("Erro ao fazer upload:", uploadError);
          continue;
        }

        const { data: publicUrl } = supabase.storage
          .from("voucher-anexos")
          .getPublicUrl(filePath);

        await (supabase as any).from("voucher_anexos").insert({
          voucher_id: voucher.id,
          tipo: "BOLETO" as TipoAnexo,
          file_name: file.name,
          file_url: publicUrl.publicUrl,
          file_size: file.size,
          uploaded_by_user_id: userData.user.id,
        });
      }

      // Log creation
      await (supabase as any).from("voucher_logs").insert({
        voucher_id: voucher.id,
        user_id: userData.user.id,
        acao: "VOUCHER_CRIADO",
        detalhe: `Voucher criado via ${entryMode === "rm" ? "RM" : "entrada manual"}`,
      });

      // Save copy to MariaDB dados_dachser.t_vouchers
      try {
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_esteira",
            id: voucher.id, // Use same UUID as Supabase
            numero_spo: voucherData.numero_spo,
            vencimento: values.vencimento?.toISOString(),
            cobranca_em_nome_de: values.cobrancaEmNomeDe,
            forma_pagamento: values.formaPagamento,
            remessa: "NENHUM", // Default value
            urgente: values.urgente ? 1 : 0,
            urgencia_tipo: urgenciaTipo,
            etapa_atual: voucherData.etapa_atual,
            status_baixa: voucherData.status_baixa,
            status_envio_cliente: "NAO_APLICA",
            status_financeiro: voucherData.status_financeiro,
            tipo_documento: values.tipoDocumento,
            valor: voucherData.valor,
            moeda: values.moeda,
            fornecedor: values.fornecedor,
            cnpj_fornecedor: values.cnpjFornecedor,
            cliente_email: null,
            filial: values.filial,
            data_emissao_documento: values.dataEmissaoDocumento?.toISOString().split('T')[0],
            comentarios_operacao: values.comentariosOperacao,
            criado_por_user_id: userData.user.id,
          },
        });
        console.log("Voucher saved to MariaDB dados_dachser.t_vouchers");
      } catch (mariaErr) {
        console.error("Error saving to MariaDB:", mariaErr);
        // Don't fail the main operation, just log the error
      }

      toast({
        title: "Voucher criado",
        description: `O voucher foi criado com sucesso.`,
      });

      form.reset();
      setFaturaFiles([]);
      setBoletoFiles([]);
      setOrigemProcesso(null);
      setEntryMode("rm");
      setRmDataLoaded(false);
      setOpen(false);
      onSuccess?.();
      onVoucherCreated?.();
    } catch (error: any) {
      console.error("Erro ao criar voucher:", error);
      toast({
        title: "Erro ao criar voucher",
        description: error.message || "Ocorreu um erro ao criar o voucher",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const SyncIcon = () => (
    <RefreshCw className="h-3 w-3 text-primary" />
  );

  const isRmMode = entryMode === "rm";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Novo Voucher
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-[rgba(5,6,18,0.95)] border-border/50 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,.85)]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Novo Voucher
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Busque os dados do voucher no RM ou preencha manualmente
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Mode Toggle - Tab style */}
            <div className="flex gap-2 p-1 bg-background/30 rounded-xl border border-border/50">
              <Button
                type="button"
                variant={isRmMode ? "default" : "ghost"}
                className={cn(
                  "flex-1 gap-2 rounded-lg",
                  isRmMode && "bg-primary text-primary-foreground shadow-lg"
                )}
                onClick={() => handleModeChange("rm")}
              >
                <Search className="h-4 w-4" />
                Criar a partir do RM
              </Button>
              <Button
                type="button"
                variant={!isRmMode ? "default" : "ghost"}
                className={cn(
                  "flex-1 gap-2 rounded-lg",
                  !isRmMode && "bg-primary text-primary-foreground shadow-lg"
                )}
                onClick={() => handleModeChange("manual")}
              >
                <FileText className="h-4 w-4" />
                Entrada Manual
              </Button>
            </div>

            {/* Manual Mode Alert + Voucher Number Field */}
            {!isRmMode && (
              <>
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
                  <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-400">Modo de Entrada Manual</p>
                    <p className="text-sm text-muted-foreground">
                      Preencha todos os campos manualmente. Use este modo quando o voucher não estiver cadastrado no RM.
                    </p>
                  </div>
                </div>
                
                {/* Voucher Number - Manual Entry */}
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Nº do Voucher</span>
                    <span className="text-destructive">*</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="numeroRM"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input 
                            placeholder="Ex: 8647525655" 
                            className="bg-background/50 border-border"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {/* RM Number Section - Only in RM mode */}
            {isRmMode && (
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Buscar Voucher no RM</span>
                  <span className="text-destructive">*</span>
                  {rmDataLoaded && (
                    <Badge className="ml-2 bg-green-500/10 text-green-400 border-green-500/20">
                      <Check className="h-3 w-3 mr-1" />
                      Dados carregados
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="numeroRM"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input 
                            placeholder="Ex: 8647525655" 
                            className="bg-background/50 border-border"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSearchRM();
                              }
                            }}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    onClick={handleSearchRM}
                    disabled={isSearchingRM}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                  >
                    {isSearchingRM ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Buscar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Vinculação ao Processo Logístico */}
            <div className="p-4 rounded-xl border border-border/30 bg-background/20 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Vinculação ao Processo</span>
                <span className="text-destructive text-xs">obrigatório</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="processoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        Nº do Processo
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: AIR-2024-001234"
                          className="bg-background/30 border-border/50 focus:border-primary/50"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div>
                  <Label className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                    Origem do Processo
                  </Label>
                  <div className="flex gap-2">
                    {(["AIR", "SEA", "CHB"] as OrigemProcesso[]).map((tipo) => (
                      <Button
                        key={tipo}
                        type="button"
                        variant={origemProcesso === tipo ? "default" : "outline"}
                        className={cn(
                          "flex-1 gap-1.5 rounded-lg",
                          origemProcesso === tipo 
                            ? "bg-primary text-primary-foreground shadow-md" 
                            : "bg-background/30 border-border/50 hover:bg-background/50 hover:border-primary/30"
                        )}
                        onClick={() => setOrigemProcesso(tipo)}
                      >
                        {tipo === "AIR" && <Plane className="h-4 w-4" />}
                        {tipo === "SEA" && <Ship className="h-4 w-4" />}
                        {tipo === "CHB" && <FileCheck className="h-4 w-4" />}
                        {tipo}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dados do Voucher */}
            <div className="p-4 rounded-xl border border-border/30 bg-background/20 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Dados do Voucher</span>
                  {isRmMode && rmDataLoaded && (
                    <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5 text-primary">
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Sincronizado via RM
                    </Badge>
                  )}
                  {!isRmMode && (
                    <Badge variant="secondary" className="text-xs bg-muted/50">
                      Preenchimento manual
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="space-y-4">
                {/* Row 1: Fornecedor, CNPJ */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fornecedor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          Fornecedor {isRmMode && <SyncIcon />}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={isRmMode ? "Preenchido pelo RM" : "Nome do fornecedor"}
                            className="bg-background/50 border-border"
                            disabled={isRmMode}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cnpjFornecedor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          CNPJ Fornecedor 
                          {isRmMode && !cnpjNotFound && <SyncIcon />}
                          {cnpjNotFound && (
                            <Badge variant="outline" className="ml-1 text-xs border-amber-500/50 text-amber-500">
                              Não encontrado
                            </Badge>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="00.000.000/0000-00"
                            className="bg-background/50 border-border"
                            disabled={isRmMode && !cnpjNotFound}
                            maxLength={18}
                            value={field.value || ""}
                            onChange={(e) => {
                              const formatted = formatCNPJ(e.target.value);
                              field.onChange(formatted);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 1.5: Beneficiário (only when RM data loaded) */}
                {isRmMode && rmDataLoaded && form.getValues("beneficiario") && (
                  <FormField
                    control={form.control}
                    name="beneficiario"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          Beneficiário {isRmMode && <SyncIcon />}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Preenchido pelo RM"
                            className="bg-background/50 border-border"
                            disabled={true}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Row 2: Valor, Moeda, Tipo Documento */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="valor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          Valor
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="0.00"
                            className="bg-background/50 border-border"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="moeda"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          Moeda
                        </FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-background/50 border-border">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BRL">BRL</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tipoDocumento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          Tipo de Documento <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-background/50 border-border">
                              <SelectValue placeholder="Selecione o tipo..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="VOUCHER">Voucher</SelectItem>
                            <SelectItem value="SPO">SPO</SelectItem>
                            <SelectItem value="ICMS">ICMS</SelectItem>
                            <SelectItem value="ARMAZENAGEM">Armazenagem</SelectItem>
                            <SelectItem value="ADMINISTRATIVO">Administrativo</SelectItem>
                            <SelectItem value="ADF">ADF</SelectItem>
                            <SelectItem value="FATURA">Fatura</SelectItem>
                            <SelectItem value="NOTA_FISCAL">Nota Fiscal</SelectItem>
                            <SelectItem value="DEMONSTRATIVO">Demonstrativo</SelectItem>
                            <SelectItem value="OUTROS">Outros</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Row 3: Data Vencimento, Data Emissão */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vencimento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          Data de Vencimento <span className="text-destructive">*</span> {isRmMode && <SyncIcon />}
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                disabled={isRmMode}
                                className={cn(
                                  "w-full pl-3 text-left font-normal bg-background/50 border-border",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                ) : (
                                  <span>dd/mm/aaaa</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              locale={ptBR}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dataEmissaoDocumento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 text-sm">
                          Data de Emissão
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal bg-background/50 border-border",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                ) : (
                                  <span>dd/mm/aaaa</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              locale={ptBR}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Campos Adicionais (não do RM) */}
            <div className="space-y-4">
              <Label className="text-sm text-muted-foreground">Campos Adicionais (não do RM)</Label>
              
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="filial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Filial</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: SP01" 
                          className="bg-background/50 border-border"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cobrancaEmNomeDe"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">
                        Cobrança em nome de <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-border">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="DACHSER">Dachser</SelectItem>
                          <SelectItem value="CLIENTE">Cliente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="formaPagamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">
                        Forma de Pagamento <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 border-border">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="TRANSFERENCIA_PIX">Transferência/Pix</SelectItem>
                          <SelectItem value="BOLETO">Boleto</SelectItem>
                          <SelectItem value="TED">TED</SelectItem>
                          <SelectItem value="DARF">DARF</SelectItem>
                          <SelectItem value="GPS">GPS</SelectItem>
                          <SelectItem value="DEBITO">Débito</SelectItem>
                          <SelectItem value="CAMBIO">Câmbio</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Urgency Checkbox */}
            <FormField
              control={form.control}
              name="urgente"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="border-primary data-[state=checked]:bg-primary"
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal cursor-pointer !mt-0">
                    Pagamento Urgente (Urgência Real - Requer Aprovação)
                  </FormLabel>
                </FormItem>
              )}
            />

            {/* Comentários */}
            <FormField
              control={form.control}
              name="comentariosOperacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Comentários</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informações adicionais..."
                      className="min-h-[80px] bg-background/50 border-border resize-y"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* File Upload Areas */}
            <div className="space-y-4">
              {/* Fatura e Demonstrativo */}
              <div>
                <Label className="text-sm font-medium">
                  Fatura e Demonstrativo <span className="text-destructive">*</span>
                </Label>
                <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors bg-background/30">
                  <input
                    type="file"
                    multiple
                    onChange={handleFaturaChange}
                    className="hidden"
                    id="fatura-upload"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.xml"
                  />
                  <label htmlFor="fatura-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Arraste o arquivo ou clique para selecionar
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Formatos: PDF, JPG, PNG, Excel, Word, XML (máx. 50MB)
                    </span>
                  </label>
                </div>
                {faturaFiles.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {faturaFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm truncate">{file.name}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeFaturaFile(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Boleto ou Instruções */}
              <div>
                <Label className="text-sm font-medium">
                  Boleto ou Instruções de Pagamento <span className="text-destructive">*</span>
                </Label>
                <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors bg-background/30">
                  <input
                    type="file"
                    multiple
                    onChange={handleBoletoChange}
                    className="hidden"
                    id="boleto-upload"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.xml"
                  />
                  <label htmlFor="boleto-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Arraste o arquivo ou clique para selecionar
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Formatos: PDF, JPG, PNG, Excel, Word, XML (máx. 50MB)
                    </span>
                  </label>
                </div>
                {boletoFiles.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {boletoFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                        <span className="text-sm truncate">{file.name}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeBoletoFile(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="border-border"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSubmitting ? "Enviando..." : "Enviar Voucher"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
