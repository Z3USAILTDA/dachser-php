import { File, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileItemProps {
  file: File;
  onRemove: () => void;
}

export function FileItem({ file, onRemove }: FileItemProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-400/20 flex items-center justify-center">
          <File className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white truncate max-w-[200px]">{file.name}</p>
          <p className="text-xs text-neutral-500">
            {getFileExtension(file.name)} • {formatFileSize(file.size)}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-8 w-8 rounded-full text-neutral-400 hover:text-rose-400 hover:bg-rose-400/10"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
