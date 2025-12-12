import { useRef } from 'react';
import { ChbDocument } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { Upload, FileText, Eye, Download, X, Play, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ChbDocumentsPanelProps {
  stepId: number;
  documents: ChbDocument[];
  uploadedFiles: File[];
  onFilesChange: (files: File[]) => void;
  onStartAnalysis: () => void;
  isAnalyzing: boolean;
}

const typeColors: Record<ChbDocument['type'], string> = {
  HBL: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Invoice: 'bg-green-500/20 text-green-400 border-green-500/30',
  'Packing List': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  DI: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  AWB: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  Certificado: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

export function ChbDocumentsPanel({ 
  stepId, 
  documents, 
  uploadedFiles, 
  onFilesChange, 
  onStartAnalysis,
  isAnalyzing 
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Documentos do {stepTitles[stepId]}
        </h3>
        
        {uploadedFiles.length > 0 && (
          <button
            onClick={onStartAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500 text-black font-medium
              hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando {uploadedFiles.length} arquivo(s)...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Fazer Análise ({uploadedFiles.length} arquivo{uploadedFiles.length > 1 ? 's' : ''})
              </>
            )}
          </button>
        )}
      </div>

      {documents.length > 0 && (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/10"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{doc.name}</p>
                  <p className="text-xs text-white/40">
                    {doc.uploadedAt} · {doc.size}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={`${typeColors[doc.type]} border`}>
                  {doc.type}
                </Badge>
                <button
                  onClick={() => console.log('Abrir:', doc.name)}
                  className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => console.log('Baixar:', doc.name)}
                  className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
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
        <Upload className="w-8 h-8 mx-auto mb-3 text-white/40" />
        <p className="text-sm text-white/60">
          Arraste arquivos aqui ou clique para enviar
        </p>
        <p className="text-xs text-white/40 mt-1">
          PDF, DOC, XLS, imagens, XML, JSON — sem limite de quantidade
        </p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/50 uppercase tracking-wider">
            Arquivos para análise ({uploadedFiles.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs"
              >
                <FileText className="w-3 h-3" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <span className="text-amber-500/60">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }} 
                  className="hover:text-white ml-1"
                  disabled={isAnalyzing}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
