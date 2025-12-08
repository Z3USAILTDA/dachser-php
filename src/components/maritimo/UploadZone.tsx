import { useCallback, useState } from "react";
import { Upload } from "lucide-react";

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  description?: string;
}

export function UploadZone({
  onFilesSelected,
  accept = "*",
  multiple = false,
  label = "Arraste e solte ou clique para enviar",
  description = ""
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFilesSelected(multiple ? files : [files[0]]);
    }
  }, [onFilesSelected, multiple]);

  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const files = Array.from(target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    };
    input.click();
  }, [accept, multiple, onFilesSelected]);

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative cursor-pointer rounded-xl border-2 border-dashed p-8
        transition-all duration-200 text-center
        ${isDragging 
          ? 'border-amber-400 bg-amber-400/10' 
          : 'border-white/20 bg-white/5 hover:border-amber-400/60 hover:bg-white/8'
        }
      `}
    >
      <div className="flex flex-col items-center gap-3">
        <div className={`
          w-12 h-12 rounded-full flex items-center justify-center
          ${isDragging ? 'bg-amber-400/20' : 'bg-white/10'}
        `}>
          <Upload className={`w-6 h-6 ${isDragging ? 'text-amber-400' : 'text-white/60'}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-white/80">{label}</p>
          {description && (
            <p className="text-xs text-neutral-500 mt-1">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
