import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useCreateDemurrageRate } from "@/hooks/useDemurrageData";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ParsedRate {
  armador: string;
  container_type: string;
  free_time_days: number;
  period_type: string;
  period_start_day: number;
  period_end_day: number | null;
  rate_usd: number;
  valid: boolean;
  error?: string;
}

interface ImportRatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const PERIOD_MAP: Record<string, string> = {
  '1': 'first_period',
  '2': 'second_period',
  '3': 'third_period',
};

export function ImportRatesDialog({ open, onOpenChange, onSuccess }: ImportRatesDialogProps) {
  const [parsedRates, setParsedRates] = useState<ParsedRate[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"upload" | "preview">("upload");

  const createRate = useCreateDemurrageRate();

  const validRates = useMemo(() => parsedRates.filter(r => r.valid), [parsedRates]);
  const invalidRates = useMemo(() => parsedRates.filter(r => !r.valid), [parsedRates]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (rows.length < 2) {
          toast.error("Planilha vazia ou sem dados");
          return;
        }

        const headers = (rows[0] || []).map((h: any) => String(h || "").trim().toLowerCase());
        
        // Find column indices with flexible matching
        const findCol = (aliases: string[]) => headers.findIndex(h => aliases.some(a => h.includes(a)));
        
        const colArmador = findCol(["armador", "prestador", "carrier", "shipping line"]);
        const colContainer = findCol(["tipo", "container", "equip"]);
        const colFreeTime = findCol(["free time", "freetime", "ft"]);
        const colPeriodo = findCol(["periodo", "period"]);
        const colDiaInicio = findCol(["dia inicio", "dia ini", "start day", "de"]);
        const colDiaFim = findCol(["dia fim", "end day", "ate", "até"]);
        const colValor = findCol(["valor", "rate", "usd", "taxa"]);

        const rates: ParsedRate[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const armador = colArmador >= 0 ? String(row[colArmador] || "").trim().toUpperCase() : "";
          const containerType = colContainer >= 0 ? String(row[colContainer] || "").trim().toUpperCase() : "";
          const freeTimeDays = colFreeTime >= 0 ? parseInt(String(row[colFreeTime] || "0")) : 0;
          const periodoRaw = colPeriodo >= 0 ? String(row[colPeriodo] || "1").trim() : "1";
          const periodType = PERIOD_MAP[periodoRaw] || "first_period";
          const diaInicio = colDiaInicio >= 0 ? parseInt(String(row[colDiaInicio] || "0")) : 0;
          const diaFim = colDiaFim >= 0 ? parseInt(String(row[colDiaFim] || "0")) || null : null;
          const rateUsd = colValor >= 0 ? parseFloat(String(row[colValor] || "0")) : 0;

          let valid = true;
          let error: string | undefined;

          if (!armador) { valid = false; error = "Armador vazio"; }
          else if (!containerType) { valid = false; error = "Tipo container vazio"; }
          else if (freeTimeDays < 0) { valid = false; error = "Free time inválido"; }
          else if (rateUsd <= 0) { valid = false; error = "Valor inválido"; }
          else if (diaInicio <= 0) { valid = false; error = "Dia início inválido"; }

          rates.push({
            armador,
            container_type: containerType,
            free_time_days: freeTimeDays,
            period_type: periodType,
            period_start_day: diaInicio,
            period_end_day: diaFim,
            rate_usd: rateUsd,
            valid,
            error,
          });
        }

        setParsedRates(rates);
        setStep("preview");
      } catch (err) {
        toast.error("Erro ao ler planilha");
        console.error(err);
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleImport = async () => {
    if (validRates.length === 0) return;
    setImporting(true);

    let success = 0;
    let errors = 0;

    // Batch in groups of 15
    const batchSize = 15;
    for (let i = 0; i < validRates.length; i += batchSize) {
      const batch = validRates.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (rate) => {
          try {
            await createRate.mutateAsync({
              armador: rate.armador,
              container_type: rate.container_type,
              free_time_days: rate.free_time_days,
              rate_usd: rate.rate_usd,
              period_type: rate.period_type,
              period_start_day: rate.period_start_day,
              period_end_day: rate.period_end_day || undefined,
            });
            success++;
          } catch {
            errors++;
          }
        })
      );
      if (i + batchSize < validRates.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setImporting(false);
    toast.success(`${success} tarifa(s) importada(s)${errors > 0 ? `, ${errors} erro(s)` : ""}`);
    onSuccess?.();
    handleReset();
    onOpenChange(false);
  };

  const handleReset = () => {
    setParsedRates([]);
    setFileName(null);
    setStep("upload");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileSpreadsheet className="h-5 w-5 text-[#ffc800]" />
            Importar Tarifas via Excel
          </DialogTitle>
          <DialogDescription>
            Colunas esperadas: Armador, Tipo Container, Free Time, Período, Dia Início, Dia Fim, Valor USD
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="py-8">
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-[rgba(255,255,255,0.2)] rounded-lg cursor-pointer hover:border-[#ffc800]/50 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <span className="text-sm text-muted-foreground">Clique para selecionar arquivo .xlsx</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validRates.length} válidas
                </Badge>
                {invalidRates.length > 0 && (
                  <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {invalidRates.length} inválidas
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{fileName}</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(255,255,255,0.1)]">
                    <TableHead>Armador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-center">FT</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-center">Dias</TableHead>
                    <TableHead className="text-right">USD/dia</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRates.map((rate, idx) => (
                    <TableRow key={idx} className={`border-[rgba(255,255,255,0.1)] ${!rate.valid ? 'opacity-60' : ''}`}>
                      <TableCell className="font-medium">{rate.armador || '-'}</TableCell>
                      <TableCell className="font-mono">{rate.container_type || '-'}</TableCell>
                      <TableCell className="text-center">{rate.free_time_days}d</TableCell>
                      <TableCell>{rate.period_type.replace('_', ' ')}</TableCell>
                      <TableCell className="text-center">{rate.period_start_day}{rate.period_end_day ? `-${rate.period_end_day}` : '+'}</TableCell>
                      <TableCell className="text-right text-[#ffc800]">${rate.rate_usd}</TableCell>
                      <TableCell>
                        {rate.valid ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">OK</Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">{rate.error}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={handleReset} className="bg-transparent border-[rgba(255,255,255,0.2)]">
                Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || validRates.length === 0}
                className="bg-[#ffc800] text-black hover:bg-[#e6b400]"
              >
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Importar {validRates.length} Tarifa(s)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
