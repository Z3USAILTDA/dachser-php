import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileRecord {
  id: string;
  filename: string;
  url: string;
  mime: string | null;
  rel_path: string | null;
  created_at: string | null;
}

interface FilesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
}

export function FilesModal({ open, onOpenChange, itemId, itemName }: FilesModalProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [baseFileName, setBaseFileName] = useState<string>("");

  const fetchFiles = async () => {
    if (!itemId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_maritimo_files', itemId }
      });

      if (error) {
        console.error('Error fetching files:', error);
        return;
      }

      if (data?.success) {
        setFiles(data.files || []);
        setBaseFileName(data.baseFileName || '');
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && itemId) {
      fetchFiles();
    }
  }, [open, itemId]);

  const getFileTypeLabel = (mime: string | null) => {
    if (!mime) return 'Arquivo';
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('xlsx')) return 'Excel';
    if (mime.includes('image')) return 'Imagem';
    return 'Arquivo';
  };

  const getFileTypeBadgeClass = (mime: string | null) => {
    if (!mime) return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
    if (mime.includes('pdf')) return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('xlsx')) return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (mime.includes('image')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border border-white/10 text-white max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-lg font-semibold text-white">
            Arquivos: {itemName}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchFiles}
            disabled={isLoading}
            className="h-8 w-8 text-neutral-400 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Base File */}
              {baseFileName && (
                <div className="space-y-2">
                  <h3 className="text-xs uppercase tracking-wider text-neutral-400">Arquivo Base</h3>
                  <div className="bg-black/60 border border-white/10 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-400" />
                      <div>
                        <p className="text-sm text-white truncate max-w-[300px]">{baseFileName}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-500/20 text-blue-300 border-blue-500/30">
                          Base
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Analysis Files */}
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-neutral-400">
                  Arquivos de Análise ({files.length})
                </h3>
                {files.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4 text-center">
                    Nenhum arquivo de análise encontrado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="bg-black/60 border border-white/10 rounded-lg p-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-neutral-400" />
                          <div>
                            <p className="text-sm text-white truncate max-w-[280px]">{file.filename}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getFileTypeBadgeClass(file.mime)}`}>
                                {getFileTypeLabel(file.mime)}
                              </span>
                            </div>
                          </div>
                        </div>
                        {file.url && (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-white/10 rounded-lg transition"
                          >
                            <Download className="w-4 h-4 text-neutral-400 hover:text-white" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
