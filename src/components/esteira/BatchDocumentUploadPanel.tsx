import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  batchId: string;
  userId: number;
  onUploaded: () => void;
}

export function BatchDocumentUploadPanel({ batchId, userId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const { toast } = useToast();

  const handle = async (files: FileList | File[] | null) => {
    if (!files || (files as any).length === 0) return;
    const list = Array.from(files as any) as File[];
    setUploading(true);
    setProgress({ current: 0, total: list.length });
    try {
      const CONCURRENCY = 8;
      let completed = 0;

      type UploadedDoc = {
        file_name: string;
        file_url: string;
        file_path: string;
        mime_type: string;
        size_bytes: number;
      };

      const uploadOne = async (file: File): Promise<UploadedDoc | null> => {
        try {
          const ext = file.name.split(".").pop();
          const path = `batch/${batchId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: upErr } = await supabase.storage.from("voucher-anexos").upload(path, file);
          if (upErr) {
            console.error(upErr);
            toast({ title: "Falha no upload", description: file.name, variant: "destructive" });
            return null;
          }
          const { data: pub } = supabase.storage.from("voucher-anexos").getPublicUrl(path);
          return {
            file_name: file.name,
            file_url: pub.publicUrl,
            file_path: path,
            mime_type: file.type,
            size_bytes: file.size,
          };
        } finally {
          completed++;
          setProgress({ current: completed, total: list.length });
        }
      };

      // Pool de concorrência
      const uploaded: UploadedDoc[] = [];
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= list.length) return;
          const r = await uploadOne(list[idx]);
          if (r) uploaded.push(r);
        }
      });
      await Promise.all(workers);

      // Registrar tudo num único invoke (multi-row INSERT no backend)
      if (uploaded.length > 0) {
        const { error } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "upload_batch_document_bulk",
            userId,
            batch_id: batchId,
            documents: uploaded,
          },
        });
        if (error) {
          toast({ title: "Erro ao registrar documentos", description: error.message, variant: "destructive" });
        }
      }

      onUploaded();
      toast({ title: `Upload concluído (${uploaded.length} de ${list.length} arquivo${list.length > 1 ? "s" : ""})` });
    } finally {
      setUploading(false);
      setProgress({ current: 0, total: 0 });
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (uploading) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) handle(files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragOver) setDragOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`group cursor-pointer rounded-xl border-2 border-dashed p-4 flex items-center gap-3 transition-all ${
        dragOver
          ? "border-primary bg-primary/10"
          : "border-border/60 bg-card/30 hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <span
        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          dragOver ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary group-hover:bg-primary/20"
        }`}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">
          {uploading
            ? `Enviando ${progress.current} de ${progress.total}…`
            : dragOver
            ? "Solte os arquivos para enviar"
            : "Arraste arquivos ou clique para selecionar"}
        </div>
        <div className="text-xs text-muted-foreground">
          Faça upload de múltiplos arquivos. Eles ficam pendentes até serem vinculados a um voucher.
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        disabled={uploading}
      >
        Selecionar
      </Button>
    </div>
  );
}
