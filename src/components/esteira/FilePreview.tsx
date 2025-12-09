import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Download, ExternalLink } from "lucide-react";

interface FilePreviewProps {
  fileName: string;
  fileUrl: string;
  fileType: string;
  onDownload: () => void;
}

export const FilePreview = ({ fileName, fileUrl, fileType, onDownload }: FilePreviewProps) => {
  const [showPreview, setShowPreview] = useState(false);

  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);

  const handlePreview = () => {
    if (isPdf || isImage) {
      setShowPreview(true);
    } else {
      // Open in new tab for other file types
      window.open(fileUrl, '_blank');
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePreview}
          title="Visualizar"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDownload}
          title="Baixar"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(fileUrl, '_blank')}
          title="Abrir em nova aba"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{fileName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {isPdf ? (
              <iframe
                src={fileUrl}
                className="w-full h-[70vh] border-0 rounded-lg"
                title={fileName}
              />
            ) : isImage ? (
              <img
                src={fileUrl}
                alt={fileName}
                className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p>Visualização não disponível para este tipo de arquivo.</p>
                <Button
                  variant="outline"
                  onClick={() => window.open(fileUrl, '_blank')}
                  className="mt-4"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir em nova aba
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
