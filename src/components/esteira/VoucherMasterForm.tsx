import { useState, useCallback, useEffect } from "react";
import { Search, X, ChevronDown, ChevronUp, Layers, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DateInputField } from "./DateInputField";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface VoucherSearchResult {
  id: string;
  numero_spo: string;
  fornecedor?: string;
  cnpj_fornecedor?: string;
  valor?: number;
  moeda?: string;
  vencimento?: string;
  etapa_atual?: string;
  filial?: string;
}

interface VoucherMasterFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

const formSchema = z.object({
  fornecedor: z.string().optional(),
  cnpjFornecedor: z.string().optional(),
  valorTotal: z.string().optional(),
  moeda: z.string().default("BRL"),
  vencimento: z.date().optional(),
  formaPagamento: z.string().default("BOLETO"),
  tipoDocumento: z.string().optional(),
  cobrancaEmNomeDe: z.enum(["DACHSER", "CLIENTE"]).default("DACHSER"),
  filial: z.string().optional(),
  comentariosOperacao: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export const VoucherMasterForm = ({ onSuccess, onClose }: VoucherMasterFormProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VoucherSearchResult[]>([]);
  const [selectedVouchers, setSelectedVouchers] = useState<VoucherSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dadosExpanded, setDadosExpanded] = useState(false);
  const [faturaFiles, setFaturaFiles] = useState<File[]>([]);
  const [boletoFiles, setBoletoFiles] = useState<File[]>([]);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      moeda: "BRL",
      formaPagamento: "BOLETO",
      cobrancaEmNomeDe: "DACHSER",
    },
  });

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchVouchers(searchQuery);
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Update form when vouchers are selected
  useEffect(() => {
    if (selectedVouchers.length > 0) {
      const first = selectedVouchers[0];
      const totalValor = selectedVouchers.reduce((sum, v) => sum + (Number(v.valor) || 0), 0);
      const earliestVenc = selectedVouchers
        .filter(v => v.vencimento)
        .sort((a, b) => new Date(a.vencimento!).getTime() - new Date(b.vencimento!).getTime())[0];

      form.setValue("fornecedor", first.fornecedor || "");
      form.setValue("cnpjFornecedor", first.cnpj_fornecedor || "");
      form.setValue("filial", first.filial || "");
      form.setValue("valorTotal", totalValor.toFixed(2).replace(".", ","));
      form.setValue("moeda", first.moeda || "BRL");
      
      if (earliestVenc?.vencimento) {
        const dateStr = earliestVenc.vencimento.split('T')[0];
        const [year, month, day] = dateStr.split('-').map(Number);
        const vencDate = new Date(year, month - 1, day);
        form.setValue("vencimento", vencDate);
      }
    }
  }, [selectedVouchers]);

  const searchVouchers = async (query: string) => {
    try {
      setIsSearching(true);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "search_vouchers_for_master",
          search: query,
        },
      });

      if (error) throw error;

      // Filter out already selected vouchers
      const results = (data?.data || []).filter(
        (v: VoucherSearchResult) => !selectedVouchers.some(s => s.id === v.id)
      );
      
      setSearchResults(results);
      setShowDropdown(results.length > 0);
    } catch (error) {
      console.error("Error searching vouchers:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectVoucher = (voucher: VoucherSearchResult) => {
    setSelectedVouchers(prev => [...prev, voucher]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  const handleRemoveVoucher = (id: string) => {
    setSelectedVouchers(prev => prev.filter(v => v.id !== id));
  };

  const handleFaturaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFaturaFiles(prev => [...prev, ...Array.from(e.target.files!)]);
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

  const handleSubmit = async (values: FormValues) => {
    // Validations
    if (selectedVouchers.length < 2) {
      toast({
        title: "Mínimo 2 vouchers",
        description: "Selecione pelo menos 2 vouchers para consolidar",
        variant: "destructive",
      });
      return;
    }

    if (faturaFiles.length === 0) {
      toast({
        title: "Anexo obrigatório",
        description: "Anexe pelo menos uma Fatura/Demonstrativo",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
      const userData = storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };

      // Create master voucher
      const { data: masterResult, error: masterError } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "create_voucher_master",
          voucher_ids: selectedVouchers.map(v => v.id),
          fornecedor: values.fornecedor || null,
          cnpj_fornecedor: values.cnpjFornecedor || null,
          valor_total: values.valorTotal ? parseFloat(values.valorTotal.replace(",", ".")) : null,
          moeda: values.moeda,
          vencimento: values.vencimento?.toISOString() || null,
          forma_pagamento: values.formaPagamento,
          tipo_documento: values.tipoDocumento || null,
          cobranca_em_nome_de: values.cobrancaEmNomeDe,
          filial: values.filial || null,
          comentarios_operacao: values.comentariosOperacao || null,
          criado_por_user_id: userData.id?.toString(),
          criado_por_user_name: userData.username,
        },
      });

      if (masterError) throw masterError;
      if (!masterResult?.success) throw new Error(masterResult?.error || "Erro ao criar voucher master");

      const masterId = masterResult.masterId;
      const numeroSpo = masterResult.numeroSpo;

      // Upload fatura files
      for (const file of faturaFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${masterId}/${Date.now()}-fatura.${fileExt}`;

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

        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_anexo",
            voucher_id: masterId,
            tipo: "FATURA",
            file_name: file.name,
            file_url: publicUrl.publicUrl,
            file_size: file.size,
          },
        });
      }

      // Upload boleto files and extract barcode
      for (const file of boletoFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${masterId}/${Date.now()}-boleto.${fileExt}`;

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

        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_anexo",
            voucher_id: masterId,
            tipo: "BOLETO",
            file_name: file.name,
            file_url: publicUrl.publicUrl,
            file_size: file.size,
          },
        });

        // Automatic barcode extraction for boleto
        if (values.formaPagamento === "BOLETO") {
          try {
            const { data: extractionResult, error: extractionError } = await supabase.functions.invoke("extract-boleto-barcode", {
              body: { fileUrl: publicUrl.publicUrl }
            });

            if (!extractionError && extractionResult?.success && extractionResult?.linhaDigitavel) {
              await supabase.functions.invoke("mariadb-proxy", {
                body: {
                  action: "save_linha_digitavel",
                  voucher_id: masterId,
                  linha_digitavel: extractionResult.linhaDigitavel,
                },
              });
              console.log("Linha digitável extraída automaticamente:", extractionResult.linhaDigitavel);
            }
          } catch (extractError) {
            console.error("Erro na extração automática de código de barras:", extractError);
            // Don't block creation - user can extract manually later
          }
        }
      }

      toast({
        title: "Voucher Master criado!",
        description: `${numeroSpo} consolidando ${selectedVouchers.length} vouchers`,
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error creating voucher master:", error);
      toast({
        title: "Erro ao criar Voucher Master",
        description: error.message || "Ocorreu um erro ao criar o voucher master",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalValorSelecionado = selectedVouchers.reduce((sum, v) => sum + (Number(v.valor) || 0), 0);

  return (
    <Form {...form}>
      <div className="space-y-6">
        {/* Header info */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5">
          <Layers className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-purple-400">Consolidar Vouchers</p>
            <p className="text-sm text-muted-foreground">
              Selecione 2 ou mais vouchers para consolidar em um único Voucher Master que seguirá para a etapa Fiscal.
            </p>
          </div>
        </div>

        {/* Voucher Search */}
        <div className="space-y-3">
          <Label>Buscar Vouchers para Consolidar</Label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Digite o nº do voucher/SPO ou fornecedor..."
                className="pl-10 bg-background/50 border-border"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Dropdown Results */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                {searchResults.map((voucher) => (
                  <button
                    key={voucher.id}
                    type="button"
                    onClick={() => handleSelectVoucher(voucher)}
                    className="w-full px-4 py-3 text-left hover:bg-primary/10 flex items-center justify-between transition-colors"
                  >
                    <div>
                      <span className="font-mono font-medium">{voucher.numero_spo}</span>
                      {voucher.fornecedor && (
                        <span className="text-sm text-muted-foreground ml-2">- {voucher.fornecedor}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">
                        {voucher.moeda || 'BRL'} {Number(voucher.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {voucher.etapa_atual}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Vouchers */}
        {selectedVouchers.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Vouchers Selecionados ({selectedVouchers.length})</Label>
              <span className="text-sm font-medium text-primary">
                Total: {selectedVouchers[0]?.moeda || 'BRL'} {totalValorSelecionado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedVouchers.map((voucher) => (
                <Badge
                  key={voucher.id}
                  variant="secondary"
                  className="gap-2 py-2 px-3 bg-purple-500/10 text-purple-400 border-purple-500/30"
                >
                  <span className="font-mono">{voucher.numero_spo}</span>
                  <span className="text-xs opacity-75">
                    ({voucher.moeda || 'BRL'} {Number(voucher.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveVoucher(voucher.id)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible data section */}
        <Collapsible open={dadosExpanded} onOpenChange={setDadosExpanded}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between">
              <span>Editar Dados Consolidados</span>
              {dadosExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4 p-4 rounded-xl border border-border/30 bg-background/20">
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="valorTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Total</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background/50 border-border" />
                    </FormControl>
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
                  </FormItem>
                )}
              />
              <DateInputField
                control={form.control}
                name="vencimento"
                label="Vencimento"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="formaPagamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de Pagamento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 border-border">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BOLETO">Boleto</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                        <SelectItem value="DARF">DARF</SelectItem>
                        <SelectItem value="GPS">GPS</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <SelectTrigger className="bg-background/50 border-border">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DACHSER">Dachser</SelectItem>
                        <SelectItem value="CLIENTE">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="comentariosOperacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comentários</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Observações sobre a consolidação..."
                      className="bg-background/50 border-border"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CollapsibleContent>
        </Collapsible>

        {/* File Upload Areas */}
        <div className="space-y-4">
          {/* Fatura */}
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
                id="master-fatura-upload"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.xml"
              />
              <label htmlFor="master-fatura-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Clique para selecionar arquivos
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

          {/* Boleto */}
          <div>
            <Label className="text-sm font-medium">
              Boleto ou Instruções de Pagamento
            </Label>
            <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors bg-background/30">
              <input
                type="file"
                multiple
                onChange={handleBoletoChange}
                className="hidden"
                id="master-boleto-upload"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.xml"
              />
              <label htmlFor="master-boleto-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Clique para selecionar arquivos
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
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={form.handleSubmit(handleSubmit)}
            disabled={isSubmitting || selectedVouchers.length < 2}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" />
                Criar Voucher Master
              </>
            )}
          </Button>
        </div>
      </div>
    </Form>
  );
};
