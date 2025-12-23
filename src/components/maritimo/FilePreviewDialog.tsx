import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Loader2, AlertCircle } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  fileUrl?: string;
  fileName: string;
}

export const FilePreviewDialog = ({
  open,
  onOpenChange,
  file,
  fileUrl,
  fileName,
}: FilePreviewDialogProps) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && file) {
      // Create blob URL for local file
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setIsLoading(false);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else if (open && fileUrl) {
      setPdfUrl(fileUrl);
      setIsLoading(false);
    }
  }, [open, file, fileUrl]);

  useEffect(() => {
    if (!open) {
      setNumPages(null);
      setPageNumber(1);
      setScale(1.0);
      setError(null);
      setIsLoading(true);
    }
  }, [open]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  const onDocumentLoadError = (err: Error) => {
    console.error("PDF load error:", err);
    setError("Não foi possível carregar o PDF");
    setIsLoading(false);
  };

  const handleDownload = () => {
    if (file) {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (fileUrl) {
      window.open(fileUrl, "_blank");
    }
  };

  const isPdf = fileName.toLowerCase().endsWith(".pdf");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-background border-border">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-foreground flex items-center justify-between">
            <span className="truncate pr-4">{fileName}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="flex-shrink-0"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {isPdf && pdfUrl && (
            <>
              {/* PDF Controls */}
              <div className="flex items-center justify-center gap-4 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                    disabled={pageNumber <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                    {pageNumber} / {numPages || "..."}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPageNumber((p) => Math.min(numPages || p, p + 1))}
                    disabled={pageNumber >= (numPages || 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="w-px h-6 bg-border" />

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                    disabled={scale <= 0.5}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[50px] text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setScale((s) => Math.min(2, s + 0.25))}
                    disabled={scale >= 2}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-muted/30">
                {isLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Carregando PDF...</span>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-5 h-5" />
                    <span>{error}</span>
                  </div>
                )}
                {!error && (
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={null}
                    className="shadow-lg"
                  >
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      className="bg-white"
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                    />
                  </Document>
                )}
              </div>
            </>
          )}

          {!isPdf && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Preview não disponível para este tipo de arquivo.</p>
                <p className="text-sm mt-2">Use o botão Download para baixar o arquivo.</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
