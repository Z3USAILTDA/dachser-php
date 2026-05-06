import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseBatchSpreadsheet } from "@/utils/batchVoucherImport";
import { BatchImportPreviewTable } from "./BatchImportPreviewTable";

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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar SPO em Lote</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 border border-dashed border-white/15 rounded-lg">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Upload className="h-10 w-10 text-muted-foreground" />
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Selecionar planilha (.csv/.xlsx)
            </Button>
            <p className="text-xs text-muted-foreground">
              Cabeçalhos: Processo, Fornecedor, Valor Solicitação, Vencimento, Forma Pagto, Fatura, Data fatura, Histórico, Quebra...
            </p>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1">
            <div className="text-sm">
              {items.length} linhas — <span className="text-emerald-400">{validCount} válidas</span>
              {" • "}
              <span className="text-red-400">{errCount} com erro</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <BatchImportPreviewTable items={items} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
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
