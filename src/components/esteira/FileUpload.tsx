import { useCallback, useState } from "react";
import { Upload, X, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

interface FileUploadProps {
  onFileUpload: (fileUrl: string, fileName: string, fileSize: number) => void;
  /** Se fornecido, usa esta função para fazer o upload em vez do Supabase Storage.
   *  Deve retornar a URL final do arquivo. */
  uploadFn?: (file: File) => Promise<string>;
  accept?: string;
  maxSize?: number;
  label: string;
  required?: boolean;
  existingFile?: { name: string; url: string };
  onRemove?: () => void;
  multiple?: boolean;
}

export const FileUpload = ({
  onFileUpload,
  uploadFn,
  accept = "*",
  maxSize = 1024 * 1024 * 1024, // 1GB — sem restrição prática
  label,
  required = false,
  existingFile,
  onRemove,
  multiple = false,
}: FileUploadProps) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

  const uploadFile = async (file: File) => {
    const fileId = Math.random().toString(36);
    setUploadingFiles(prev => [...prev, { id: fileId, file, progress: 0, status: 'uploading' }]);

    try {
      let finalUrl: string;

      if (uploadFn) {
        // Simula progresso enquanto faz upload real
        const progressInterval = setInterval(() => {
          setUploadingFiles(prev =>
            prev.map(f => f.id === fileId && f.progress < 85 ? { ...f, progress: f.progress + 15 } : f)
          );
        }, 200);
        try {
          finalUrl = await uploadFn(file);
        } finally {
          clearInterval(progressInterval);
        }
      } else {
        throw new Error('uploadFn não fornecido — integração Supabase removida');
      }

      setUploadingFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, progress: 100, status: 'completed' } : f)
      );

      onFileUpload(finalUrl, file.name, file.size);

      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      }, 2000);
    } catch (error: any) {
      setUploadingFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, status: 'error', error: error.message } : f)
      );
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    }
  };

  const uploadMultipleFiles = async (files: FileList) => {
    await Promise.all(Array.from(files).map(file => uploadFile(file)));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (multiple) uploadMultipleFiles(files);
      else uploadFile(files[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiple]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (multiple) uploadMultipleFiles(files);
      else uploadFile(files[0]);
    }
    e.target.value = '';
  };

  if (existingFile) {
    return (
      <div className="border border-border rounded-lg p-4 bg-secondary/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">{existingFile.name}</p>
              <p className="text-xs text-muted-foreground">Arquivo anexado</p>
            </div>
          </div>
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  const isUploading = uploadingFiles.length > 0;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          isUploading && "opacity-50 cursor-not-allowed"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && document.getElementById(`file-${label}`)?.click()}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-1">
          {isUploading
            ? "Enviando arquivos..."
            : multiple
            ? "Arraste arquivos ou clique para selecionar"
            : "Arraste o arquivo ou clique para selecionar"}
        </p>
        <p className="text-xs text-muted-foreground">
          Qualquer formato permitido{multiple && " • Múltiplos arquivos permitidos"}
        </p>
        <input
          id={`file-${label}`}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
          multiple={multiple}
        />
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-2 mt-4">
          {uploadingFiles.map((file) => (
            <div key={file.id} className="border border-border rounded-lg p-3 bg-secondary/20">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                {file.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
                {file.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive shrink-0" />}
              </div>
              <Progress value={file.progress} className="h-2" />
              {file.status === 'error' && file.error && (
                <p className="text-xs text-destructive mt-1">{file.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
