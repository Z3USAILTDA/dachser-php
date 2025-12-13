import { useRef } from 'react';
import { ChbDocument } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Upload, FileText, Download, X, Play, Loader2, Trash2 } from 'lucide-react';

interface ChbDocumentsPanelProps {
  stepId: number;
  documents: (ChbDocument & { file?: File })[];
  uploadedFiles: File[];
  onFilesChange: (files: File[]) => void;
  onStartAnalysis: () => void;
  onDeleteDocument?: (docId: string) => void;
  isAnalyzing: boolean;
  hasAnalysisResult?: boolean;
}

export function ChbDocumentsPanel({ 
  stepId, 
  documents, 
  uploadedFiles, 
  onFilesChange, 
  onStartAnalysis,
  onDeleteDocument,
  isAnalyzing,
  hasAnalysisResult 
}: ChbDocumentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    onFilesChange([...uploadedFiles, ...files]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      onFilesChange([...uploadedFiles, ...files]);
    }
  };

  const removeFile = (index: number) => {
    onFilesChange(uploadedFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Documentos do {stepTitles[stepId]}
        </h3>
        
        {uploadedFiles.length > 0 && (
          <button
            onClick={onStartAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-500 text-black text-xs font-medium
              hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Analisando {uploadedFiles.length} arquivo(s)...
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Fazer Análise ({uploadedFiles.length})
              </>
            )}
          </button>
        )}
      </div>

      {documents.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.65rem] text-white/50 uppercase tracking-wider">
            Documentos carregados ({documents.length})
          </p>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-black/30 border border-white/10"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-white/60" />
                </div>
                <div>
                  <p className="text-xs font-medium text-white">{doc.name}</p>
                  <p className="text-[0.65rem] text-white/40">
                    {doc.uploadedAt} · {doc.size}
                    {doc.stepId && doc.stepId !== stepId && (
                      <span className="ml-1.5 text-amber-400/70">(Etapa {doc.stepId})</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (doc.file) {
                      const url = URL.createObjectURL(doc.file);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = doc.name;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                  className="p-1.5 rounded hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                  title="Baixar"
                >
                  <Download className="w-3 h-3" />
                </button>
                {onDeleteDocument && (
                  <button
                    onClick={() => onDeleteDocument(doc.id)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors"
                    title="Excluir documento"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer
          transition-all duration-200 border-white/20 hover:border-amber-500/50 bg-black/20 hover:bg-amber-500/5"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.xml,.json"
        />
        <Upload className="w-6 h-6 mx-auto mb-2 text-white/40" />
        <p className="text-xs text-white/60">
          Arraste arquivos aqui ou clique para enviar
        </p>
        <p className="text-[0.65rem] text-white/40 mt-0.5">
          PDF, DOC, XLS, imagens, XML, JSON
        </p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.65rem] text-white/50 uppercase tracking-wider">
            Arquivos para análise ({uploadedFiles.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[0.65rem]"
              >
                <FileText className="w-2.5 h-2.5" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <span className="text-amber-500/60">
                  ({(file.size / 1024).toFixed(0)}KB)
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }} 
                  className="hover:text-white ml-0.5"
                  disabled={isAnalyzing}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
