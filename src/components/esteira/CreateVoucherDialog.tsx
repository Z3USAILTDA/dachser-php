import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  FormaPagamento, 
  TipoDocumento, 
  CobrancaEmNomeDe,
  TipoAnexo,
  Remessa
} from "@/types/voucher";

const formSchema = z.object({
  numeroSPO: z.string().min(1, "Número SPO é obrigatório"),
  fornecedor: z.string().min(1, "Fornecedor é obrigatório"),
  cnpjFornecedor: z.string().optional(),
  valor: z.string().optional(),
  moeda: z.string().default("BRL"),
  vencimento: z.date({ required_error: "Data de vencimento é obrigatória" }),
  dataEmissaoDocumento: z.date().optional(),
  cobrancaEmNomeDe: z.enum(["DACHSER", "CLIENTE"]),
  formaPagamento: z.string(),
  tipoDocumento: z.string(),
  filial: z.string().optional(),
  remessa: z.string().default("NENHUM"),
  urgente: z.boolean().default(false),
  comentariosOperacao: z.string().optional(),
  clienteEmail: z.string().email().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateVoucherDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
  onVoucherCreated?: () => void;
}

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      moeda: "BRL",
      cobrancaEmNomeDe: "DACHSER",
      formaPagamento: "BOLETO",
      tipoDocumento: "FATURA",
      remessa: "NENHUM",
      urgente: false,
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        throw new Error("Usuário não autenticado");
      }

      // Check if tipoDocumento triggers auto-urgency
      const autoUrgent = ["ICMS", "ARMAZENAGEM"].includes(values.tipoDocumento);
      const urgenciaTipo = values.urgente 
        ? "URGENTE_REAL" 
        : autoUrgent 
          ? "URGENTE_AUTOMATICO" 
          : "NORMAL";

      const voucherData = {
        numero_spo: values.numeroSPO,
        fornecedor: values.fornecedor,
        cnpj_fornecedor: values.cnpjFornecedor || null,
        valor: values.valor ? parseFloat(values.valor.replace(",", ".")) : null,
        moeda: values.moeda,
        vencimento: values.vencimento.toISOString(),
        data_emissao_documento: values.dataEmissaoDocumento?.toISOString() || null,
        cobranca_em_nome_de: values.cobrancaEmNomeDe,
        forma_pagamento: values.formaPagamento,
        tipo_documento: values.tipoDocumento,
        filial: values.filial || null,
        remessa: values.remessa,
        urgente: values.urgente || autoUrgent,
        urgencia_tipo: urgenciaTipo,
        comentarios_operacao: values.comentariosOperacao || null,
        cliente_email: values.clienteEmail || null,
        etapa_atual: "OPERACAO",
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

      // Upload files if any
      if (selectedFiles.length > 0 && voucher) {
        for (const file of selectedFiles) {
          const fileExt = file.name.split(".").pop();
          const filePath = `${voucher.id}/${Date.now()}.${fileExt}`;

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
      }

      // Log creation
      await (supabase as any).from("voucher_logs").insert({
        voucher_id: voucher.id,
        user_id: userData.user.id,
        acao: "VOUCHER_CRIADO",
        detalhe: `Voucher ${values.numeroSPO} criado`,
      });

      toast({
        title: "Voucher criado",
        description: `O voucher ${values.numeroSPO} foi criado com sucesso.`,
      });

      form.reset();
      setSelectedFiles([]);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Voucher
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Voucher</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="numeroSPO"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número SPO *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: SPO-2024-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fornecedor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fornecedor *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do fornecedor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cnpjFornecedor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ Fornecedor</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="filial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Filial</FormLabel>
                    <FormControl>
                      <Input placeholder="Código da filial" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Value and Dates */}
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor</FormLabel>
                    <FormControl>
                      <Input placeholder="0,00" {...field} />
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
                    <FormLabel>Moeda</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
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
                name="vencimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vencimento *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>Selecione</span>
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

            {/* Document Type and Payment */}
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="tipoDocumento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Documento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FATURA">Fatura</SelectItem>
                        <SelectItem value="NOTA_FISCAL">Nota Fiscal</SelectItem>
                        <SelectItem value="DEMONSTRATIVO">Demonstrativo</SelectItem>
                        <SelectItem value="ICMS">ICMS</SelectItem>
                        <SelectItem value="ARMAZENAGEM">Armazenagem</SelectItem>
                        <SelectItem value="NF_SERVICO">NF Serviço</SelectItem>
                        <SelectItem value="NF_DEBITO">NF Débito</SelectItem>
                        <SelectItem value="BOLETO">Boleto</SelectItem>
                        <SelectItem value="OUTROS">Outros</SelectItem>
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
                    <FormLabel>Forma Pagamento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BOLETO">Boleto</SelectItem>
                        <SelectItem value="TED">TED</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="CARTAO">Cartão</SelectItem>
                        <SelectItem value="DEPOSITO">Depósito</SelectItem>
                        <SelectItem value="DARF">DARF</SelectItem>
                        <SelectItem value="GPS">GPS</SelectItem>
                        <SelectItem value="TRANSFERENCIA_PIX">Transferência PIX</SelectItem>
                        <SelectItem value="DEBITO">Débito</SelectItem>
                        <SelectItem value="CAMBIO">Câmbio</SelectItem>
                        <SelectItem value="ADF">ADF</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cobrancaEmNomeDe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cobrança em nome de</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DACHSER">DACHSER</SelectItem>
                        <SelectItem value="CLIENTE">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Remessa and Urgency */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="remessa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remessa</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NENHUM">Nenhum</SelectItem>
                        <SelectItem value="REMESSA_12H">Remessa 12h</SelectItem>
                        <SelectItem value="REMESSA_15H">Remessa 15h</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="urgente"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Urgente</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Requer aprovação do supervisor
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Comments and Email */}
            <FormField
              control={form.control}
              name="comentariosOperacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comentários</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações sobre o voucher..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clienteEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email do Cliente</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="cliente@exemplo.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Anexos</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Clique para selecionar ou arraste arquivos
                  </span>
                </label>
              </div>
              {selectedFiles.length > 0 && (
                <div className="space-y-2 mt-3">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-secondary/30 rounded"
                    >
                      <span className="text-sm truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Criando..." : "Criar Voucher"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
