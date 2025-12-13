import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";

interface HistoryRunFile {
  id: string;
  file_name: string;
  file_url?: string;
  file_type: string;
  source?: string;
  role?: string;
  created_at?: string;
}

interface HistoryRun {
  id: string;
  status: string;
  result_text?: string;
  result_html?: string;
  json_result?: any;
  created_at: string;
  updated_at?: string;
  created_by_email?: string;
  created_by?: string;
  files?: HistoryRunFile[];
}

interface HistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analyses: HistoryRun[];
  itemName: string;
}

export function HistoryModal({ open, onOpenChange, analyses, itemName }: HistoryModalProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).replace(',', '');
  };

  const getStatusBadge = (status: string) => {
    if (status === 'completed' || status === 'realizado') {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 rounded-md">
          realizado
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="rounded-md">
        {status}
      </Badge>
    );
  };

  const copyToClipboard = async (text: string) => {
    if (!text || text.trim().length === 0) {
      toast({
        title: "Erro",
        description: "Não há conteúdo para copiar",
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      
      toast({
        title: "Sucesso",
        description: "Copiado para a área de transferência"
      });
    } catch (err) {
      console.error('Copy error:', err);
      toast({
        title: "Erro",
        description: "Erro ao copiar resultado",
        variant: "destructive"
      });
    }
  };

  const filteredAnalyses = useMemo(() => {
    if (!searchTerm.trim()) return analyses;
    
    const searchLower = searchTerm.toLowerCase();
    return analyses.filter(analysis => {
      if (analysis.result_text?.toLowerCase().includes(searchLower)) return true;
      if (analysis.files?.some(f => f.file_name.toLowerCase().includes(searchLower))) return true;
      if (formatDateTime(analysis.created_at).includes(searchTerm)) return true;
      return false;
    });
  }, [analyses, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] bg-black/95 border border-white/10 text-white">
        <DialogHeader>
          <div className="flex items-center gap-4 w-full pr-8">
            <div className="flex flex-col shrink-0">
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-3">
                <FileText className="w-5 h-5 text-amber-300" />
                Histórico de Análises
              </DialogTitle>
              <p className="text-xs text-neutral-400 truncate max-w-[300px] pl-8">{itemName}</p>
            </div>
            <div className="relative w-[220px] ml-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                type="text"
                placeholder="Buscar nas análises..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
                className="pl-10 border border-white/12 text-white placeholder:text-neutral-500 h-9 rounded-lg focus-visible:ring-amber-400"
              />
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[600px] pr-4 [&>div>div[style]]:!block">
          {filteredAnalyses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-16 h-16 text-neutral-400 mb-4" />
              <p className="text-white text-lg font-medium mb-2">
                {searchTerm ? 'Nenhuma análise encontrada' : 'Nenhuma análise realizada'}
              </p>
              <p className="text-neutral-400 text-sm">
                {searchTerm 
                  ? 'Tente outro termo de busca' 
                  : 'As análises aparecerão aqui após serem concluídas'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAnalyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="bg-black/60 border border-white/10 rounded-xl overflow-hidden hover:border-amber-400/30 transition-colors"
                >
                  <div className="bg-black/80 px-4 py-3 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-neutral-400 font-mono">
                        {formatDateTime(analysis.created_at)}
                      </span>
                      {getStatusBadge(analysis.status)}
                      {analysis.created_by_email && (
                        <span className="text-xs text-neutral-500">
                          por {analysis.created_by_email}
                        </span>
                      )}
                    </div>
                    {analysis.result_text && analysis.result_text.trim().length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(analysis.result_text!)}
                        className="h-8 w-8 p-0 hover:bg-white/10 shrink-0 text-neutral-300"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="p-4">
                    {analysis.result_html ? (
                      <div 
                        className="text-sm text-neutral-200 prose prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: analysis.result_html }}
                      />
                    ) : analysis.result_text ? (
                      <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed">
                        {analysis.result_text}
                      </pre>
                    ) : analysis.status === 'error' ? (
                      <div className="bg-rose-500/15 border border-rose-500/40 rounded-lg p-3">
                        <p className="text-sm text-rose-300">
                          Erro ao processar análise
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-neutral-400">
                          Análise em andamento...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
