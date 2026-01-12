import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface UploadInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (invoiceData: InvoiceData) => void;
}

interface InvoiceData {
  invoice_number: string;
  carrier: string;
  total_usd: number;
  containers: { numero: string; days: number; cost: number }[];
  file_name: string;
}

const CARRIERS = [
  { value: "MSC", label: "MSC" },
  { value: "MAERSK", label: "Maersk" },
  { value: "HAPAG_LLOYD", label: "Hapag-Lloyd" },
  { value: "CMA_CGM", label: "CMA CGM" },
  { value: "ONE", label: "ONE" },
  { value: "EVERGREEN", label: "Evergreen" },
  { value: "COSCO", label: "COSCO" },
  { value: "HMM", label: "HMM" },
];

export function UploadInvoiceDialog({ open, onOpenChange, onSuccess }: UploadInvoiceDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<InvoiceData | null>(null);
  const [step, setStep] = useState<"upload" | "review">("upload");

  const handleClose = () => {
    setFile(null);
    setInvoiceNumber("");
    setCarrier("");
    setParseResult(null);
    setStep("upload");
    onOpenChange(false);
  };

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === "application/pdf" || droppedFile.name.endsWith(".xlsx"))) {
      setFile(droppedFile);
    } else {
      toast.error("Apenas arquivos PDF ou Excel são aceitos");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleParse = async () => {
    if (!file || !invoiceNumber || !carrier) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setIsLoading(true);
    try {
      // Simulate parsing - in production this would call an edge function
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock result
      const mockResult: InvoiceData = {
        invoice_number: invoiceNumber,
        carrier,
        total_usd: 15750.00,
        containers: [
          { numero: "MSCU1234567", days: 7, cost: 3500 },
          { numero: "MSCU2345678", days: 5, cost: 2500 },
          { numero: "MSCU3456789", days: 10, cost: 5000 },
          { numero: "MSCU4567890", days: 9, cost: 4750 },
        ],
        file_name: file.name,
      };

      setParseResult(mockResult);
      setStep("review");
      toast.success("Fatura processada com sucesso");
    } catch (error) {
      console.error("Parse error:", error);
      toast.error("Erro ao processar fatura");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (parseResult) {
      onSuccess?.(parseResult);
      handleClose();
      toast.success("Fatura importada com sucesso");
    }
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-[#0a0a0a] border-[rgba(255,255,255,0.1)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#ffc800]">
            <Upload className="h-5 w-5" />
            Cadastrar Fatura de Armador
          </DialogTitle>
          <DialogDescription>
            Faça upload de uma fatura de demurrage para associar aos containers
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            {/* File Upload */}
            <div
              onDrop={handleFileDrop}
              onDragOver={e => e.preventDefault()}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                file 
                  ? "border-green-500/50 bg-green-500/5" 
                  : "border-[rgba(255,255,255,0.2)] hover:border-[#ffc800]/50 hover:bg-[rgba(255,200,0,0.02)]"
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="h-10 w-10 text-green-400" />
                  <div className="text-left">
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                    className="ml-4 text-red-400 hover:text-red-300"
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-foreground mb-2">
                    Arraste um arquivo ou clique para selecionar
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Suporta PDF ou Excel (.xlsx)
                  </p>
                  <Input
                    type="file"
                    accept=".pdf,.xlsx"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="invoice-file"
                  />
                  <Label htmlFor="invoice-file">
                    <Button variant="outline" asChild>
                      <span>Selecionar Arquivo</span>
                    </Button>
                  </Label>
                </>
              )}
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Número da Fatura *</Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="INV-2024-001234"
                  className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier">Armador *</Label>
                <Select value={carrier} onValueChange={setCarrier}>
                  <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Invoice Summary */}
            <div className="p-4 rounded-lg bg-[rgba(255,200,0,0.05)] border border-[rgba(255,200,0,0.2)]">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Fatura</p>
                  <p className="font-mono font-medium text-foreground">{parseResult?.invoice_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Containers</p>
                  <p className="text-xl font-bold text-[#ffc800]">{parseResult?.containers.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold text-[#ffc800]">
                    {formatCurrency(parseResult?.total_usd || 0)}
                  </p>
                </div>
              </div>
            </div>

            {/* Container List */}
            <div className="max-h-[250px] overflow-y-auto space-y-2">
              <Label>Containers Identificados</Label>
              {parseResult?.containers.map((container, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="font-mono text-sm">{container.numero}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{container.days} dias</Badge>
                    <span className="font-medium text-[#ffc800]">
                      {formatCurrency(container.cost)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <span className="text-sm text-yellow-400">
                  Os valores serão associados aos containers existentes no sistema
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "upload" ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleParse}
                disabled={isLoading || !file || !invoiceNumber || !carrier}
                className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Processar Fatura
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Voltar
              </Button>
              <Button 
                onClick={handleConfirm}
                className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar Importação
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
