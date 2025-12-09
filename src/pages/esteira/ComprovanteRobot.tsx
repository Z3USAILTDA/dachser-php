import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bot, Upload, CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";
import { TipoAnexo } from "@/types/voucher";

interface FileMatch {
  file: File;
  fileName: string;
  numeroSPO: string | null;
  voucherId: string | null;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
}

export default function ComprovanteRobot() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileMatch[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const extractSPOFromFilename = (filename: string): string | null => {
    const patterns = [
      /^(\d{5,})[-_]/,
      /SPO[-_]?(\d{5,})/i,
      /[-_](\d{5,})\./,
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    
    if (selectedFiles.length === 0) return;

    const fileMatches: FileMatch[] = await Promise.all(
      selectedFiles.map(async (file) => {
        const numeroSPO = extractSPOFromFilename(file.name);
        let voucherId = null;

        if (numeroSPO) {
          const { data } = await (supabase as any)
            .from("vouchers")
            .select("id, numero_spo, etapa_atual")
            .eq("numero_spo", numeroSPO)
            .eq("etapa_atual", "ROBO")
            .single();

          if (data) {
            voucherId = data.id;
          }
        }

        return {
          file,
          fileName: file.name,
          numeroSPO,
          voucherId,
          status: "pending" as const,
        };
      })
    );

    setFiles(fileMatches);

    toast({
      title: "Arquivos carregados",
      description: `${selectedFiles.length} arquivo(s) prontos para processamento`,
    });
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

        const { error: uploadError } = await supabase.storage
          .from("voucher-attachments")
          .upload(filePath, fileMatch.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("voucher-attachments")
          .getPublicUrl(filePath);

        const { error: attachmentError } = await (supabase as any)
          .from("attachments")
          .insert({
            voucher_id: fileMatch.voucherId,
            tipo: "COMPROVANTE" as TipoAnexo,
            file_url: publicUrl,
            file_name: fileMatch.file.name,
            file_size: fileMatch.file.size,
            uploaded_by_user_id: userData.user?.id,
          });

        if (attachmentError) throw attachmentError;

        await (supabase as any).from("log_entries").insert({
          voucher_id: fileMatch.voucherId,
          user_id: userData.user?.id,
          acao: "COMPROVANTE_ANEXADO",
          detalhe: `Comprovante ${fileMatch.file.name} anexado automaticamente pelo robô`,
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
        return <CheckCircle2 className="h-5 w-5 text-success" />;
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

  return (
    <PageLayout>
      <PageHeader 
        title="Robô de Comprovantes"
        subtitle="Upload em lote de comprovantes com associação automática"
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card className="bg-card/80 backdrop-blur-sm border-border/50 animate-fade-in">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Upload em Lote</CardTitle>
                <CardDescription>
                  Selecione múltiplos arquivos de comprovantes. O sistema identificará automaticamente 
                  o número SPO no nome do arquivo.
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
                  disabled={processing}
                  className="flex-1 bg-input/50 border-border/50"
                />
                <Button
                  onClick={processFiles}
                  disabled={files.length === 0 || processing}
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
                      Processar {files.length > 0 && `(${files.length})`}
                    </>
                  )}
                </Button>
              </div>
            </div>

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
                <h3 className="font-semibold text-foreground">Arquivos ({files.length})</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {files.map((fileMatch, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 border border-border/50 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-foreground">
                          {fileMatch.fileName}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {getStatusBadge(fileMatch)}
                          {fileMatch.error && (
                            <span className="text-xs text-destructive">{fileMatch.error}</span>
                          )}
                        </div>
                      </div>
                      {getStatusIcon(fileMatch.status)}
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
                <li>• <code className="bg-muted px-1 rounded">12345_comprovante.pdf</code> - SPO no início</li>
                <li>• <code className="bg-muted px-1 rounded">SPO12345.pdf</code> ou <code className="bg-muted px-1 rounded">SPO-12345.pdf</code> - Com prefixo SPO</li>
                <li>• <code className="bg-muted px-1 rounded">comprovante_12345.pdf</code> - SPO no meio/fim</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-warning" />
                O voucher deve estar na etapa <strong className="text-foreground">ROBO</strong> para receber comprovantes automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </PageLayout>
  );
}
