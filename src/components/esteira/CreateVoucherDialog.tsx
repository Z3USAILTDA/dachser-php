import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload, X, Search, FileText, RefreshCw, Plane, Ship, FileCheck, AlertCircle, Loader2, Check, Save } from "lucide-react";
import { format, parse, isValid } from "date-fns";
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
import { DateInputField } from "./DateInputField";

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
  idRM: string;
  numeroVoucher: string;
  numeroDocumento: string;
  fornecedor: string;
  filial: string;
  numeroNF: string;
  numeroProcesso: string;
  modal: string;
  tipoDocumento: string;
  formaPagamento: string;
  dataEmissao: string | null;
  vencimento: string | null;
  valor: number | null;
  moeda: string;
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
  const [cnpjNotFound, setCnpjNotFound] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("rm");
  const [origemProcesso, setOrigemProcesso] = useState<OrigemProcesso | null>(null);
  const [faturaFiles, setFaturaFiles] = useState<File[]>([]);
  const [boletoFiles, setBoletoFiles] = useState<File[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [idRM, setIdRM] = useState<string | null>(null);
  const { toast } = useToast();

  const DRAFT_KEY = "voucher_draft";

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

  // Load draft from localStorage when dialog opens
  useEffect(() => {
    if (open) {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          setHasDraft(true);
          
          // Restore form values
          if (draft.formValues) {
            Object.entries(draft.formValues).forEach(([key, value]) => {
              if (key === "vencimento" || key === "dataEmissaoDocumento") {
                if (value) {
                  form.setValue(key as keyof FormValues, new Date(value as string));
                }
              } else {
                form.setValue(key as keyof FormValues, value as any);
              }
            });
          }
          
          // Restore other state
          if (draft.entryMode) setEntryMode(draft.entryMode);
          if (draft.origemProcesso) setOrigemProcesso(draft.origemProcesso);
          if (draft.rmDataLoaded) setRmDataLoaded(draft.rmDataLoaded);
          
          toast({
            title: "📝 Rascunho recuperado",
            description: "Os dados do voucher foram restaurados automaticamente.",
          });
        } catch (e) {
          console.error("Erro ao carregar rascunho:", e);
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    }
  }, [open]);

  // Auto-save draft when form values change
  const saveDraft = useCallback(() => {
    const formValues = form.getValues();
    const draft = {
      formValues: {
        ...formValues,
        vencimento: formValues.vencimento?.toISOString(),
        dataEmissaoDocumento: formValues.dataEmissaoDocumento?.toISOString(),
      },
      entryMode,
      origemProcesso,
      rmDataLoaded,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setHasDraft(true);
  }, [form, entryMode, origemProcesso, rmDataLoaded]);

  // Watch form changes and auto-save
  useEffect(() => {
    const subscription = form.watch(() => {
      if (open) {
        saveDraft();
      }
    });
    return () => subscription.unsubscribe();
  }, [form, open, saveDraft]);

  // Also save when entryMode or origemProcesso changes
  useEffect(() => {
    if (open) {
      saveDraft();
    }
  }, [entryMode, origemProcesso, open, saveDraft]);

  // Clear draft function
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
    form.reset();
    setFaturaFiles([]);
    setBoletoFiles([]);
    setOrigemProcesso(null);
    setEntryMode("rm");
    setRmDataLoaded(false);
    setCnpjNotFound(false);
    toast({
      title: "🗑️ Rascunho limpo",
      description: "Os dados do rascunho foram removidos.",
    });
  };

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
      
      // Fill form with RM data from t_dados_financeiro_voucher
      form.setValue("fornecedor", rmData.fornecedor || "");
      form.setValue("filial", rmData.filial || "");
      form.setValue("formaPagamento", rmData.formaPagamento);
      form.setValue("tipoDocumento", rmData.tipoDocumento || "");
      form.setValue("moeda", rmData.moeda || "BRL");
      form.setValue("processoId", rmData.numeroProcesso || "");
      
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

      if (rmData.dataEmissao) {
        form.setValue("dataEmissaoDocumento", new Date(rmData.dataEmissao));
      }

      // Modal → origemProcesso (AIR/SEA/CHB)
      if (rmData.modal && ["AIR", "SEA", "CHB"].includes(rmData.modal)) {
        setOrigemProcesso(rmData.modal as OrigemProcesso);
      }

      // Guardar idRM para usar ao salvar em t_vouchers
      setIdRM(rmData.idRM);

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
      setIdRM(null);
      // Reset RM-related fields when switching modes
      form.setValue("numeroRM", "");
      form.setValue("fornecedor", "");
      form.setValue("filial", "");
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

  const handleSubmitVoucher = async (values: FormValues, isDraft: boolean = false) => {
    // Skip validations for draft
    if (!isDraft) {
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
    } else {
      // Draft requires at least a voucher number
      if (!values.numeroRM?.trim()) {
        toast({
          title: "Erro de validação",
          description: "Informe pelo menos o Nº do Voucher para salvar como rascunho",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Get user from localStorage (MariaDB auth) - no authentication required
      const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
      const userData = storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };

      // Check if tipoDocumento triggers auto-urgency
      const autoUrgent = values.tipoDocumento ? ["ICMS", "ARMAZENAGEM"].includes(values.tipoDocumento) : false;
      const urgenciaTipo = values.urgente 
        ? "URGENTE_REAL" 
        : autoUrgent 
          ? "URGENTE_AUTOMATICO" 
          : "NORMAL";

      // Determine etapa_atual based on isDraft and tipoDocumento
      let etapaAtual = "OPERACAO";
      if (isDraft) {
        etapaAtual = "RASCUNHO";
      } else if (values.tipoDocumento === "ADF") {
        etapaAtual = "FINANCEIRO";
      }

      const voucherData = {
        numero_spo: values.numeroRM || `MANUAL-${Date.now()}`,
        fornecedor: values.fornecedor || null,
        cnpj_fornecedor: values.cnpjFornecedor || null,
        valor: values.valor ? parseFloat(values.valor.replace(",", ".")) : null,
        moeda: values.moeda,
        vencimento: values.vencimento?.toISOString() || new Date().toISOString(),
        data_emissao_documento: values.dataEmissaoDocumento?.toISOString() || null,
        cobranca_em_nome_de: values.cobrancaEmNomeDe,
        forma_pagamento: values.formaPagamento,
        tipo_documento: values.tipoDocumento || null,
        filial: values.filial || null,
        urgencia_tipo: urgenciaTipo,
        comentarios_operacao: values.comentariosOperacao || null,
        etapa_atual: etapaAtual,
        status_baixa: "PENDENTE",
        status_financeiro: "PENDENTE",
        criado_por_user_id: null, // MariaDB user ID is integer, not UUID
        origem_criacao: entryMode === "rm" ? "RM" : "MANUAL",
      };

      // Generate UUID for voucher (100% MariaDB - no Supabase insert)
      const voucherId = crypto.randomUUID();

      // PRIMEIRO: Salvar voucher no MariaDB t_vouchers
      const { data: mariaResult, error: mariaError } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_esteira",
          id: voucherId,
          id_rm: idRM, // Referência do RM (de t_dados_financeiro_voucher)
          numero_spo: voucherData.numero_spo,
          vencimento: values.vencimento?.toISOString(),
          cobranca_em_nome_de: values.cobrancaEmNomeDe,
          forma_pagamento: values.formaPagamento,
          remessa: "NENHUM",
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
          criado_por_user_id: userData.id,
        },
      });

      if (mariaError) {
        throw new Error(`Erro ao salvar voucher no MariaDB: ${mariaError.message}`);
      }

      console.log("Voucher saved to MariaDB t_vouchers, ID:", voucherId);

      // Upload fatura files (Supabase Storage) + metadata (MariaDB t_voucher_anexos)
      for (const file of faturaFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${voucherId}/${Date.now()}-fatura.${fileExt}`;

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

        // Salvar metadata no MariaDB (não no Supabase)
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_anexo",
            voucher_id: voucherId,
            tipo: "FATURA",
            file_name: file.name,
            file_url: publicUrl.publicUrl,
            file_size: file.size,
          },
        });
      }

      // Upload boleto files (Supabase Storage) + metadata (MariaDB t_voucher_anexos)
      let linhaDigitavelExtraida = false; // Flag para extrair apenas do primeiro boleto
      
      for (const file of boletoFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${voucherId}/${Date.now()}-boleto.${fileExt}`;

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

        // Salvar metadata no MariaDB (não no Supabase)
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_anexo",
            voucher_id: voucherId,
            tipo: "BOLETO",
            file_name: file.name,
            file_url: publicUrl.publicUrl,
            file_size: file.size,
          },
        });

        // Extrair linha digitável automaticamente do primeiro boleto (apenas para BOLETO)
        if (!linhaDigitavelExtraida && values.formaPagamento === "BOLETO") {
          try {
            console.log("Extraindo linha digitável do boleto...");
            const { data: extractionResult, error: extractionError } = await supabase.functions.invoke("extract-boleto-barcode", {
              body: {
                fileUrl: publicUrl.publicUrl
              },
            });

            if (extractionError) {
              console.error("Erro na extração de código de barras:", extractionError);
            } else if (extractionResult?.success && extractionResult?.linhaDigitavel) {
              // Salvar a linha digitável no MariaDB
              const { error: saveError } = await supabase.functions.invoke("mariadb-proxy", {
                body: {
                  action: "save_linha_digitavel",
                  voucher_id: voucherId,
                  linha_digitavel: extractionResult.linhaDigitavel,
                },
              });

              if (saveError) {
                console.error("Erro ao salvar linha digitável:", saveError);
              } else {
                console.log("Linha digitável extraída e salva:", extractionResult.linhaDigitavel);
                linhaDigitavelExtraida = true;
              }
            } else {
              console.warn("Não foi possível extrair linha digitável:", extractionResult?.error || "Resultado inválido");
            }
          } catch (extractError) {
            console.error("Erro ao extrair linha digitável:", extractError);
            // Não bloqueia a criação do voucher se a extração falhar
          }
        }
      }

      // Log creation in MariaDB
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucherId,
          user_id: userData.id?.toString() || null,
          user_name: userData.username || "Sistema",
          acao: "VOUCHER_CRIADO",
          detalhe: `Voucher criado via ${entryMode === "rm" ? "RM" : "entrada manual"}${idRM ? ` (id_rm: ${idRM})` : ""}`,
        },
      });

      toast({
        title: "Voucher criado",
        description: `O voucher foi criado com sucesso.`,
      });

      // Clear draft on success
      localStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
      
      form.reset();
      setFaturaFiles([]);
      setBoletoFiles([]);
      setOrigemProcesso(null);
      setEntryMode("rm");
      setRmDataLoaded(false);
      setIdRM(null);
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
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Novo Voucher
            </DialogTitle>
            {hasDraft && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                  📝 Rascunho salvo
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearDraft}
                  className="text-muted-foreground hover:text-destructive h-7 px-2"
                >
                  <X className="h-3 w-3 mr-1" />
                  Limpar
                </Button>
              </div>
            )}
          </div>
          <DialogDescription className="text-muted-foreground">
            Busque os dados do voucher no RM ou preencha manualmente
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => handleSubmitVoucher(values, false))} className="space-y-6">
            
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
                  <DateInputField
                    control={form.control}
                    name="vencimento"
                    label="Data de Vencimento"
                    required
                    disabled={isRmMode}
                    showSyncIcon={isRmMode}
                  />
                  <DateInputField
                    control={form.control}
                    name="dataEmissaoDocumento"
                    label="Data de Emissão"
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
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => {
                  const values = form.getValues();
                  handleSubmitVoucher(values, true);
                }}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                Salvar Rascunho
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
