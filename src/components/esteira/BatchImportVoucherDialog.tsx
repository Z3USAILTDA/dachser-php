import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseBatchSpreadsheet } from "@/utils/batchVoucherImport";
import { BatchImportPreviewTable } from "./BatchImportPreviewTable";

const EXPECTED_HEADERS = [
  "Processo", "Fornecedor", "Valor Solicitação", "Vencimento",
  "Forma Pagto", "Fatura", "Data fatura", "Histórico", "Quebra",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: number;
  onCreated: (batchId: string) => void;
}

export function BatchImportVoucherDialog({ open, onOpenChange, userId, onCreated }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const reset = () => {
    setStep("upload");
    setItems([]);
    setRawRows([]);
    setFileName("");
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const rows = await parseBatchSpreadsheet(file);
      setRawRows(rows);
      setFileName(file.name);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "preview_voucher_batch_import", userId, rows },
      });
      if (error || !data?.success) {
        toast({ title: "Falha ao validar planilha", description: data?.error || error?.message, variant: "destructive" });
        return;
      }
      setItems(data.items || []);
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Erro lendo planilha", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "create_voucher_batch_import",
          userId,
          rows: rawRows,
          file_name: fileName,
        },
      });
      if (error || !data?.success) {
        toast({ title: "Falha ao criar lote", description: data?.error || error?.message, variant: "destructive" });
        return;
      }
      toast({ title: `Lote criado: ${data.created} voucher(s)` });
      onCreated(data.batch_id);
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const validCount = items.filter((i) => i.status === "VALID").length;
  const errCount = items.filter((i) => i.status === "ERROR").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border-border/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar SPO em Lote
          </DialogTitle>
          <DialogDescription className="text-xs">
            Crie múltiplos vouchers/SPO a partir de uma planilha CSV ou XLSX.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col gap-5">
            <label
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="flex flex-col items-center justify-center gap-4 py-14 px-8 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition cursor-pointer"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Upload className="h-7 w-7" />
              </div>
              <div className="text-center space-y-1">
                <div className="text-base font-medium">Selecione sua planilha</div>
                <div className="text-xs text-muted-foreground">
                  Arraste e solte aqui ou clique no botão abaixo
                </div>
              </div>
              <Button
                type="button"
                onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                disabled={busy}
                className="mt-1"
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Selecionar arquivo (.csv / .xlsx)
              </Button>
            </label>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Cabeçalhos esperados
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EXPECTED_HEADERS.map((h) => (
                  <Badge key={h} variant="outline" className="font-normal">
                    {h}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card/50 p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Total
                </div>
                <div className="text-2xl font-semibold mt-1">{items.length}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Válidas
                </div>
                <div className="text-2xl font-semibold mt-1 text-emerald-400">{validCount}</div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <div className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Com erro
                </div>
                <div className="text-2xl font-semibold mt-1 text-red-400">{errCount}</div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-xl border border-border">
              <BatchImportPreviewTable items={items} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
              <Button variant="outline" onClick={reset} disabled={busy}>
                Voltar
              </Button>
              <Button onClick={confirm} disabled={busy || validCount === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Criar {validCount} voucher(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
