import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  batchId: string;
  userId: number;
  onUploaded: () => void;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

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
      const CONCURRENCY = 4;
      let completed = 0;

      type UploadedDoc = {
        file_name: string;
        file_base64: string;
        mime_type: string;
        size_bytes: number;
      };

      const uploadOne = async (file: File): Promise<UploadedDoc | null> => {
        try {
          const base64 = await fileToBase64(file);
          return { file_name: file.name, file_base64: base64, mime_type: file.type, size_bytes: file.size };
        } catch (e: any) {
          console.error("[batch-upload] fileToBase64 falhou", { file: file.name, error: e });
          toast({ title: "Falha no upload", description: `${file.name}: ${e.message}`, variant: "destructive" });
          return null;
        } finally {
          completed++;
          setProgress({ current: completed, total: list.length });
        }
      };

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

      if (uploaded.length === 0) {
        toast({ title: "Nenhum arquivo enviado", description: "Todos os uploads falharam.", variant: "destructive" });
        return;
      }

      const resp = await fetch('/api/fin/vouchers/batch-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId, userId, documents: uploaded }),
      });
      const insertResp = await resp.json();
      if (!resp.ok || !insertResp?.success) {
        console.error("[batch-upload] backend insert falhou", { insertResp });
        toast({
          title: "Erro ao registrar documentos",
          description: insertResp?.error || "O backend não confirmou o registro dos arquivos.",
          variant: "destructive",
        });
        return;
      }

      onUploaded();
      const failed = list.length - uploaded.length;
      if (failed > 0) {
        toast({ title: `Upload parcial (${uploaded.length} de ${list.length})`, description: `${failed} ${failed === 1 ? "arquivo falhou" : "arquivos falharam"}.` });
      } else {
        toast({ title: `Upload concluído (${uploaded.length} de ${list.length} arquivo${list.length > 1 ? "s" : ""})` });
      }
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
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!dragOver) setDragOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`group cursor-pointer rounded-xl border-2 border-dashed p-4 flex items-center gap-3 transition-all ${
        dragOver ? "border-primary bg-primary/10" : "border-border/60 bg-card/30 hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handle(e.target.files)} />
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        dragOver ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary group-hover:bg-primary/20"
      }`}>
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
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        disabled={uploading}
      >
        Selecionar
      </Button>
    </div>
  );
}
