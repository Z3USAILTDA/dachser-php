import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Download, Loader2, FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
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
    setPageNumber(1);
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

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error("Erro ao carregar PDF:", error);
    setPdfError(true);
    setLoading(false);
  }, []);

  const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages));
  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));

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
                {isPDF && numPages > 0 && (
                  <div className="flex items-center gap-2 mr-4">
                    <Button variant="outline" size="icon" onClick={zoomOut} disabled={scale <= 0.5}>
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[4rem] text-center">
                      {Math.round(scale * 100)}%
                    </span>
                    <Button variant="outline" size="icon" onClick={zoomIn} disabled={scale >= 3}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                )}
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

            {isPDF && !pdfError && (
              <div className="w-full h-full flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="flex justify-center p-4 bg-muted/30">
                    <Document
                      file={fileUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={onDocumentLoadError}
                      loading={
                        <div className="flex items-center justify-center py-20">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      }
                    >
                      <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        loading={
                          <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        }
                      />
                    </Document>
                  </div>
                </ScrollArea>
                
                {numPages > 1 && (
                  <div className="flex items-center justify-center gap-4 py-3 border-t border-border bg-background">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={goToPrevPage}
                      disabled={pageNumber <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Página {pageNumber} de {numPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={goToNextPage}
                      disabled={pageNumber >= numPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {isPDF && pdfError && (
              <div className="flex flex-col items-center justify-center h-full p-8 bg-muted/30">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">
                  Erro ao carregar PDF
                </p>
                <p className="text-muted-foreground text-center mb-6">
                  Não foi possível exibir o PDF nesta janela.
                </p>
                <Button onClick={onDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  Baixar PDF
                </Button>
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