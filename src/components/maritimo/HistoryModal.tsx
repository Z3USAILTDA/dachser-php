import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BadgeStatus } from "./BadgeStatus";

interface HistoryAnalysis {
  id: string;
  status: string;
  progress_step?: string;
  result_text?: string;
  json_result?: any;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  files?: any[];
}

interface HistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analyses: HistoryAnalysis[];
  itemName: string;
}

export function HistoryModal({ open, onOpenChange, analyses, itemName }: HistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[rgba(5,6,18,0.95)] border border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Histórico - {itemName}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {analyses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum histórico encontrado
            </p>
          ) : (
            <div className="space-y-3">
              {analyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="p-4 rounded-xl bg-black/40 border border-white/5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <BadgeStatus status={analysis.status} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(analysis.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {analysis.result_text && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {analysis.result_text}
                    </p>
                  )}
                  {analysis.error_message && (
                    <p className="text-xs text-rose-400 mt-2">
                      Erro: {analysis.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
