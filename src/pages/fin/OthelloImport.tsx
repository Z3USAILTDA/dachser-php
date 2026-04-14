import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Constants ───────────────────────────────────────────────────────────────

const REQUIRED_SHEETS = [
  "Othello Nacional-RLS",
  "Othello Interacional-RLS",
  "Base Totvs RM",
] as const;

const HEADERS_NACIONAL = [
  "ID Ref Object", "Settlement ID", "Branch", "Object Type", "Service Date",
  "Cost Center IV", "Deb Cred No", "Deb Cred Name", "Settlement Type",
  "Status Settl", "Status Interpreter", "Flag", "Revenue", "Revenue (Transit)",
  "∑ Revenue", "Faturado em", "Comentários",
];

const HEADERS_INTERACIONAL = [
  "ID Ref Object", "Branch", "Service Date", "Cost Center IV",
  "Deb Cred Name", "Flag", "Revenue", "Comentários",
];

const HEADERS_BASE_TOTVS = [
  "PROCESSO", "FATURADO EM", "FILIAL", "MODAL", "CLIENTE", "VALOR TOTAL FATURADO",
  "FATURADO NO OTHELLO POR (BASE ORIGINAL)", "FATURADO NO RM POR (BASE ORIGINAL)",
  "FATURADO NO OTHELLO POR", "FATURADO NO RM POR", "Região", "Divisão por Modal",
  "OTHELLO+RM?!", "Ana Mazzo", "Ana Mazzo (Participação)",
  "Integrador (Othello x RM)", "Integrador (Othello x RM) (Participação)",
  "Loreno Santos", "Loreno Santos (Participação)",
  "Mariana Melo", "Mariana Melo (Participação)",
  "Marina Marques", "Marina Marques (Participação)",
  "Vitoria Santos", "Vitoria Santos (Participação)",
  "Simone Santos", "Simone Santos (Participação)",
  "Gil Luan", "Gil Luan (Participação)",
  "Juliana Pansonato", "Juliana Pansonato (Participação)",
  "Igor Ferreira", "Igor Ferreira (Participação)",
  "Reinaldo Fascina", "Reinaldo Fascina (Participação)",
  "Thays Prado", "Thays Prado (Participação)",
  "Carlos Almeida", "Carlos Almeida (Participação)",
];

const RM_CODE_MAP: Record<string, string> = {
  anam: "Ana Mazzo",
  extalmeida: "Carlos Almeida",
  extbetti: "Victor Betti",
  extmelo: "Mariana Melo",
  extsantos: "Vitoria Santos",
  lnsantos: "Loreno Santos",
  marquem: "Marina Marques",
  mestre: "Integrador (Othello x RM)",
};

const REGION_MAP: Record<string, string> = {
  "101": "Região Sudeste", "104": "Região Sudeste", "105": "Região Sudeste", "201": "Região Sudeste",
  "121": "Região Sul", "220": "Região Sul",
};

const MODAL_MAP: Record<string, string> = {
  SI: "SI/SE/TCK/ASO", SE: "SI/SE/TCK/ASO", TCK: "SI/SE/TCK/ASO", ASO: "SI/SE/TCK/ASO",
  AI: "AI/AE", AE: "AI/AE",
};

const PEOPLE = [
  { key: "ana_mazzo", name: "Ana Mazzo" },
  { key: "integrador_othello_rm", name: "Integrador (Othello x RM)" },
  { key: "loreno_santos", name: "Loreno Santos" },
  { key: "mariana_melo", name: "Mariana Melo" },
  { key: "marina_marques", name: "Marina Marques" },
  { key: "vitoria_santos", name: "Vitoria Santos" },
  { key: "simone_santos", name: "Simone Santos" },
  { key: "gil_luan", name: "Gil Luan" },
  { key: "juliana_pansonato", name: "Juliana Pansonato" },
  { key: "igor_ferreira", name: "Igor Ferreira" },
  { key: "reinaldo_fascina", name: "Reinaldo Fascina" },
  { key: "thays_prado", name: "Thays Prado" },
  { key: "carlos_almeida", name: "Carlos Almeida" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanOthelloPorName(val: string | null | undefined): string | null {
  if (!val || typeof val !== "string") return null;
  let name = val
    .replace(/Resp\.?\s*:?\s*/gi, "")
    .replace(/Ms\.?\s*/gi, "")
    .replace(/Mr\.?\s*/gi, "")
    .replace(/-\s*Id\.?\s*Fiscal\s*:.*/gi, "")
    .trim();
  return name || null;
}

function mapRmCode(val: string | null | undefined): string | null {
  if (!val || typeof val !== "string") return null;
  const code = val.trim().toLowerCase();
  return RM_CODE_MAP[code] || null;
}

function calcRegiao(filial: number | null): string | null {
  if (filial == null) return null;
  return REGION_MAP[String(filial)] || null;
}

function calcDivisaoModal(modal: string | null): string | null {
  if (!modal) return null;
  return MODAL_MAP[modal.trim().toUpperCase()] || null;
}

function calcOthelloRm(othello: string | null, rm: string | null): string | null {
  if (othello && rm) return `${othello}+${rm}`;
  if (othello) return othello;
  if (rm) return rm;
  return null;
}

function calcPersonFields(othelloPor: string | null, rmPor: string | null) {
  const result: Record<string, any> = {};
  for (const p of PEOPLE) {
    const isOthello = othelloPor === p.name;
    const isRm = rmPor === p.name;
    if (isOthello && isRm) {
      result[p.key] = "Othello + RM";
      result[`${p.key}_participacao`] = 1;
    } else if (isOthello) {
      result[p.key] = "Somente Othello";
      result[`${p.key}_participacao`] = 0.5;
    } else if (isRm) {
      result[p.key] = "Somente RM";
      result[`${p.key}_participacao`] = 0.5;
    } else {
      result[p.key] = null;
      result[`${p.key}_participacao`] = 0;
    }
  }
  return result;
}

function trimVal(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return v;
}

function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toDateStr(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const parsed = new Date(v);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function validateHeaders(sheet: XLSX.WorkSheet, expected: string[], maxCols?: number): string | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const lastCol = maxCols ? Math.min(range.e.c, maxCols - 1) : range.e.c;
  const headers: string[] = [];
  for (let c = range.s.c; c <= lastCol; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    headers.push(cell ? String(cell.v).trim() : "");
  }
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      return `Coluna ${i + 1}: esperado "${expected[i]}", encontrado "${headers[i] || "(vazio)"}".`;
    }
  }
  return null;
}

function readSheetRows(sheet: XLSX.WorkSheet, maxCols?: number): any[][] {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const rows: any[][] = [];
  const lastCol = maxCols ? Math.min(range.e.c, maxCols - 1) : range.e.c;
  for (let r = 1; r <= range.e.r; r++) {
    const row: any[] = [];
    for (let c = range.s.c; c <= lastCol; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? cell.v : null);
    }
    rows.push(row);
  }
  return rows;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ImportResult {
  success: boolean;
  counts?: { base_totvs: number; nacional: number; interacional: number };
  error?: string;
}

export default function OthelloImport() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      const u = JSON.parse(stored);
      if (u.is_admin === 1 || u.is_admin === "1" || u.is_admin === true) {
        setIsAdmin(true);
        return;
      }
    }
    navigate("/dashboard");
  }, [navigate]);

  if (!isAdmin) return null;

  const handleImport = async () => {
    if (!file) return;
    if (!file.name.endsWith(".xlsx")) {
      toast.error("Selecione um arquivo .xlsx válido.");
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      setStep("Lendo arquivo...");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });

      // Validate sheets exist
      setStep("Validando abas...");
      for (const name of REQUIRED_SHEETS) {
        if (!wb.SheetNames.includes(name)) {
          throw new Error(`Aba obrigatória não encontrada: "${name}"`);
        }
      }

      // Validate headers
      setStep("Validando cabeçalhos...");
      const sheetNacional = wb.Sheets["Othello Nacional-RLS"];
      const sheetInteracional = wb.Sheets["Othello Interacional-RLS"];
      const sheetTotvs = wb.Sheets["Base Totvs RM"];

      let err = validateHeaders(sheetNacional, HEADERS_NACIONAL);
      if (err) throw new Error(`Cabeçalho inválido em Othello Nacional-RLS: ${err}`);
      err = validateHeaders(sheetInteracional, HEADERS_INTERACIONAL, 8);
      if (err) throw new Error(`Cabeçalho inválido em Othello Interacional-RLS: ${err}`);
      err = validateHeaders(sheetTotvs, HEADERS_BASE_TOTVS);
      if (err) throw new Error(`Cabeçalho inválido em Base Totvs RM: ${err}`);

      const fileName = file.name;

      // ── Process Base Totvs RM ──
      setStep("Processando Base Totvs RM...");
      const totvsRows = readSheetRows(sheetTotvs);
      const totvsIndex = new Map<string, string | null>();
      const totvsData: any[] = [];

      for (let i = 0; i < totvsRows.length; i++) {
        const r = totvsRows[i];
        const processo = toNum(r[0]);
        if (processo == null) continue; // skip empty rows

        const faturadoEm = toDateStr(r[1]);
        const filial = toNum(r[2]);
        const modal = trimVal(r[3]);
        const cliente = trimVal(r[4]);
        const valorTotal = toNum(r[5]);
        const othelloBaseOriginal = trimVal(r[6]);
        const rmBaseOriginal = trimVal(r[7]);

        // Calculated fields
        const faturadoNoOthelloPor = cleanOthelloPorName(othelloBaseOriginal as string);
        const faturadoNoRmPor = mapRmCode(rmBaseOriginal as string);
        const regiao = calcRegiao(filial as number);
        const divisaoModal = calcDivisaoModal(modal as string);
        const othelloRm = calcOthelloRm(faturadoNoOthelloPor, faturadoNoRmPor);
        const personFields = calcPersonFields(faturadoNoOthelloPor, faturadoNoRmPor);

        // Index for Nacional lookup
        if (processo != null) {
          totvsIndex.set(String(processo), faturadoEm);
        }

        totvsData.push({
          arquivo_origem: fileName,
          aba_origem: "Base Totvs RM",
          linha_excel: i + 2,
          processo,
          faturado_em: faturadoEm,
          filial,
          modal,
          cliente,
          valor_total_faturado: valorTotal,
          faturado_no_othello_por_base_original: othelloBaseOriginal,
          faturado_no_rm_por_base_original: rmBaseOriginal,
          faturado_no_othello_por: faturadoNoOthelloPor,
          faturado_no_rm_por: faturadoNoRmPor,
          regiao,
          divisao_por_modal: divisaoModal,
          othello_rm: othelloRm,
          ...personFields,
        });
      }

      // ── Process Othello Nacional-RLS ──
      setStep("Processando Othello Nacional-RLS...");
      const nacionalRows = readSheetRows(sheetNacional);
      const nacionalData: any[] = [];

      for (let i = 0; i < nacionalRows.length; i++) {
        const r = nacionalRows[i];
        const idRefObject = toNum(r[0]);
        const settlementId = trimVal(r[1]);
        if (idRefObject == null && settlementId == null) continue;

        // Calculate faturado_em by looking up in Base Totvs RM
        const idStr = idRefObject != null ? String(idRefObject) : null;
        let faturadoEm: string | null = null;
        let comentarios: string | null = null;
        if (idStr && totvsIndex.has(idStr)) {
          const fatDate = totvsIndex.get(idStr);
          if (fatDate) {
            faturadoEm = fatDate;
            comentarios = "Faturado";
          }
        }

        nacionalData.push({
          arquivo_origem: fileName,
          aba_origem: "Othello Nacional-RLS",
          linha_excel: i + 2,
          id_ref_object: idRefObject,
          settlement_id: settlementId,
          branch: trimVal(r[2]),
          object_type: trimVal(r[3]),
          service_date: toDateStr(r[4]),
          cost_center_iv: trimVal(r[5]),
          deb_cred_no: trimVal(r[6]),
          deb_cred_name: trimVal(r[7]),
          settlement_type: trimVal(r[8]),
          status_settl: trimVal(r[9]),
          status_interpreter: trimVal(r[10]),
          flag: trimVal(r[11]),
          revenue: toNum(r[12]),
          revenue_transit: toNum(r[13]),
          total_revenue: toNum(r[14]),
          faturado_em: faturadoEm,
          comentarios,
        });
      }

      // ── Process Othello Interacional-RLS (cols A-H only) ──
      setStep("Processando Othello Interacional-RLS...");
      const interacionalRows = readSheetRows(sheetInteracional, 8);
      const interacionalData: any[] = [];

      for (let i = 0; i < interacionalRows.length; i++) {
        const r = interacionalRows[i];
        const idRefObject = toNum(r[0]);
        if (idRefObject == null) continue;

        interacionalData.push({
          arquivo_origem: fileName,
          aba_origem: "Othello Interacional-RLS",
          linha_excel: i + 2,
          id_ref_object: idRefObject,
          branch: trimVal(r[1]),
          service_date: toDateStr(r[2]),
          cost_center_iv: trimVal(r[3]),
          deb_cred_name: trimVal(r[4]),
          flag: trimVal(r[5]),
          revenue: toNum(r[6]),
          comentarios: trimVal(r[7]),
        });
      }

      // ── Send to edge function ──
      setStep("Gravando no banco de dados...");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/fin-othello-import`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          arquivo_origem: fileName,
          nacional: nacionalData,
          interacional: interacionalData,
          base_totvs: totvsData,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao gravar no banco");

      setResult({ success: true, counts: data.counts });
      toast.success("Importação concluída com sucesso!");
    } catch (error: any) {
      console.error("Erro na importação:", error);
      setResult({ success: false, error: error.message });
      toast.error(error.message || "Erro na importação");
    } finally {
      setProcessing(false);
      setStep("");
    }
  };

  return (
    <PageLayout title="DACHSER" subtitle="Importar Othello/RM" backTo="/dashboard">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Upload Card */}
        <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-6 space-y-5">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-[#ffc800]" />
            <h2 className="text-lg font-semibold text-white">Importação Excel — Othello / Totvs RM</h2>
          </div>

          <p className="text-sm text-[#aaa]">
            Selecione um arquivo <strong>.xlsx</strong> com as 3 abas obrigatórias:
            <br />
            <span className="text-[#ffc800]">Othello Nacional-RLS</span>,{" "}
            <span className="text-[#ffc800]">Othello Interacional-RLS</span>,{" "}
            <span className="text-[#ffc800]">Base Totvs RM</span>
          </p>

          <div className="flex items-center gap-3">
            <label className="flex-1">
              <input
                type="file"
                accept=".xlsx"
                disabled={processing}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResult(null);
                }}
                className="block w-full text-sm text-[#aaa] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#ffc800]/10 file:text-[#ffc800] hover:file:bg-[#ffc800]/20 cursor-pointer disabled:opacity-50"
              />
            </label>
            <button
              onClick={handleImport}
              disabled={!file || processing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ffc800] text-black font-semibold text-sm hover:bg-[#ffc800]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {processing ? "Importando..." : "Importar"}
            </button>
          </div>

          {processing && step && (
            <div className="flex items-center gap-2 text-sm text-[#ffc800]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {step}
            </div>
          )}
        </div>

        {/* Result Card */}
        {result && (
          <div
            className={`rounded-xl border p-6 backdrop-blur-md ${
              result.success
                ? "border-green-500/30 bg-green-500/10"
                : "border-red-500/30 bg-red-500/10"
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              {result.success ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400" />
              )}
              <h3 className="text-lg font-semibold text-white">
                {result.success ? "Importação concluída com sucesso" : "Erro na importação"}
              </h3>
            </div>

            {result.success && result.counts && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-[#ccc] border-b border-white/10 pb-2">
                  <span>Othello Nacional-RLS</span>
                  <span className="text-green-400 font-medium">{result.counts.nacional} linhas</span>
                </div>
                <div className="flex justify-between text-[#ccc] border-b border-white/10 pb-2">
                  <span>Othello Interacional-RLS</span>
                  <span className="text-green-400 font-medium">{result.counts.interacional} linhas</span>
                </div>
                <div className="flex justify-between text-[#ccc]">
                  <span>Base Totvs RM</span>
                  <span className="text-green-400 font-medium">{result.counts.base_totvs} linhas</span>
                </div>
              </div>
            )}

            {!result.success && result.error && (
              <p className="text-sm text-red-300">{result.error}</p>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
