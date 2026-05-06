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
  const { toast } = useToast();

  const handle = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `batch/${batchId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("voucher-anexos").upload(path, file);
        if (upErr) {
          console.error(upErr);
          toast({ title: "Falha no upload", description: file.name, variant: "destructive" });
          continue;
        }
        const { data: pub } = supabase.storage.from("voucher-anexos").getPublicUrl(path);
        const { error } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "upload_batch_document",
            userId,
            batch_id: batchId,
            file_name: file.name,
            file_url: pub.publicUrl,
            file_path: path,
            mime_type: file.type,
            size_bytes: file.size,
          },
        });
        if (error) {
          toast({ title: "Erro ao registrar documento", description: file.name, variant: "destructive" });
        }
      }
      onUploaded();
      toast({ title: "Upload concluído" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-white/15 p-4 flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
        Enviar documentos
      </Button>
      <span className="text-xs text-muted-foreground">
        Faça upload de múltiplos arquivos. Eles ficam pendentes até serem vinculados a um voucher.
      </span>
    </div>
  );
}
