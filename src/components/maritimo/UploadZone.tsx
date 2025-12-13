import { Upload, Clipboard, Loader2 } from "lucide-react";
import { useCallback, useState, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  description?: string;
}

function dataURLtoFile(dataUrl: string, filename: string): File | null {
  try {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch {
    return null;
  }
}

function extractFilesFromHtml(html: string): File[] {
  const files: File[] = [];
  const imgRegex = /<img[^>]+src="data:([^"]+)"/gi;
  let match;
  let counter = 1;
  
  while ((match = imgRegex.exec(html)) !== null) {
    const dataUrl = `data:${match[1]}`;
    const ext = match[1].split(';')[0].split('/')[1] || 'png';
    const file = dataURLtoFile(dataUrl, `image_${counter}.${ext}`);
    if (file && file.size > 100) {
      files.push(file);
      counter++;
    }
  }
  
  return files;
}

async function extractFromDataTransfer(dataTransfer: DataTransfer): Promise<{
  files: File[];
  emailText?: string;
  htmlContent?: string;
}> {
  const result: { files: File[]; emailText?: string; htmlContent?: string } = { files: [] };
  
  if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.size > 0) {
          result.files.push(file);
        }
      }
    }
  }
  
  if (result.files.length === 0 && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file.size > 0) {
        result.files.push(file);
      }
    }
  }
  
  try {
    const htmlData = dataTransfer.getData('text/html');
    if (htmlData && htmlData.length > 100) {
      result.htmlContent = htmlData;
      const embeddedFiles = extractFilesFromHtml(htmlData);
      if (embeddedFiles.length > 0) {
        result.files.push(...embeddedFiles);
      }
    }
  } catch (e) {
    console.log('Could not get HTML data:', e);
  }
  
  try {
    const textData = dataTransfer.getData('text/plain');
    if (textData && textData.length > 50) {
      result.emailText = textData;
    }
  } catch (e) {
    console.log('Could not get text data:', e);
  }
  
  return result;
}

async function extractFromClipboard(clipboardData: DataTransfer): Promise<File[]> {
  const files: File[] = [];
  
  if (clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file.size > 0) {
        files.push(file);
      }
    }
  }
  
  if (clipboardData.items) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.size > 0 && !files.some(f => f.name === file.name)) {
          files.push(file);
        }
      }
    }
  }
  
  try {
    const html = clipboardData.getData('text/html');
    if (html) {
      const embeddedFiles = extractFilesFromHtml(html);
      files.push(...embeddedFiles);
    }
  } catch (e) {
    // Ignore
  }
  
  return files;
}

export const UploadZone = ({
  onFilesSelected,
  accept = "*",
  multiple = true,
  label = "Arraste e solte ou clique para enviar",
  description = "Aceitos: todos os formatos"
}: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showPasteHint, setShowPasteHint] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      
      const files = await extractFromClipboard(e.clipboardData);
      
      if (files.length > 0) {
        e.preventDefault();
        toast({
          title: "Arquivos colados",
          description: `${files.length} arquivo(s) adicionado(s) via Ctrl+V`,
        });
        onFilesSelected(files);
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onFilesSelected]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const types = Array.from(e.dataTransfer.types || []);
    
    if (types.includes('attachment')) {
      try {
        const attachmentData = e.dataTransfer.getData('attachment');
        const parsed = JSON.parse(attachmentData);
        const files = parsed?.attachmentFiles || [];
        
        toast({
          title: "📎 Anexo detectado: " + (files[0]?.name || 'arquivo'),
          description: "O Outlook Web não permite arrastar anexos diretamente. Baixe primeiro e arraste da pasta Downloads.",
          variant: "destructive",
          duration: 8000,
        });
        setShowPasteHint(true);
        setTimeout(() => setShowPasteHint(false), 15000);
        return;
      } catch (err) {
        console.log('Error parsing attachment data:', err);
      }
    }
    
    const extracted = await extractFromDataTransfer(e.dataTransfer);
    
    if (extracted.files.length > 0) {
      const validFiles = extracted.files.filter(f => f.size > 0);
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
        return;
      }
    }
    
    const emptyFiles = Array.from(e.dataTransfer.files).filter(f => f.size === 0);
    const hasFileListType = types.includes('Files');
    
    if (emptyFiles.length > 0 || (hasFileListType && extracted.files.length === 0)) {
      toast({
        title: "⚠️ Arquivo não acessível",
        description: "O navegador não conseguiu acessar o conteúdo. Baixe o arquivo primeiro e arraste da pasta Downloads.",
        variant: "destructive",
        duration: 8000,
      });
      setShowPasteHint(true);
      setTimeout(() => setShowPasteHint(false), 15000);
      return;
    }
    
    if (extracted.emailText || extracted.htmlContent) {
      const content = extracted.htmlContent || extracted.emailText || '';
      if (content.length > 100) {
        const emailFile = new File(
          [content], 
          `email_content_${Date.now()}.${extracted.htmlContent ? 'html' : 'txt'}`,
          { type: extracted.htmlContent ? 'text/html' : 'text/plain' }
        );
        
        toast({
          title: "Conteúdo de email capturado",
          description: "O texto do email foi extraído. Para anexos, baixe-os primeiro.",
        });
        
        onFilesSelected([emailFile]);
        return;
      }
    }
    
    toast({
      title: "Nenhum arquivo detectado",
      description: "Baixe o anexo primeiro, depois arraste o arquivo baixado.",
      variant: "destructive",
    });
  }, [onFilesSelected]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(f => f.size > 0);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    }
    e.target.value = '';
  }, [onFilesSelected]);

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-xl bg-black/60 hover:bg-black/70 transition-all cursor-pointer p-12 text-center relative ${
        isDragging 
          ? 'border-primary bg-primary/10' 
          : 'border-white/10 hover:border-primary'
      }`}
    >
      <input
        type="file"
        id="file-upload-sea"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
      />
      <label htmlFor="file-upload-sea" className="cursor-pointer flex flex-col items-center gap-4">
        {isProcessing ? (
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        ) : (
          <Upload className={`w-12 h-12 ${isDragging ? 'text-primary' : 'text-neutral-400'}`} />
        )}
        <div>
          {isProcessing ? (
            <p className="text-primary font-medium mb-2 animate-pulse">Processando...</p>
          ) : (
            <>
              <p className="text-foreground font-medium mb-2">{label}</p>
              <p className="text-neutral-400 text-sm">{description}</p>
              <p className="text-neutral-500 text-xs mt-2 flex items-center justify-center gap-1">
                <Clipboard className="w-3 h-3" />
                <span>Ctrl+V para colar</span>
              </p>
            </>
          )}
          {isDragging && (
            <p className="text-primary text-sm mt-2 animate-pulse">Solte para adicionar</p>
          )}
          {showPasteHint && (
            <p className="text-primary text-sm mt-2 animate-pulse font-semibold">
              💡 Baixe o anexo primeiro e arraste da pasta Downloads!
            </p>
          )}
        </div>
      </label>
    </div>
  );
};
