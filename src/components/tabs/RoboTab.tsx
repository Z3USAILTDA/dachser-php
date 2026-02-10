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
}

export function RoboTab() {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileMatch[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const extractSPOFromFilename = (filename: string): { numero: string; formatted: string | null } | null => {
    // Remove extension for cleaner matching
    const nameWithoutExt = filename.replace(/\.\w+$/, '');
    
    // Special pattern for concatenated XXX-YYYYYY format (e.g., 101285230010206 → 101-285230)
    // This is commonly used: 3 digits + 6 digits + optional extra digits
    const concatenatedPattern = /^(\d{3})(\d{6})\d*/;
    const concatMatch = nameWithoutExt.match(concatenatedPattern);
    if (concatMatch) {
      const formatted = `${concatMatch[1]}-${concatMatch[2]}`;
      return { numero: concatMatch[1] + concatMatch[2], formatted };
    }
    
    // Enhanced patterns for SPO extraction
    const patterns = [
      /^(\d{6,})$/,                   // Pure number filename: 20262478210.pdf
      /^(\d{5,})[-_]/,                // 12345_comprovante.pdf
      /SPO[-_]?(\d{5,})/i,            // SPO12345.pdf or SPO-12345.pdf
      /[-_](\d{5,})\./,               // comprovante_12345.pdf
      /(\d{5,})[-_]comprovante/i,     // 12345-comprovante.pdf
      /comprovante[-_](\d{5,})/i,     // comprovante_12345.pdf
      /pgto[-_]?(\d{5,})/i,           // pgto12345.pdf
      /pag[-_]?(\d{5,})/i,            // pag_12345.pdf
      /voucher[-_]?(\d{5,})/i,        // voucher_12345.pdf
      /^(\d{5,})\s/,                  // "12345 alguma coisa.pdf"
      /\s(\d{5,})\./,                 // "alguma coisa 12345.pdf"
      /^(\d{5,})$/,                   // Fallback: pure number with 5+ digits
    ];

    // First try against name without extension (for pure number patterns)
    for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match && match[1]) {
        return { numero: match[1], formatted: null };
      }
    }

    // Fallback: try against full filename
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match && match[1]) {
        return { numero: match[1], formatted: null };
      }
    }

    return null;
  };

  const searchVoucherBySPO = async (spo: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'find_voucher_by_spo',
          numero_spo: spo,
        },
      });

      if (!error && data?.vouchers?.length > 0) {
        // Filter for ROBO stage vouchers
        const roboVoucher = data.vouchers.find((v: any) => v.etapa_atual === 'ROBO');
        if (roboVoucher) {
          return roboVoucher.id;
        }
      }
    } catch (e) {
      console.error('Error fetching voucher by SPO:', e);
    }
    return null;
  };

  const searchVoucherByND = async (nd: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'find_voucher_by_nd',
          numero_nd: nd,
        },
      });

      if (!error && data?.vouchers?.length > 0) {
        // Filter for ROBO stage vouchers
        const roboVoucher = data.vouchers.find((v: any) => v.etapa_atual === 'ROBO');
        if (roboVoucher) {
          return roboVoucher.id;
        }
      }
    } catch (e) {
      console.error('Error fetching voucher by ND:', e);
    }
    return null;
  };

  // Unified search: tries SPO first, then ND as fallback
  const searchVoucher = async (numero: string): Promise<string | null> => {
    // First try by SPO
    let voucherId = await searchVoucherBySPO(numero);
    if (voucherId) return voucherId;

    // Fallback: try by ND
    voucherId = await searchVoucherByND(numero);
    return voucherId;
  };

  const handleFilesSelected = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    const fileMatches: FileMatch[] = await Promise.all(
      selectedFiles.map(async (file) => {
        const extracted = extractSPOFromFilename(file.name);
        let voucherId = null;
        let displaySPO: string | null = null;

        if (extracted) {
          // Try formatted version first (e.g., "101-285230")
          if (extracted.formatted) {
            voucherId = await searchVoucher(extracted.formatted);
            displaySPO = extracted.formatted;
          }
          
          // Fallback to raw number
          if (!voucherId) {
            voucherId = await searchVoucher(extracted.numero);
            displaySPO = extracted.formatted || extracted.numero;
          }
        }

        return {
          file,
          fileName: file.name,
          numeroSPO: displaySPO,
          voucherId,
          status: "pending" as const,
          manualSpoInput: "",
          isEditingSpo: !extracted,
        };
      })
    );

    setFiles((prev) => [...prev, ...fileMatches]);

    toast({
      title: "Arquivos carregados",
      description: `${selectedFiles.length} arquivo(s) prontos para processamento`,
    });
  };

  const handleManualSpoSearch = async (index: number) => {
    const file = files[index];
    if (!file.manualSpoInput?.trim()) {
      toast({
        title: "Informe o SPO",
        description: "Digite o número SPO para buscar o voucher",
        variant: "destructive",
      });
      return;
    }

    // Use unified search (SPO + ND fallback)
    const voucherId = await searchVoucher(file.manualSpoInput.trim());

    setFiles((prev) =>
      prev.map((f, i) =>
        i === index
          ? {
              ...f,
              numeroSPO: file.manualSpoInput?.trim() || null,
              voucherId,
              isEditingSpo: false,
            }
          : f
      )
    );

    if (voucherId) {
      toast({
        title: "Voucher encontrado",
        description: `SPO ${file.manualSpoInput} vinculado com sucesso`,
      });
    } else {
      toast({
        title: "Voucher não encontrado",
        description: `Nenhum voucher com SPO ${file.manualSpoInput} na etapa ROBO`,
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
          throw new Error("Voucher não encontrado ou não está na etapa ROBO");
        }

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

        // Update voucher status_comprovante to VALIDADO and etapa to CONCLUIDO
        await supabase.functions.invoke('mariadb-proxy', {
          body: {
            action: 'update_voucher_esteira',
            voucher_id: fileMatch.voucherId,
            updates: {
              status_comprovante: 'VALIDADO',
              etapa_atual: 'CONCLUIDO',
              status_baixa: 'PROCESSADO',
            },
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
            detalhe: `Comprovante ${fileMatch.file.name} anexado automaticamente pelo robô`,
          },
        });

        // Log conclusão automática
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

        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === fileMatch.fileName
              ? { ...f, status: "success" }
              : f
          )
        );
      } catch (error: any) {
        console.error("Erro ao processar arquivo:", error);
        
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

    const successCount = files.filter((f) => f.status === "success").length;
    const errorCount = files.filter((f) => f.status === "error").length;

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
      return <Badge className="bg-destructive text-destructive-foreground">SPO não identificado</Badge>;
    }
    if (!fileMatch.voucherId) {
      return <Badge variant="secondary">Voucher não encontrado</Badge>;
    }
    return <Badge className="bg-primary text-primary-foreground">SPO {fileMatch.numeroSPO}</Badge>;
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
                            placeholder="Digite o SPO"
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
              <li>• <code className="bg-muted px-1 rounded">101285230010206.pdf</code> - Formato concatenado (101-285230)</li>
              <li>• <code className="bg-muted px-1 rounded">20262478210.pdf</code> - Apenas número (SPO ou ND)</li>
              <li>• <code className="bg-muted px-1 rounded">12345_comprovante.pdf</code> - SPO no início</li>
              <li>• <code className="bg-muted px-1 rounded">SPO12345.pdf</code> ou <code className="bg-muted px-1 rounded">SPO-12345.pdf</code> - Com prefixo SPO</li>
              <li>• <code className="bg-muted px-1 rounded">comprovante_12345.pdf</code> - SPO no meio/fim</li>
              <li>• <code className="bg-muted px-1 rounded">pgto_12345.pdf</code> ou <code className="bg-muted px-1 rounded">pag-12345.pdf</code> - Variações</li>
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
