import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Voucher } from "@/types/voucher";

const formSchema = z.object({
  numeroSPO: z.string().min(1, "Número SPO é obrigatório"),
  fornecedor: z.string().min(1, "Fornecedor é obrigatório"),
  cnpjFornecedor: z.string().optional(),
  valor: z.string().optional(),
  moeda: z.string().default("BRL"),
  vencimento: z.date({ required_error: "Data de vencimento é obrigatória" }),
  dataEmissaoDocumento: z.date().optional().nullable(),
  cobrancaEmNomeDe: z.enum(["DACHSER", "CLIENTE"]),
  formaPagamento: z.string(),
  tipoDocumento: z.string(),
  filial: z.string().optional(),
  remessa: z.string().default("NENHUM"),
  comentariosOperacao: z.string().optional(),
  clienteEmail: z.string().email().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface EditVoucherDialogProps {
  voucher: Voucher | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoucherUpdated: () => void;
}

export const EditVoucherDialog = ({
  voucher,
  open,
  onOpenChange,
  onVoucherUpdated,
}: EditVoucherDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      moeda: "BRL",
      cobrancaEmNomeDe: "DACHSER",
      formaPagamento: "BOLETO",
      tipoDocumento: "FATURA",
      remessa: "NENHUM",
    },
  });

  useEffect(() => {
    if (voucher) {
      form.reset({
        numeroSPO: voucher.numeroSPO,
        fornecedor: voucher.fornecedor,
        cnpjFornecedor: voucher.cnpjFornecedor || "",
        valor: voucher.valor?.toString() || "",
        moeda: voucher.moeda,
        vencimento: new Date(voucher.vencimento),
        dataEmissaoDocumento: voucher.dataEmissaoDocumento 
          ? new Date(voucher.dataEmissaoDocumento) 
          : null,
        cobrancaEmNomeDe: voucher.cobrancaEmNomeDe,
        formaPagamento: voucher.formaPagamento,
        tipoDocumento: voucher.tipoDocumento,
        filial: voucher.filial || "",
        remessa: voucher.remessa,
        comentariosOperacao: voucher.comentariosOperacao || "",
        clienteEmail: voucher.clienteEmail || "",
      });
    }
  }, [voucher, form]);

  const onSubmit = async (values: FormValues) => {
    if (!voucher) return;
    
    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        throw new Error("Usuário não autenticado");
      }

      const updateData = {
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
        comentarios_operacao: values.comentariosOperacao || null,
        cliente_email: values.clienteEmail || null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await (supabase as any)
        .from("vouchers")
        .update(updateData)
        .eq("id", voucher.id);

      if (updateError) throw updateError;

      // Log update
      await (supabase as any).from("voucher_logs").insert({
        voucher_id: voucher.id,
        user_id: userData.user.id,
        acao: "VOUCHER_EDITADO",
        detalhe: `Voucher ${values.numeroSPO} editado`,
      });

      toast({
        title: "Voucher atualizado",
        description: `O voucher ${values.numeroSPO} foi atualizado com sucesso.`,
      });

      onOpenChange(false);
      onVoucherUpdated();
    } catch (error: any) {
      console.error("Erro ao atualizar voucher:", error);
      toast({
        title: "Erro ao atualizar voucher",
        description: error.message || "Ocorreu um erro ao atualizar o voucher",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Voucher</DialogTitle>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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

            {/* Remessa */}
            <FormField
              control={form.control}
              name="remessa"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remessa</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-[200px]">
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

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
