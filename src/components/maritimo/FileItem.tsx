import { useState } from "react";
import { FileText, X, MoreVertical, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilePreviewDialog } from "./FilePreviewDialog";

interface FileItemProps {
  file: File | { name: string; type?: string };
  onRemove?: () => void;
  onMarkAsInvoice?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  showPreview?: boolean;
}

export const FileItem = ({ 
  file, 
  onRemove, 
  onMarkAsInvoice, 
  draggable = false, 
  onDragStart,
  showPreview = true
}: FileItemProps) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  
  const isActualFile = file instanceof File;
  const isPdf = file.name.toLowerCase().endsWith(".pdf");

  return (
    <>
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        className="flex items-center justify-between gap-3 p-3 bg-black/40 rounded-lg border border-white/10 hover:border-primary transition-all cursor-move"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="text-sm text-foreground truncate">{file.name}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Preview button - only show for PDFs and actual files */}
          {showPreview && isPdf && isActualFile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewOpen(true);
              }}
              className="p-1.5 hover:bg-white/10 rounded transition-colors"
              title="Visualizar"
            >
              <Eye className="w-4 h-4 text-amber-400 hover:text-amber-300" />
            </button>
          )}
          
          {onMarkAsInvoice && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-neutral-400 hover:text-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-black/90 border-white/10">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsInvoice();
                  }}
                  className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
                >
                  Marcar como Invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-4 h-4 text-neutral-400 hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      {isActualFile && (
        <FilePreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          file={file as File}
          fileName={file.name}
        />
      )}
    </>
  );
};
