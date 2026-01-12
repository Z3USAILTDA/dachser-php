import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ship, Package, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImportMblDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
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
  { value: "ZIM", label: "ZIM" },
  { value: "YANG_MING", label: "Yang Ming" },
  { value: "OOCL", label: "OOCL" },
  { value: "WAN_HAI", label: "Wan Hai" },
  { value: "PIL", label: "PIL" },
];

interface ImportResult {
  mbl: string;
  success: boolean;
  containers: number;
  error?: string;
  suggestion?: string;
}

export function ImportMblDialog({ open, onOpenChange, onSuccess }: ImportMblDialogProps) {
  const [mblsText, setMblsText] = useState("");
  const [carrier, setCarrier] = useState("");
  const [cliente, setCliente] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [step, setStep] = useState<"input" | "results">("input");

  const handleClose = () => {
    setMblsText("");
    setCarrier("");
    setCliente("");
    setResults([]);
    setStep("input");
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (!mblsText.trim() || !carrier) {
      toast.error("Informe pelo menos um MBL e o armador");
      return;
    }

    const mbls = mblsText
      .split(/[\n,;]+/)
      .map(m => m.trim())
      .filter(m => m.length > 0);

    if (mbls.length === 0) {
      toast.error("Nenhum MBL válido encontrado");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("demurrage-import-jsoncargo", {
        body: {
          mbls,
          shipping_line: carrier,
          organization_id: "default",
          cliente: cliente || undefined,
        },
      });

      if (error) throw error;

      const importResults: ImportResult[] = [];

      // Process successful shipments
      if (data.shipments) {
        for (const shipment of data.shipments) {
          importResults.push({
            mbl: shipment.mbl,
            success: true,
            containers: shipment.containers?.length || 0,
          });
        }
      }

      // Process errors
      if (data.errors) {
        for (const err of data.errors) {
          importResults.push({
            mbl: err.mbl,
            success: false,
            containers: 0,
            error: err.error,
            suggestion: err.suggestion,
          });
        }
      }

      setResults(importResults);
      setStep("results");

      const successCount = importResults.filter(r => r.success).length;
      const totalContainers = importResults.reduce((sum, r) => sum + r.containers, 0);

      if (successCount > 0) {
        toast.success(`${successCount} MBL(s) importados com ${totalContainers} containers`);
        onSuccess?.();
      } else {
        toast.warning("Nenhum MBL foi importado com sucesso");
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Erro ao importar MBLs");
    } finally {
      setIsLoading(false);
    }
  };

  const detectedCarrier = (mbl: string): string | null => {
    const prefixes: Record<string, string> = {
      MEDU: "MSC", MSCB: "MSC", MSCU: "MSC",
      MAEU: "Maersk", MSKU: "Maersk",
      HLCU: "Hapag-Lloyd", HLXU: "Hapag-Lloyd",
      CMDU: "CMA CGM", APHU: "CMA CGM",
      ONEY: "ONE", ONEU: "ONE",
      COSU: "COSCO", CBHU: "COSCO",
      ZIMU: "ZIM",
    };
    const upper = mbl.toUpperCase();
    for (const [prefix, name] of Object.entries(prefixes)) {
      if (upper.startsWith(prefix)) return name;
    }
    return null;
  };

  const mblsPreview = mblsText
    .split(/[\n,;]+/)
    .map(m => m.trim())
    .filter(m => m.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-[#0a0a0a] border-[rgba(255,255,255,0.1)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#ffc800]">
            <Ship className="h-5 w-5" />
            Importar Containers por MBL
          </DialogTitle>
          <DialogDescription>
            Busque containers automaticamente através dos MBLs na API JSONCargo
          </DialogDescription>
        </DialogHeader>

        {step === "input" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="carrier">Armador *</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
                  <SelectValue placeholder="Selecione o armador" />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente (opcional)</Label>
              <Input
                id="cliente"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                placeholder="Nome do cliente para associar"
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mbls">MBLs (um por linha ou separados por vírgula)</Label>
              <Textarea
                id="mbls"
                value={mblsText}
                onChange={e => setMblsText(e.target.value)}
                placeholder="MEDU1234567890&#10;HLCU9876543210&#10;MAEU5555555555"
                rows={6}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] font-mono text-sm"
              />
            </div>

            {mblsPreview.length > 0 && (
              <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-muted-foreground">
                    {mblsPreview.length} MBL(s) detectados
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mblsPreview.slice(0, 10).map((mbl, i) => {
                    const detected = detectedCarrier(mbl);
                    return (
                      <Badge key={i} variant="outline" className="font-mono text-xs">
                        {mbl}
                        {detected && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({detected})
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                  {mblsPreview.length > 10 && (
                    <Badge variant="secondary">+{mblsPreview.length - 10}</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-400" />
                <p className="text-2xl font-bold text-green-400">
                  {results.filter(r => r.success).length}
                </p>
                <p className="text-xs text-muted-foreground">Importados</p>
              </div>
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                <p className="text-2xl font-bold text-red-400">
                  {results.filter(r => !r.success).length}
                </p>
                <p className="text-xs text-muted-foreground">Com erro</p>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {results.map((result, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${
                    result.success
                      ? "bg-green-500/5 border-green-500/20"
                      : "bg-red-500/5 border-red-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      )}
                      <span className="font-mono text-sm">{result.mbl}</span>
                    </div>
                    {result.success && (
                      <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                        <Package className="h-3 w-3 mr-1" />
                        {result.containers} containers
                      </Badge>
                    )}
                  </div>
                  {result.error && (
                    <p className="text-xs text-red-400 mt-1">{result.error}</p>
                  )}
                  {result.suggestion && (
                    <p className="text-xs text-yellow-400 mt-1">💡 {result.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "input" ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={isLoading || !carrier || mblsPreview.length === 0}
                className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Ship className="h-4 w-4 mr-2" />
                    Importar {mblsPreview.length} MBL(s)
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("input")}>
                Nova Importação
              </Button>
              <Button onClick={handleClose} className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
                Concluir
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
