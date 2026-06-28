import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ship, Package, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ImportMblDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface PreviewItem {
  container: string;
  mbl: string;
  shipping_line: string | null;
  consignee: string | null;
  eta: string | null;
  container_status: string | null;
  last_event: string | null;
}

type Step = "preview" | "importing" | "done";

export function ImportMblDialog({ open, onOpenChange, onSuccess }: ImportMblDialogProps) {
  const [step, setStep] = useState<Step>("preview");
  const [isFetching, setIsFetching] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; errors: number; error_details: string[] } | null>(null);

  const fetchPreview = async () => {
    setIsFetching(true);
    setPreviewItems([]);
    try {
      const res = await fetch('/api/demurrage/import-from-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);
      const data = await res.json();
      setPreviewItems(data.items || []);
    } catch (e) {
      toast.error("Erro ao buscar containers do tracking");
      console.error(e);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (open) {
      setStep("preview");
      setImportResult(null);
      fetchPreview();
    }
  }, [open]);

  const handleImport = async () => {
    setStep("importing");
    try {
      const res = await fetch('/api/demurrage/import-from-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: false }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);
      const data = await res.json();
      setImportResult(data.results);
      setStep("done");
      if (data.results.created > 0) {
        toast.success(`${data.results.created} container(s) importados com sucesso`);
        onSuccess?.();
      } else {
        toast.warning("Nenhum container foi importado");
      }
    } catch (e) {
      toast.error("Erro ao importar containers");
      console.error(e);
      setStep("preview");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[640px] bg-[#0a0a0a] border-[rgba(255,255,255,0.1)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#ffc800]">
            <Ship className="h-5 w-5" />
            Importar do Tracking
          </DialogTitle>
          <DialogDescription>
            Containers presentes na tela de tracking com armador elegível ainda não cadastrados em demurrage.
          </DialogDescription>
        </DialogHeader>

        {/* Preview / importing step */}
        {(step === "preview" || step === "importing") && (
          <div className="space-y-4">
            {isFetching ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Buscando containers no tracking…</span>
              </div>
            ) : previewItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="text-sm">Nenhum container novo encontrado no tracking.</p>
                <p className="text-xs">Todos os processos elegíveis já estão em demurrage.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#ffc800]" />
                    <span className="text-sm font-medium">
                      {previewItems.length} container{previewItems.length !== 1 ? 's' : ''} para importar
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchPreview}
                    disabled={isFetching || step === "importing"}
                    className="text-muted-foreground hover:text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Atualizar
                  </Button>
                </div>

                <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                  {previewItems.map((item, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-medium">{item.container}</span>
                        {item.shipping_line && (
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                            {item.shipping_line}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        <span>MBL: <span className="font-mono text-white/70">{item.mbl}</span></span>
                        {item.consignee && <span>Cliente: {item.consignee}</span>}
                        {item.eta && <span>ETA: {item.eta}</span>}
                        {item.container_status && <span>Status: {item.container_status}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Done step */}
        {step === "done" && importResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-400" />
                <p className="text-2xl font-bold text-green-400">{importResult.created}</p>
                <p className="text-xs text-muted-foreground">Importados</p>
              </div>
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                <p className="text-2xl font-bold text-red-400">{importResult.errors}</p>
                <p className="text-xs text-muted-foreground">Com erro</p>
              </div>
            </div>
            {importResult.error_details.length > 0 && (
              <div className="max-h-[150px] overflow-y-auto space-y-1">
                {importResult.error_details.map((e, i) => (
                  <p key={i} className="text-xs text-red-400 font-mono">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={isFetching || previewItems.length === 0}
                className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
              >
                <Ship className="h-4 w-4 mr-2" />
                Importar {previewItems.length > 0 ? `${previewItems.length} container${previewItems.length !== 1 ? 's' : ''}` : ''}
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button disabled className="bg-[#ffc800] text-black">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Importando…
            </Button>
          )}
          {step === "done" && (
            <Button onClick={handleClose} className="bg-[#ffc800] text-black hover:bg-[#e6b400]">
              Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
