import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Download, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FilePreviewProps {
  fileName: string;
  fileUrl: string;
  fileType: string;
  onDownload: () => void;
}

export const FilePreview = ({ fileName, fileUrl, fileType, onDownload }: FilePreviewProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [xmlContent, setXmlContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const lowerName = fileName.toLowerCase();
  const isPDF = lowerName.endsWith('.pdf');
  const isXML = lowerName.endsWith('.xml');
  const isImage = lowerName.endsWith('.jpg') || 
                  lowerName.endsWith('.jpeg') || 
                  lowerName.endsWith('.png') || 
                  lowerName.endsWith('.gif') || 
                  lowerName.endsWith('.webp');
  const canPreview = isPDF || isXML || isImage;

  const handlePreview = async () => {
    if (!canPreview) return;

    setIsOpen(true);

    if (isXML && !xmlContent) {
      setLoading(true);
      try {
        const response = await fetch(fileUrl);
        const text = await response.text();
        setXmlContent(text);
      } catch (error) {
        console.error("Erro ao carregar XML:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const formatXML = (xml: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, "text/xml");
      const serializer = new XMLSerializer();
      let formatted = serializer.serializeToString(xmlDoc);
      
      // Adicionar indentação básica
      formatted = formatted.replace(/></g, '>\n<');
      
      return formatted;
    } catch (error) {
      return xml;
    }
  };

  if (!canPreview) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onDownload}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        Baixar
      </Button>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePreview}
          className="gap-2 text-primary hover:text-primary hover:bg-primary/10"
        >
          <Eye className="h-4 w-4" />
          Visualizar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDownload}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Baixar
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 [&>button]:hidden">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold">{fileName}</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Baixar
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {!loading && isPDF && (
              <div className="w-full h-full flex flex-col">
                {/* Iframe com fallback automático */}
                <iframe
                  src={`${fileUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                  className="w-full flex-1 border-0"
                  title={fileName}
                  onError={() => {
                    // Se iframe falhar, abre em nova aba automaticamente
                    window.open(fileUrl, '_blank');
                  }}
                />
                {/* Botões de ação sempre visíveis */}
                <div className="flex items-center justify-center gap-3 p-4 bg-muted/30 border-t border-border">
                  <Button
                    variant="default"
                    onClick={() => window.open(fileUrl, '_blank')}
                    className="gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Abrir em Nova Aba
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onDownload}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Baixar PDF
                  </Button>
                </div>
              </div>
            )}

            {!loading && isImage && (
              <div className="flex items-center justify-center h-full p-6 bg-muted/30">
                <img 
                  src={fileUrl} 
                  alt={fileName} 
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              </div>
            )}

            {!loading && isXML && (
              <ScrollArea className="h-full px-6 py-4">
                <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto">
                  <code className="text-foreground">
                    {formatXML(xmlContent)}
                  </code>
                </pre>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
