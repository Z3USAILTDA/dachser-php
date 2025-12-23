import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Download, Loader2, ExternalLink, FileText } from "lucide-react";
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
  const [pdfError, setPdfError] = useState(false);

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

    setPdfError(false);
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

  const handleOpenInNewTab = () => {
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  };

  const formatXML = (xml: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, "text/xml");
      const serializer = new XMLSerializer();
      let formatted = serializer.serializeToString(xmlDoc);
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
          onClick={handleOpenInNewTab}
          className="gap-2"
          title="Abrir em nova aba"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDownload}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 [&>button]:hidden">
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold truncate max-w-md">{fileName}</DialogTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewTab}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir em Nova Aba
                </Button>
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
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden min-h-0">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {!loading && isPDF && !pdfError && (
              <div className="w-full h-full flex flex-col">
                <object
                  data={fileUrl}
                  type="application/pdf"
                  className="w-full flex-1"
                  onError={() => setPdfError(true)}
                >
                  {/* Fallback for browsers that can't display PDF */}
                  <div className="flex flex-col items-center justify-center h-full p-8 bg-muted/30">
                    <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium text-foreground mb-2">
                      Visualização não disponível
                    </p>
                    <p className="text-muted-foreground text-center mb-6">
                      Seu navegador não suporta visualização de PDF incorporada.
                    </p>
                    <div className="flex gap-3">
                      <Button onClick={handleOpenInNewTab} className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Abrir em Nova Aba
                      </Button>
                      <Button variant="outline" onClick={onDownload} className="gap-2">
                        <Download className="h-4 w-4" />
                        Baixar PDF
                      </Button>
                    </div>
                  </div>
                </object>
              </div>
            )}

            {!loading && isPDF && pdfError && (
              <div className="flex flex-col items-center justify-center h-full p-8 bg-muted/30">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">
                  Erro ao carregar PDF
                </p>
                <p className="text-muted-foreground text-center mb-6">
                  Não foi possível exibir o PDF nesta janela.
                </p>
                <div className="flex gap-3">
                  <Button onClick={handleOpenInNewTab} className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Abrir em Nova Aba
                  </Button>
                  <Button variant="outline" onClick={onDownload} className="gap-2">
                    <Download className="h-4 w-4" />
                    Baixar PDF
                  </Button>
                </div>
              </div>
            )}

            {!loading && isImage && (
              <div className="flex items-center justify-center h-full p-6 bg-muted/30 overflow-auto">
                <img 
                  src={fileUrl} 
                  alt={fileName} 
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
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
