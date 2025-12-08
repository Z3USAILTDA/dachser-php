import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";

interface FilesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
}

export function FilesModal({ open, onOpenChange, itemId, itemName }: FilesModalProps) {
  // Placeholder - would fetch files from API
  const files: any[] = [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[rgba(5,6,18,0.95)] border border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Arquivos - {itemName}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh]">
          {files.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum arquivo encontrado
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((file: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-white/5"
                >
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
