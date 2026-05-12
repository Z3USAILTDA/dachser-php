import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bot, Upload, CheckCircle2, XCircle, AlertCircle, FileText, Search, Edit2, X } from "lucide-react";

import { UploadZone } from "@/components/maritimo/UploadZone";

interface FileMatch {
  file: File;
  fileName: string;
  numeroSPO: string | null;
  voucherId: string | null;
  status: "pending" | "processing" | "success" | "error";
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

  // Lê o arquivo como base64 para enviar ao parser exaustivo
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Chama o parser exaustivo (mesmo usado em /fin/esteira/robot)
  // Retorna candidatos SPO/ND ordenados por prioridade.
  const extractCandidatesFromFile = async (
    file: File
  ): Promise<{ numeroSPO: string | null; numeroND: string | null; linhaDigitavel: string | null; candidatosSPO: string[]; candidatosND: string[] }> => {
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-comprovante-pdf", {
        body: { pdfBase64: base64, fileName: file.name },
      });
      if (error) throw error;
      const d = data?.data || {};
      return {
        numeroSPO: d.numeroSPO || null,
        numeroND: d.numeroND || null,
        linhaDigitavel: d.linhaDigitavel || null,
        candidatosSPO: Array.isArray(d.candidatosSPO) ? d.candidatosSPO : [],
        candidatosND: Array.isArray(d.candidatosND) ? d.candidatosND : [],
      };
    } catch (e) {
      console.error("[RoboTab] Erro ao extrair candidatos:", e);
      return { numeroSPO: null, numeroND: null, linhaDigitavel: null, candidatosSPO: [], candidatosND: [] };
    }
  };

  const pickVoucher = (vouchers: any[]) => {
    if (!vouchers || vouchers.length === 0) return null;
    return (
      vouchers.find((v: any) => v.etapa_atual === 'ROBO' && v.is_master) ||
      vouchers.find((v: any) => v.etapa_atual === 'ROBO') ||
      vouchers.find((v: any) => v.is_master) ||
      vouchers[0]
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
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'find_voucher_by_spo',
          numero_spo: spo,
        },
      });

      if (!error && data?.vouchers?.length > 0) {
        const chosen = pickVoucher(data.vouchers);
        if (chosen) return buildMatch(chosen);
      }
    } catch (e) {
      console.error('Error fetching voucher by SPO:', e);
    }
    return null;
  };

  const searchVoucherByND = async (nd: string): Promise<{ id: string; masterName?: string; childSpo?: string; isMaster?: boolean; matchedViaChild?: boolean; etapaAtual?: string } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'find_voucher_by_nd',
          numero_nd: nd,
        },
      });

      if (!error && data?.vouchers?.length > 0) {
        const chosen = pickVoucher(data.vouchers);
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

  const handleFilesSelected = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    const CONCURRENCY = 5;
    const MAX_CANDIDATES_PER_KIND = 6;

    const processOne = async (file: File): Promise<FileMatch> => {
      const extracted = await extractCandidatesFromFile(file);

      // Monta lista ordenada de tentativas (kind, value), deduplicada
      const tries: Array<{ kind: "spo" | "nd"; value: string }> = [];
      const seen = new Set<string>();
      const push = (kind: "spo" | "nd", value?: string | null) => {
        if (!value) return;
        const key = `${kind}:${value}`;
        if (seen.has(key)) return;
        seen.add(key);
        tries.push({ kind, value });
      };

      // Prioridade: ND principal → linha digitável → demais ND → SPO principal → demais SPO
      push("nd", extracted.numeroND);
      push("nd", extracted.linhaDigitavel);
      for (const c of extracted.candidatosND.slice(0, MAX_CANDIDATES_PER_KIND)) push("nd", c);
      push("spo", extracted.numeroSPO);
      for (const c of extracted.candidatosSPO.slice(0, MAX_CANDIDATES_PER_KIND)) push("spo", c);

      let match: { id: string; masterName?: string; childSpo?: string; isMaster?: boolean; matchedViaChild?: boolean; etapaAtual?: string } | null = null;
      let displayNumero: string | null = null;

      for (const t of tries) {
        match = t.kind === "spo" ? await searchVoucherBySPO(t.value) : await searchVoucherByND(t.value);
        if (match) {
          displayNumero = t.value;
          break;
        }
      }

      if (!displayNumero) {
        displayNumero = extracted.numeroND || extracted.numeroSPO || null;
      }

      return {
        file,
        fileName: file.name,
        numeroSPO: displayNumero,
        voucherId: match?.id || null,
        masterName: match?.masterName,
        childSpo: match?.childSpo,
        isMaster: match?.isMaster,
        matchedViaChild: match?.matchedViaChild,
        etapaAtual: match?.etapaAtual,
        status: "pending" as const,
        manualSpoInput: "",
        isEditingSpo: !displayNumero,
      };
    };

    toast({
      title: "Arquivos carregados",
      description: `Identificando ${selectedFiles.length} arquivo(s)...`,
    });

    const results: FileMatch[] = new Array(selectedFiles.length);
    for (let start = 0; start < selectedFiles.length; start += CONCURRENCY) {
      const slice = selectedFiles.slice(start, start + CONCURRENCY);
      const batch = await Promise.all(slice.map((f) => processOne(f)));
      batch.forEach((r, k) => (results[start + k] = r));
    }

    setFiles((prev) => [...prev, ...results]);
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

    const { data: userData } = await supabase.auth.getUser();
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const fileMatch of files) {
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

        const fileExt = fileMatch.file.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("voucher-anexos")
          .upload(filePath, fileMatch.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("voucher-anexos")
          .getPublicUrl(filePath);

        // Save attachment metadata to MariaDB using the correct action
        const { error: attachmentError } = await supabase.functions.invoke('mariadb-proxy', {
          body: {
            action: 'save_voucher_anexo',
            voucher_id: fileMatch.voucherId,
            tipo: "COMPROVANTE",
            file_url: publicUrl,
            file_name: fileMatch.file.name,
            file_size: fileMatch.file.size,
          },
        });

        if (attachmentError) throw attachmentError;

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

        await supabase.functions.invoke('mariadb-proxy', {
          body: {
            action: 'update_voucher_esteira',
            voucher_id: fileMatch.voucherId,
            updates,
          },
        });

        // Log comprovante anexado
        await supabase.functions.invoke('mariadb-proxy', {
          body: {
            action: 'save_voucher_log',
            voucher_id: fileMatch.voucherId,
            user_id: userData.user?.id || null,
            user_name: userData.user?.email || 'Sistema',
            acao: "COMPROVANTE_ANEXADO",
            detalhe: `Comprovante ${fileMatch.file.name} anexado automaticamente pelo robô${fileMatch.childSpo ? ` (filho SPO ${fileMatch.childSpo})` : ''}${wasConcluded ? ' (revínculo em voucher já concluído)' : ''}`,
          },
        });

        // Log conclusão automática (apenas quando o robô efetivamente concluiu o voucher)
        if (!wasConcluded) {
          await supabase.functions.invoke('mariadb-proxy', {
            body: {
              action: 'save_voucher_log',
              voucher_id: fileMatch.voucherId,
              user_id: userData.user?.id || null,
              user_name: userData.user?.email || 'Sistema',
              acao: "CONCLUIDO_ROBO",
              detalhe: `Voucher concluído automaticamente após processamento do comprovante`,
            },
          });
        }

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
    }

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
    if (fileMatch.isMaster || fileMatch.matchedViaChild) {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="info">Master</Badge>
          <Badge className="bg-primary text-primary-foreground">{fileMatch.masterName}</Badge>
          {fileMatch.matchedViaChild && fileMatch.childSpo && (
            <span className="text-xs text-muted-foreground">via filho {fileMatch.childSpo}</span>
          )}
        </div>
      );
    }
    return <Badge className="bg-primary text-primary-foreground">{fileMatch.numeroSPO}</Badge>;
  };

  const canProcess = files.length > 0 && files.some((f) => f.voucherId && f.status === "pending");

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
                    className="flex items-start gap-3 p-3 border border-border/50 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-fade-in"
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
