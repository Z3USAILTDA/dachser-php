import { useState, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bot, Upload, CheckCircle2, XCircle, AlertCircle, FileText, Search, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface VoucherMatch {
  id: string;
  numero_spo: string;
  fornecedor: string | null;
  valor: number | null;
  vencimento: string;
  etapa_atual: string;
  moeda: string | null;
  id_rm?: string;
}

interface FileMatch {
  file: File;
  fileName: string;
  extractedSPO: string | null;
  extractedND: string | null;
  voucherId: string | null;
  voucherInfo: VoucherMatch | null;
  status: "pending" | "identifying" | "identified" | "not_identified" | "processing" | "success" | "error";
  error?: string;
  confidence: number;
  source: "filename" | "content" | "manual";
}

export default function ComprovanteRobot() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [files, setFiles] = useState<FileMatch[]>([]);
  const [processing, setProcessing] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [availableVouchers, setAvailableVouchers] = useState<VoucherMatch[]>([]);
  const [searchVoucher, setSearchVoucher] = useState("");

  // Load available vouchers on mount
  useEffect(() => {
    loadAvailableVouchers();
  }, []);

  const loadAvailableVouchers = async (search?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "get_vouchers_for_comprovante",
          search: search || undefined,
          limit: 100,
        },
      });

      if (error) throw error;
      setAvailableVouchers(data?.vouchers || []);
    } catch (err) {
      console.error("Error loading vouchers:", err);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchVoucher) {
        loadAvailableVouchers(searchVoucher);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchVoucher]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    const initialFiles: FileMatch[] = selectedFiles.map((file) => ({
      file,
      fileName: file.name,
      extractedSPO: null,
      extractedND: null,
      voucherId: null,
      voucherInfo: null,
      status: "pending",
      confidence: 0,
      source: "filename",
    }));

    setFiles(initialFiles);

    toast({
      title: "Arquivos carregados",
      description: `${selectedFiles.length} arquivo(s) prontos para identificação`,
    });
  };

  const identifyFiles = async () => {
    setIdentifying(true);
    setProgress(0);

    let identified = 0;
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
      const fileMatch = files[i];
      
      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: "identifying" } : f
        )
      );

      try {
        // Convert file to base64 for PDF analysis
        const base64 = await fileToBase64(fileMatch.file);

        // Call edge function to parse the comprovante
        const { data, error } = await supabase.functions.invoke("parse-comprovante-pdf", {
          body: {
            pdfBase64: base64,
            fileName: fileMatch.fileName,
          },
        });

        if (error) throw error;

        const extractedData = data?.data;
        let foundVoucher: VoucherMatch | null = null;

        // Try to find voucher by SPO
        if (extractedData?.numeroSPO) {
          const { data: spoResult } = await supabase.functions.invoke("mariadb-proxy", {
            body: {
              action: "find_voucher_by_spo",
              numero_spo: extractedData.numeroSPO,
            },
          });
          if (spoResult?.vouchers?.length > 0) {
            foundVoucher = spoResult.vouchers[0];
          }
        }

        // Try to find voucher by ND if SPO didn't work
        if (!foundVoucher && extractedData?.numeroND) {
          const { data: ndResult } = await supabase.functions.invoke("mariadb-proxy", {
            body: {
              action: "find_voucher_by_nd",
              numero_nd: extractedData.numeroND,
            },
          });
          if (ndResult?.vouchers?.length > 0) {
            foundVoucher = ndResult.vouchers[0];
          }
        }

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  extractedSPO: extractedData?.numeroSPO || null,
                  extractedND: extractedData?.numeroND || null,
                  voucherId: foundVoucher?.id || null,
                  voucherInfo: foundVoucher,
                  status: foundVoucher ? "identified" : "not_identified",
                  confidence: extractedData?.confidence || 0,
                  source: extractedData?.source || "filename",
                }
              : f
          )
        );
      } catch (err) {
        console.error("Identification error:", err);
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: "not_identified", error: "Erro na identificação" }
              : f
          )
        );
      }

      identified++;
      setProgress((identified / totalFiles) * 100);
    }

    setIdentifying(false);
    
    const identifiedCount = files.filter(f => f.status === "identified").length;
    toast({
      title: "Identificação concluída",
      description: `${identifiedCount} de ${totalFiles} arquivo(s) identificado(s)`,
    });
  };

  const manualAssign = (fileIndex: number, voucherId: string) => {
    const voucher = availableVouchers.find(v => v.id === voucherId);
    setFiles((prev) =>
      prev.map((f, idx) =>
        idx === fileIndex
          ? {
              ...f,
              voucherId,
              voucherInfo: voucher || null,
              status: voucher ? "identified" : "not_identified",
              source: "manual",
            }
          : f
      )
    );
  };

  const processFiles = async () => {
    const identifiedFiles = files.filter(f => f.voucherId && f.status === "identified");
    
    if (identifiedFiles.length === 0) {
      toast({
        title: "Nenhum arquivo para processar",
        description: "Identifique ou associe manualmente os comprovantes primeiro",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    setProgress(0);

    let processed = 0;
    const comprovantesToUpload: Array<{
      voucher_id: string;
      file_name: string;
      file_url: string;
      file_size: number;
      user_id: string;
      user_name: string;
    }> = [];

    // First, upload all files to storage
    for (const fileMatch of identifiedFiles) {
      setFiles((prev) =>
        prev.map((f) =>
          f.fileName === fileMatch.fileName ? { ...f, status: "processing" } : f
        )
      );

      try {
        const fileExt = fileMatch.file.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `comprovantes/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("voucher-anexos")
          .upload(filePath, fileMatch.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("voucher-anexos")
          .getPublicUrl(filePath);

        comprovantesToUpload.push({
          voucher_id: fileMatch.voucherId!,
          file_name: fileMatch.file.name,
          file_url: publicUrl,
          file_size: fileMatch.file.size,
          user_id: user?.id?.toString() || "",
          user_name: (user as any)?.username || (user as any)?.email || "Sistema Robô",
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === fileMatch.fileName ? { ...f, status: "success" } : f
          )
        );
      } catch (error: any) {
        console.error("Upload error:", error);
        setFiles((prev) =>
          prev.map((f) =>
            f.fileName === fileMatch.fileName
              ? { ...f, status: "error", error: error.message }
              : f
          )
        );
      }

      processed++;
      setProgress((processed / identifiedFiles.length) * 100);
    }

    // Now attach all comprovantes in batch
    if (comprovantesToUpload.length > 0) {
      try {
        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "attach_comprovante_batch",
            comprovantes: comprovantesToUpload,
          },
        });

        if (error) throw error;

        toast({
          title: "Processamento concluído",
          description: `${data?.successCount || 0} comprovante(s) anexado(s) com sucesso`,
        });
      } catch (err) {
        console.error("Batch attach error:", err);
        toast({
          title: "Erro ao anexar comprovantes",
          description: "Alguns comprovantes podem não ter sido anexados",
          variant: "destructive",
        });
      }
    }

    setProcessing(false);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const getStatusIcon = (status: FileMatch["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "identifying":
      case "processing":
        return <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
      case "identified":
        return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case "not_identified":
        return <AlertCircle className="h-5 w-5 text-warning" />;
      default:
        return <FileText className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (fileMatch: FileMatch) => {
    if (fileMatch.status === "identified" && fileMatch.voucherInfo) {
      return (
        <Badge className="bg-primary text-primary-foreground">
          SPO {fileMatch.voucherInfo.numero_spo}
        </Badge>
      );
    }
    if (fileMatch.extractedSPO || fileMatch.extractedND) {
      return (
        <Badge variant="secondary">
          {fileMatch.extractedSPO ? `SPO ${fileMatch.extractedSPO}` : `ND ${fileMatch.extractedND}`}
        </Badge>
      );
    }
    if (fileMatch.status === "not_identified") {
      return <Badge variant="destructive">Não identificado</Badge>;
    }
    return <Badge variant="outline">Pendente</Badge>;
  };

  const identifiedCount = files.filter(f => f.voucherId).length;
  const notIdentifiedCount = files.filter(f => f.status === "not_identified" && !f.voucherId).length;

  return (
    <PageLayout backTo="/fin/esteira">
      <PageHeader 
        title="Robô de Comprovantes"
        subtitle="Upload em lote com identificação inteligente"
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Upload Card */}
        <Card className="bg-card/80 backdrop-blur-sm border-border/50 animate-fade-in">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Upload em Lote</CardTitle>
                <CardDescription>
                  O sistema identifica automaticamente o número SPO/ND no nome do arquivo e no conteúdo do PDF.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="files">Selecionar Comprovantes</Label>
              <div className="flex gap-3">
                <Input
                  id="files"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  disabled={processing || identifying}
                  className="flex-1 bg-input/50 border-border/50"
                />
                <Button
                  onClick={identifyFiles}
                  disabled={files.length === 0 || processing || identifying}
                  variant="secondary"
                  className="gap-2"
                >
                  {identifying ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Identificando...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Identificar
                    </>
                  )}
                </Button>
                <Button
                  onClick={processFiles}
                  disabled={identifiedCount === 0 || processing || identifying}
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
                      Processar ({identifiedCount})
                    </>
                  )}
                </Button>
              </div>
            </div>

            {(processing || identifying) && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {identifying ? "Identificando..." : "Enviando..."}
                  </span>
                  <span className="text-primary font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Summary badges */}
            {files.length > 0 && (
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">
                  Total: {files.length}
                </Badge>
                {identifiedCount > 0 && (
                  <Badge className="bg-green-500/10 text-green-600 text-xs">
                    Identificados: {identifiedCount}
                  </Badge>
                )}
                {notIdentifiedCount > 0 && (
                  <Badge className="bg-orange-500/10 text-orange-600 text-xs">
                    Não identificados: {notIdentifiedCount}
                  </Badge>
                )}
              </div>
            )}

            {/* Files list */}
            {files.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">Arquivos ({files.length})</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {files.map((fileMatch, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 border border-border/50 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-fade-in"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {getStatusIcon(fileMatch.status)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-foreground">
                          {fileMatch.fileName}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {getStatusBadge(fileMatch)}
                          {fileMatch.voucherInfo && (
                            <span className="text-xs text-muted-foreground">
                              {fileMatch.voucherInfo.fornecedor} - R$ {fileMatch.voucherInfo.valor?.toLocaleString("pt-BR")}
                            </span>
                          )}
                          {fileMatch.source === "manual" && (
                            <Badge variant="outline" className="text-xs">Manual</Badge>
                          )}
                          {fileMatch.error && (
                            <span className="text-xs text-destructive">{fileMatch.error}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Manual association for unidentified files */}
                      {fileMatch.status === "not_identified" && !fileMatch.voucherId && (
                        <div className="flex items-center gap-2">
                          <Select onValueChange={(value) => manualAssign(index, value)}>
                            <SelectTrigger className="w-48 h-8 text-xs">
                              <SelectValue placeholder="Associar a voucher..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableVouchers.map((v) => (
                                <SelectItem key={v.id} value={v.id} className="text-xs">
                                  SPO {v.numero_spo} - {v.fornecedor?.substring(0, 20)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Link2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Help section */}
            <div className="p-4 bg-muted/30 rounded-lg border border-border/30">
              <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                <AlertCircle className="h-4 w-4 text-primary" />
                Padrões de Nome Reconhecidos
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                <li>• <code className="bg-muted px-1 rounded">101-286102D26122025.35</code> - SPO Remessa</li>
                <li>• <code className="bg-muted px-1 rounded">101-286105</code> - SPO Manual</li>
                <li>• <code className="bg-muted px-1 rounded">2025156579326122025.53</code> - Voucher Remessa</li>
                <li>• <code className="bg-muted px-1 rounded">OT 433-20251877370</code> - Voucher Manual</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-warning" />
                Vouchers na etapa <strong className="text-foreground">FINANCEIRO</strong> são elegíveis para receber comprovantes.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Manual search section */}
        {notIdentifiedCount > 0 && (
          <Card className="bg-card/80 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Buscar Voucher para Associação Manual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="Buscar por SPO, fornecedor ou ND..."
                  value={searchVoucher}
                  onChange={(e) => setSearchVoucher(e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" onClick={() => loadAvailableVouchers(searchVoucher)}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {availableVouchers.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {availableVouchers.length} voucher(es) disponível(is) para associação
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </PageLayout>
  );
}
