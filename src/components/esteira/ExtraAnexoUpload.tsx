import { useRef, useState, useCallback } from "react";
import { Upload, Loader2, Plus, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExtraAnexoUploadProps {
  voucherId: string;
  etapaAtual: string;
  onUploaded?: () => void;
  /** Compact = small "+" button (used inside Pagamentos modal). Default = full button. */
  compact?: boolean;
  /** Restrict by current user role. If provided, only these roles see the button. */
  allowedRoles?: string[];
  currentUserRole?: string;
}

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx,.xml";

const getUserData = () => {
  const stored = localStorage.getItem("user") || localStorage.getItem("dachser_user");
  return stored ? JSON.parse(stored) : { id: 0, username: "sistema" };
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export const ExtraAnexoUpload = ({
  voucherId,
  etapaAtual,
  onUploaded,
  compact = false,
  allowedRoles,
  currentUserRole,
}: ExtraAnexoUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const { toast } = useToast();

  if (allowedRoles && currentUserRole && !allowedRoles.includes(currentUserRole)) {
    return null;
  }

  const openPicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const valid: File[] = [];
    for (const f of list) {
      if (f.size > MAX_SIZE) {
        toast({
          title: "Arquivo muito grande",
          description: `${f.name} excede 50MB`,
          variant: "destructive",
        });
        continue;
      }
      valid.push(f);
    }
    if (valid.length > 0) setPendingFiles((prev) => [...prev, ...valid]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const removePending = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetDialog = () => {
    setPendingFiles([]);
    setDragActive(false);
  };

  const uploadAll = async () => {
    if (pendingFiles.length === 0 || uploading) return;
    setUploading(true);
    try {
      const userData = getUserData();
      for (const file of pendingFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${Math.random()}.${fileExt}`;

        const { error: upErr } = await supabase.storage
          .from("voucher-anexos")
          .upload(filePath, file);
        if (upErr) throw upErr;

        const { data: { publicUrl } } = supabase.storage
          .from("voucher-anexos")
          .getPublicUrl(filePath);

        const { error: saveErr } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_anexo",
            voucher_id: voucherId,
            tipo: "OUTROS",
            file_name: file.name,
            file_url: publicUrl,
            file_size: file.size,
          },
        });
        if (saveErr) throw saveErr;

        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_log",
            voucher_id: voucherId,
            user_id: userData.id?.toString(),
            user_name: userData.username,
            acao: "ANEXO_EXTRA_ADICIONADO",
            detalhe: `Arquivo extra "${file.name}" anexado em ${etapaAtual}`,
          },
        });
      }

      toast({
        title: "Arquivo(s) anexado(s)",
        description: `${pendingFiles.length} documento(s) adicionado(s) ao voucher.`,
      });
      onUploaded?.();
      resetDialog();
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Falha no upload";
      toast({
        title: "Erro ao anexar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={handleInputChange}
        disabled={uploading}
      />
      {compact ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setDialogOpen(true)}
          disabled={uploading}
          title="Adicionar arquivo extra"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Adicionar
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setDialogOpen(true)}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Enviando..." : "Adicionar arquivo"}
        </Button>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (uploading) return;
          if (!open) resetDialog();
          setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar arquivo</DialogTitle>
            <DialogDescription>
              Arraste o arquivo para a área abaixo ou clique para selecionar.
            </DialogDescription>
          </DialogHeader>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={openPicker}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              dragActive
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/60 hover:bg-muted/40"
            )}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">
              Arraste arquivos aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Formatos: PDF, JPG, PNG, Excel, Word, XML — máx 50MB
            </p>
          </div>

          {pendingFiles.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                >
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(f.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePending(i);
                    }}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (uploading) return;
                resetDialog();
                setDialogOpen(false);
              }}
              disabled={uploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={uploadAll}
              disabled={uploading || pendingFiles.length === 0}
              className="gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Enviar {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
