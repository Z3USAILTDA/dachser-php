import { useCallback, useState } from "react";
import { Upload, X, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
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
  accept = ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx,.xml",
  maxSize = 50 * 1024 * 1024, // 50MB
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
    if (file.size > maxSize) {
      toast({
        title: "Arquivo muito grande",
        description: `O arquivo deve ter no máximo ${maxSize / 1024 / 1024}MB`,
        variant: "destructive",
      });
      return;
    }

    const fileId = Math.random().toString(36);
    const uploadingFile: UploadingFile = {
      id: fileId,
      file,
      progress: 0,
      status: 'uploading',
    };

    setUploadingFiles(prev => [...prev, uploadingFile]);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Simulate progress for better UX (Supabase doesn't provide real progress)
      const progressInterval = setInterval(() => {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === fileId && f.progress < 90
              ? { ...f, progress: f.progress + 10 }
              : f
          )
        );
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from("voucher-attachments")
        .upload(filePath, file);

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("voucher-attachments")
        .getPublicUrl(filePath);

      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, progress: 100, status: 'completed' }
            : f
        )
      );

      onFileUpload(publicUrl, file.name, file.size);

      // Remove from list after 2 seconds
      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
      }, 2000);
    } catch (error: any) {
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error', error: error.message }
            : f
        )
      );
      
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const uploadMultipleFiles = async (files: FileList) => {
    const fileArray = Array.from(files);
    // Upload all files simultaneously
    await Promise.all(fileArray.map(file => uploadFile(file)));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (multiple) {
        uploadMultipleFiles(files);
      } else {
        uploadFile(files[0]);
      }
    }
  }, [multiple]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (multiple) {
        uploadMultipleFiles(files);
      } else {
        uploadFile(files[0]);
      }
    }
    // Reset input to allow re-uploading same file
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
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
          {isUploading ? "Enviando arquivos..." : multiple ? "Arraste arquivos ou clique para selecionar" : "Arraste o arquivo ou clique para selecionar"}
        </p>
        <p className="text-xs text-muted-foreground">
          Formatos: PDF, JPG, PNG, Excel, Word, XML (máx. {maxSize / 1024 / 1024}MB)
          {multiple && " • Múltiplos arquivos permitidos"}
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

      {/* Upload Progress List */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2 mt-4">
          {uploadingFiles.map((file) => (
            <div
              key={file.id}
              className="border border-border rounded-lg p-3 bg-secondary/20"
            >
              <div className="flex items-center gap-3 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {file.status === 'completed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                )}
                {file.status === 'error' && (
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                )}
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
