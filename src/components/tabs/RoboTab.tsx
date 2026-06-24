import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Bot, Upload, CheckCircle2, XCircle, AlertCircle, FileText, Search, Edit2, X } from "lucide-react";

import { UploadZone } from "@/components/maritimo/UploadZone";

interface FileMatch {
  file: File;
  fileName: string;
  numeroSPO: string | null;
  voucherId: string | null;
  status: "identifying" | "pending" | "processing" | "success" | "error";
  error?: string;
  manualSpoInput?: string;
  isEditingSpo?: boolean;
  masterName?: string;
  childSpo?: string;
  isMaster?: boolean;
  matchedViaChild?: boolean;
  etapaAtual?: string;
}

export function RoboTab() {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileMatch[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [identifying, setIdentifying] = useState(false);
  const [identifyProgress, setIdentifyProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Extração de candidatos SPO/ND a partir do NOME DO ARQUIVO (client-side).
  // Porta da lógica de supabase/functions/parse-comprovante-pdf (filename-only,
  // regra mem://vouchers/comprovante-robot-matching-rules). Elimina upload do
  // PDF em base64 + round-trip à edge function de parse (ganho de 3–6s/arquivo).
  // ─────────────────────────────────────────────────────────────────────────
  const isPlausibleDate = (s: string) =>
    /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})$/.test(s);

  const extractCandidatesFromFilename = (
    fileName: string
  ): { numeroSPO: string | null; numeroND: string | null; candidatosSPO: string[]; candidatosND: string[] } => {
    const nameNoExt = fileName.replace(/\.[^/.]+$/, '');
    const spoScores = new Map<string, number>();
    const ndScores = new Map<string, number>();
    const add = (map: Map<string, number>, v: string | null | undefined, score: number) => {
      if (!v) return;
      const val = String(v).trim();
      if (!val) return;
      if (!/^\d+$/.test(val) && !/^\d{2,4}-\d{4,13}$/.test(val)) return;
      const prev = map.get(val) ?? 0;
      if (score > prev) map.set(val, score);
    };

    // BASE: substrings numéricas 5–13 dígitos (score 20)
    for (const m of nameNoExt.matchAll(/(?<![0-9])(\d{5,13})(?![0-9])/g)) {
      const n = m[1];
      if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})$/.test(n)) continue;
      if (/^(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(n)) continue;
      add(spoScores, n, 20);
      add(ndScores, n, 20);
    }

    // Pure number curto
    const pure = nameNoExt.match(/^(\d+)$/);
    if (pure && pure[1].length <= 13) {
      add(spoScores, pure[1], 85);
      add(ndScores, pure[1], 85);
    }

    // SPO Remessa: "101-286102D26122025.35"
    for (const m of fileName.matchAll(/(\d{3})-(\d{6})[A-Z]\d{8}\.\d{1,2}/gi)) {
      add(spoScores, `${m[1]}-${m[2]}`, 102);
      add(spoScores, m[2], 100);
    }

    // SPO Manual: "101-286105"
    for (const m of fileName.matchAll(/(\d{3})-(\d{5,7})(?:\.|$|[^0-9])/g)) {
      add(spoScores, `${m[1]}-${m[2]}`, 97);
      add(spoScores, m[2], 95);
    }

    // Voucher Remessa: "<SPO/ND><DDMMYYYY>[sufixo].<seq>"
    const vrFull = nameNoExt.match(/^(\d{18,22})\.(\d{1,3})$/);
    if (vrFull) {
      const digits = vrFull[1];
      for (const ndLen of [13, 12, 11, 10]) {
        for (const extra of [0, 1, 2]) {
          if (digits.length - ndLen - 8 !== extra) continue;
          const cand = digits.slice(0, ndLen);
          const date = digits.slice(ndLen, ndLen + 8);
          if (cand.startsWith('20') && isPlausibleDate(date)) {
            const score = 95 + ndLen - extra;
            add(ndScores, cand, score);
            add(spoScores, cand, score);
          }
        }
      }
    }

    // Fallback posicional em corridas longas
    const longRuns = nameNoExt.match(/\d{15,}/g) || [];
    for (const run of longRuns) {
      for (let i = 10; i + 8 <= run.length && i <= 13; i++) {
        const date = run.slice(i, i + 8);
        if (!isPlausibleDate(date)) continue;
        const prefix = run.slice(0, i);
        if (!prefix.startsWith('20')) continue;
        add(ndScores, prefix, 90);
        add(spoScores, prefix, 90);
      }
    }

    // Voucher Manual: "OT 433-20251877370"
    for (const m of fileName.matchAll(/(?:OT\s*)?(\d{3})-(\d{10,13})/gi)) {
      add(ndScores, m[2], 90);
    }

    // SPO Manual + sufixo numérico livre: "105-29290509876206.pdf"
    for (const m of fileName.matchAll(/(?<![0-9])(\d{3})-(\d{11,})(?![0-9])/g)) {
      const filial = m[1];
      const tail = m[2];
      for (const len of [6, 7, 5]) {
        if (tail.length <= len) continue;
        const spo = tail.slice(0, len);
        const score = len === 6 ? 96 : (len === 7 ? 92 : 88);
        add(spoScores, `${filial}-${spo}`, score);
        add(spoScores, spo, score - 2);
      }
    }

    // SPO explícito
    for (const pat of [/SPO[-_\s]*(\d{5,7})/gi, /comprovante[-_\s]*(\d{5,7})/gi, /spo\s*n[°ºo]?\s*(\d{5,7})/gi]) {
      for (const m of fileName.matchAll(pat)) add(spoScores, m[1], 85);
    }

    // Genérico 6–7 dígitos
    for (const m of nameNoExt.matchAll(/(?<![0-9])(\d{6,7})(?![0-9])/g)) {
      const n = m[1];
      if (/^20\d{4,5}$/.test(n)) continue;
      if (/^\d{2}(0[1-9]|1[0-2])(20\d{2})$/.test(n)) continue;
      add(spoScores, n, 60);
      add(ndScores, n, 60);
    }

    // ND genérico 20XXXXXXXX
    for (const m of nameNoExt.matchAll(/(?<![0-9])(20\d{8,11})(?![0-9])/g)) {
      add(ndScores, m[1], 55);
    }

    // Genérico 5 dígitos
    for (const m of nameNoExt.matchAll(/(?<![0-9])(\d{5})(?![0-9])/g)) {
      add(spoScores, m[1], 40);
      add(ndScores, m[1], 40);
    }

    const sortedSPO = [...spoScores.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    const sortedND = [...ndScores.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    return {
      numeroSPO: sortedSPO[0] ?? null,
      numeroND: sortedND[0] ?? null,
      candidatosSPO: sortedSPO,
      candidatosND: sortedND,
    };
  };


  // Normaliza um SPO/ND extraindo apenas o prefixo antes do espaço (ignora " DIM-BY", " SAN", etc.)
  const normalizeKey = (v: any): string => String(v ?? '').trim().split(/\s+/)[0].toUpperCase();

  // Valida match exato por identidade: o número testado precisa bater com numero_spo OU id_rm
  // (após normalização). Defesa em profundidade caso fallbacks frouxos sejam reintroduzidos no SQL.
  const isIdentityMatch = (chosen: any, queried: string): boolean => {
    const q = normalizeKey(queried);
    if (!q) return false;
    if (normalizeKey(chosen?.numero_spo) === q) return true;
    if (normalizeKey(chosen?.id_rm) === q) return true;
    if (normalizeKey(chosen?.processo_id) === q) return true;
    if (normalizeKey(chosen?.child_spo) === q) return true;
    return false;
  };

  const pickVoucher = (vouchers: any[], queried?: string) => {
    if (!vouchers || vouchers.length === 0) return null;
    // Quando há um valor consultado, exigir identidade exata (filtra match colateral)
    const pool = queried
      ? vouchers.filter((v: any) => isIdentityMatch(v, queried))
      : vouchers;
    if (pool.length === 0) return null;
    return (
      pool.find((v: any) => v.etapa_atual === 'ROBO' && v.is_master) ||
      pool.find((v: any) => v.etapa_atual === 'ROBO') ||
      pool.find((v: any) => v.is_master) ||
      pool[0]
    );
  };

  const buildMatch = (chosen: any) => ({
    id: chosen.id,
    isMaster: !!chosen.is_master,
    matchedViaChild: !!chosen.matched_via_child,
    masterName: (chosen.is_master || chosen.matched_via_child)
      ? (chosen.nome_master || chosen.numero_spo)
      : undefined,
    childSpo: chosen.child_spo,
    etapaAtual: chosen.etapa_atual as string | undefined,
  });

  const searchVoucherBySPO = async (spo: string): Promise<{ id: string; masterName?: string; childSpo?: string; isMaster?: boolean; matchedViaChild?: boolean; etapaAtual?: string } | null> => {
    try {
      const res = await fetch(`/api/fin/vouchers/find-by-spo?spo=${encodeURIComponent(spo)}`);
      const data = await res.json();
      if (data?.vouchers?.length > 0) {
        const chosen = pickVoucher(data.vouchers, spo);
        if (chosen) return buildMatch(chosen);
      }
    } catch (e) {
      console.error('Error fetching voucher by SPO:', e);
    }
    return null;
  };

  const searchVoucherByND = async (nd: string): Promise<{ id: string; masterName?: string; childSpo?: string; isMaster?: boolean; matchedViaChild?: boolean; etapaAtual?: string } | null> => {
    try {
      const res = await fetch(`/api/fin/vouchers/find-by-nd?nd=${encodeURIComponent(nd)}`);
      const data = await res.json();
      if (data?.vouchers?.length > 0) {
        const chosen = pickVoucher(data.vouchers, nd);
        if (chosen) return buildMatch(chosen);
      }
    } catch (e) {
      console.error('Error fetching voucher by ND:', e);
    }
    return null;
  };

  // Unified search: tries SPO first, then ND as fallback
  const searchVoucher = async (numero: string): Promise<{ id: string; masterName?: string; childSpo?: string; isMaster?: boolean; matchedViaChild?: boolean; etapaAtual?: string } | null> => {
    let result = await searchVoucherBySPO(numero);
    if (result) return result;
    result = await searchVoucherByND(numero);
    return result;
  };

  // Lookup batch: 1 round-trip por arquivo, tentando todos os candidatos no servidor.
  const searchVoucherMulti = async (
    extracted: { numeroSPO: string | null; numeroND: string | null; candidatosSPO: string[]; candidatosND: string[] }
  ): Promise<{ match: { id: string; masterName?: string; childSpo?: string; isMaster?: boolean; matchedViaChild?: boolean; etapaAtual?: string } | null; matchedValue: string | null }> => {
    const MAX = 6;
    try {
      const res = await fetch('/api/fin/vouchers/find-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spoPrimary: extracted.numeroSPO || undefined,
          ndPrimary: extracted.numeroND || undefined,
          spoCandidates: extracted.candidatosSPO.slice(0, MAX),
          ndCandidates: extracted.candidatosND.slice(0, MAX),
        }),
      });
      const data = await res.json();
      if (data?.voucher) {
        const matchedCandidate: string | undefined = data.matchedCandidate;
        const matchedValue = matchedCandidate ? matchedCandidate.replace(/^(SPO|ND):/, '') : null;
        const chosen = pickVoucher([data.voucher], matchedValue || undefined);
        if (chosen) return { match: buildMatch(chosen), matchedValue };
      }
    } catch (e) {
      console.error('Error fetching voucher (multi):', e);
    }
    return { match: null, matchedValue: null };
  };

  const handleFilesSelected = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    const CONCURRENCY = 10;

    // Insere imediatamente placeholders com status "identifying" para o usuário
    // ver a lista crescendo no instante do drop, em vez de tela imóvel.
    const baseIndex = files.length;
    const placeholders: FileMatch[] = selectedFiles.map((file) => ({
      file,
      fileName: file.name,
      numeroSPO: null,
      voucherId: null,
      status: "identifying" as const,
      manualSpoInput: "",
      isEditingSpo: false,
    }));
    setFiles((prev) => [...prev, ...placeholders]);

    setIdentifying(true);
    setIdentifyProgress({ done: 0, total: selectedFiles.length });

    toast({
      title: "Arquivos carregados",
      description: `Identificando ${selectedFiles.length} arquivo(s)...`,
    });

    const processOne = async (file: File, slot: number): Promise<void> => {
      const extracted = extractCandidatesFromFilename(file.name);
      const { match, matchedValue } = await searchVoucherMulti(extracted);

      const displayNumero =
        matchedValue || extracted.numeroND || extracted.numeroSPO || null;

      const result: FileMatch = {
        file,
        fileName: file.name,
        numeroSPO: displayNumero,
        voucherId: match?.id || null,
        masterName: match?.masterName,
        childSpo: match?.childSpo,
        isMaster: match?.isMaster,
        matchedViaChild: match?.matchedViaChild,
        etapaAtual: match?.etapaAtual,
        status: "pending",
        manualSpoInput: "",
        isEditingSpo: !displayNumero,
      };

      setFiles((prev) => prev.map((f, i) => (i === slot ? result : f)));
      setIdentifyProgress((p) => ({ ...p, done: p.done + 1 }));
    };

    try {
      // Worker pool: N workers consomem uma fila — sem barreiras de lote.
      let cursor = 0;
      const next = () => (cursor < selectedFiles.length ? cursor++ : -1);
      const worker = async () => {
        let i: number;
        while ((i = next()) !== -1) {
          await processOne(selectedFiles[i], baseIndex + i);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selectedFiles.length) }, worker));
    } finally {
      setIdentifying(false);
    }
  };


  const handleManualSpoSearch = async (index: number) => {
    const file = files[index];
    if (!file.manualSpoInput?.trim()) {
      toast({
        title: "Informe o número",
        description: "Digite o SPO ou ND para buscar o voucher",
        variant: "destructive",
      });
      return;
    }

    const match = await searchVoucher(file.manualSpoInput.trim());

    setFiles((prev) =>
      prev.map((f, i) =>
        i === index
          ? {
              ...f,
              numeroSPO: file.manualSpoInput?.trim() || null,
              voucherId: match?.id || null,
              masterName: match?.masterName,
              childSpo: match?.childSpo,
              isMaster: match?.isMaster,
              matchedViaChild: match?.matchedViaChild,
              etapaAtual: match?.etapaAtual,
              isEditingSpo: false,
            }
          : f
      )
    );

    if (match) {
      const isMasterDirect = match.isMaster && !match.matchedViaChild;
      const isViaChild = !!match.matchedViaChild;
      const etapaSuffix = match.etapaAtual && match.etapaAtual !== 'ROBO'
        ? ` (etapa atual: ${match.etapaAtual})`
        : '';
      toast({
        title: (isMasterDirect || isViaChild) ? "Master encontrado" : "Voucher encontrado",
        description: (isViaChild
          ? `Vinculado ao Master "${match.masterName}" via filho SPO ${match.childSpo}`
          : isMasterDirect
            ? `Master "${match.masterName}" vinculado com sucesso`
            : `SPO ${file.manualSpoInput} vinculado com sucesso`) + etapaSuffix,
      });
    } else {
      toast({
        title: "Voucher não encontrado",
        description: `Nenhum voucher localizado para ${file.manualSpoInput}`,
        variant: "destructive",
      });
    }
  };

  const handleUpdateManualSpo = (index: number, value: string) => {
    setFiles((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, manualSpoInput: value } : f
      )
    );
  };

  const handleToggleEditSpo = (index: number) => {
    setFiles((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, isEditingSpo: !f.isEditingSpo } : f
      )
    );
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    setProcessing(true);
    setProgress(0);

    const storedUser = localStorage.getItem('user');
    const currentUser = storedUser ? JSON.parse(storedUser) : null;
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;

    const processOne = async (fileMatch: FileMatch) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.fileName === fileMatch.fileName
            ? { ...f, status: "processing" }
            : f
        )
      );

      try {
        if (!fileMatch.voucherId) {
          throw new Error("Voucher não encontrado");
        }

        const wasConcluded = fileMatch.etapaAtual === 'CONCLUIDO';

        const file_base64 = await fileToBase64(fileMatch.file);

        const anexoRes = await fetch('/api/fin/vouchers/anexos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voucher_id: fileMatch.voucherId, tipo: 'COMPROVANTE', file_name: fileMatch.file.name, file_size: fileMatch.file.size, mime_type: fileMatch.file.type || 'application/octet-stream', file_base64 }),
        });
        if (!anexoRes.ok) throw new Error(`Erro ao salvar anexo: ${await anexoRes.text()}`);

        // Update voucher: se já estava CONCLUIDO, apenas marca o comprovante como validado;
        // caso contrário, segue o fluxo normal do robô (move para CONCLUIDO).
        const updates = wasConcluded
          ? { status_comprovante: 'VALIDADO' }
          : {
              status_comprovante: 'VALIDADO',
              etapa_atual: 'CONCLUIDO',
              status_baixa: 'BAIXA_SOLICITADA',
              status_financeiro: 'CONCLUIDO',
            };

        // Disparar update + logs em paralelo (independentes entre si)
        const userName = currentUser?.email || currentUser?.nome || 'Sistema';
        const userId = currentUser?.id || null;
        const tasks: Promise<any>[] = [
          fetch(`/api/fin/vouchers/${encodeURIComponent(fileMatch.voucherId!)}/esteira`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          }),
          fetch('/api/fin/vouchers/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voucher_id: fileMatch.voucherId, user_id: userId, user_name: userName, acao: 'COMPROVANTE_ANEXADO', detalhe: `Comprovante ${fileMatch.file.name} anexado automaticamente pelo robô${fileMatch.childSpo ? ` (filho SPO ${fileMatch.childSpo})` : ''}${wasConcluded ? ' (revínculo em voucher já concluído)' : ''}` }),
          }),
        ];

        if (!wasConcluded) {
          tasks.push(
            fetch('/api/fin/vouchers/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ voucher_id: fileMatch.voucherId, user_id: userId, user_name: userName, acao: 'CONCLUIDO_ROBO', detalhe: 'Voucher concluído automaticamente após processamento do comprovante' }),
            })
          );
        }

        await Promise.all(tasks);

        successCount++;
        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === fileMatch.fileName
              ? { ...f, status: "success" }
              : f
          )
        );
      } catch (error: any) {
        console.error("Erro ao processar arquivo:", error);

        errorCount++;
        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === fileMatch.fileName
              ? { ...f, status: "error", error: error.message }
              : f
          )
        );
      }

      processed++;
      setProgress((processed / files.length) * 100);
    };

    // Worker pool: até 8 arquivos processados concorrentemente
    const CONCURRENCY = 8;
    let cursor = 0;
    const next = () => (cursor < files.length ? cursor++ : -1);
    const worker = async () => {
      let i: number;
      while ((i = next()) !== -1) {
        await processOne(files[i]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker)
    );

    setProcessing(false);

    toast({
      title: "Processamento concluído",
      description: `${successCount} arquivo(s) enviado(s) com sucesso. ${errorCount} erro(s).`,
      variant: errorCount > 0 ? "destructive" : "default",
    });
  };


  const getStatusIcon = (status: FileMatch["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "processing":
        return <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (fileMatch: FileMatch) => {
    if (fileMatch.status === "identifying") {
      return (
        <Badge variant="outline" className="border-primary/40 text-primary gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Analisando nome do arquivo…
        </Badge>
      );
    }
    if (!fileMatch.numeroSPO) {
      return <Badge className="bg-destructive text-destructive-foreground">Voucher não identificado</Badge>;
    }
    if (!fileMatch.voucherId) {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="secondary">Voucher não encontrado</Badge>
          <Badge variant="outline" className="font-mono">{fileMatch.numeroSPO}</Badge>
        </div>
      );
    }
    const etapaChip = fileMatch.etapaAtual && fileMatch.etapaAtual !== 'ROBO' ? (
      <Badge variant="outline" className="font-mono text-[10px]">{fileMatch.etapaAtual}</Badge>
    ) : null;
    if (fileMatch.isMaster || fileMatch.matchedViaChild) {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="info">Master</Badge>
          <Badge className="bg-primary text-primary-foreground">{fileMatch.masterName}</Badge>
          {etapaChip}
          {fileMatch.matchedViaChild && fileMatch.childSpo && (
            <span className="text-xs text-muted-foreground">via filho {fileMatch.childSpo}</span>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Badge className="bg-primary text-primary-foreground">{fileMatch.numeroSPO}</Badge>
        {etapaChip}
      </div>
    );
  };

  const canProcess = files.length > 0 && !identifying && files.some((f) => f.voucherId && f.status === "pending");

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Upload em Lote</CardTitle>
              <CardDescription>
                Arraste ou selecione múltiplos comprovantes. O sistema identificará automaticamente 
                o número SPO no nome do arquivo.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* UploadZone for drag & drop */}
          <UploadZone
            onFilesSelected={handleFilesSelected}
            accept=".pdf,.jpg,.jpeg,.png"
            multiple={true}
            label="Arraste comprovantes aqui ou clique para selecionar"
            description="Aceitos: PDF, JPG, PNG - Múltiplos arquivos permitidos"
          />

          {identifying && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 animate-pulse">
              <div className="flex justify-between text-sm">
                <span className="text-foreground font-medium flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Identificando {identifyProgress.done} de {identifyProgress.total} comprovante{identifyProgress.total !== 1 ? "s" : ""}…
                </span>
                <span className="text-primary font-medium">
                  {identifyProgress.total > 0 ? Math.round((identifyProgress.done / identifyProgress.total) * 100) : 0}%
                </span>
              </div>
              <Progress
                value={identifyProgress.total > 0 ? (identifyProgress.done / identifyProgress.total) * 100 : 0}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                Lendo o nome de cada arquivo e cruzando com os vouchers em aberto. Não feche esta janela.
              </p>
            </div>
          )}

          {/* Process button */}
          {files.length > 0 && (
            <div className="flex justify-end">
              <Button
                onClick={processFiles}
                disabled={!canProcess || processing}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                {processing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Processar ({files.filter((f) => f.voucherId && f.status === "pending").length})
                  </>
                )}
              </Button>
            </div>
          )}

          {processing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="text-primary font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Arquivos ({files.length})</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiles([])}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Limpar lista
                </Button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {files.map((fileMatch, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 p-3 border rounded-lg transition-colors animate-fade-in ${
                      fileMatch.status === "identifying"
                        ? "border-primary/40 bg-primary/5 animate-pulse"
                        : "border-border/50 bg-muted/30 hover:bg-muted/50"
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-foreground">
                        {fileMatch.fileName}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {getStatusBadge(fileMatch)}
                        {fileMatch.error && (
                          <span className="text-xs text-destructive">{fileMatch.error}</span>
                        )}
                      </div>

                      {/* Manual SPO input */}
                      {fileMatch.isEditingSpo && fileMatch.status === "pending" && (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            placeholder="SPO ou ND"
                            value={fileMatch.manualSpoInput || ""}
                            onChange={(e) => handleUpdateManualSpo(index, e.target.value)}
                            className="h-8 w-32 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleManualSpoSearch(index);
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => handleManualSpoSearch(index)}
                          >
                            <Search className="h-3 w-3" />
                            Buscar
                          </Button>
                        </div>
                      )}

                      {/* Edit SPO button for already identified SPOs */}
                      {!fileMatch.isEditingSpo && fileMatch.numeroSPO && !fileMatch.voucherId && fileMatch.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 mt-1 text-xs text-muted-foreground"
                          onClick={() => handleToggleEditSpo(index)}
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Editar SPO
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(fileMatch.status)}
                      {fileMatch.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-muted/30 rounded-lg border border-border/30">
            <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
              <AlertCircle className="h-4 w-4 text-primary" />
              Padrões de Nome Aceitos
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6">
              <li>• <code className="bg-muted px-1 rounded">2026188294004052026.5.pdf</code> - Voucher Remessa (ND no início)</li>
              <li>• <code className="bg-muted px-1 rounded">101-286102D26122025.35.pdf</code> - SPO Remessa</li>
              <li>• <code className="bg-muted px-1 rounded">101-286105.pdf</code> - SPO Manual</li>
              <li>• <code className="bg-muted px-1 rounded">OT 433-20251877370.pdf</code> - Voucher Manual</li>
              <li>• <code className="bg-muted px-1 rounded">20262478210.pdf</code> - Apenas número (SPO ou ND)</li>
              <li>• <code className="bg-muted px-1 rounded">SPO12345.pdf</code> / <code className="bg-muted px-1 rounded">comprovante_12345.pdf</code> - Variações</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-warning" />
              O voucher deve estar na etapa <strong className="text-foreground">ROBO</strong> para receber comprovantes automaticamente.
            </p>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Edit2 className="h-3 w-3 text-primary" />
              Se o SPO não for identificado, você pode informar manualmente.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Named export for backward compatibility
export { RoboTab as default };
