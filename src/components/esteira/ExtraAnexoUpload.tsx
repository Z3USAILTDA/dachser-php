import { useRef, useState } from "react";
import { Upload, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  if (allowedRoles && currentUserRole && !allowedRoles.includes(currentUserRole)) {
    return null;
  }

  const handlePick = () => {
    if (!uploading) inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const userData = getUserData();
      for (const file of Array.from(files)) {
        if (file.size > MAX_SIZE) {
          toast({
            title: "Arquivo muito grande",
            description: `${file.name} excede 50MB`,
            variant: "destructive",
          });
          continue;
        }
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
        description: "Documento adicionado ao voucher.",
      });
      onUploaded?.();
    } catch (err: any) {
      toast({
        title: "Erro ao anexar",
        description: err?.message || "Falha no upload",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
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
        onChange={handleChange}
        disabled={uploading}
      />
      {compact ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={handlePick}
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
          onClick={handlePick}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Enviando..." : "Adicionar arquivo"}
        </Button>
      )}
    </>
  );
};
