import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Search, Eye, Download, RefreshCw, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ComprovanteItem {
  id: number;
  voucher_id: number;
  numero_spo: string;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
  forma_pagamento?: string;
  valor?: number;
}

export function ComprovantesTab() {
  const { toast } = useToast();
  const [comprovantes, setComprovantes] = useState<ComprovanteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");

  const loadComprovantes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "list_comprovantes",
        },
      });

      if (error) throw error;

      if (data?.comprovantes) {
        setComprovantes(data.comprovantes);
      }
    } catch (err: any) {
      console.error("Erro ao carregar comprovantes:", err);
      toast({
        title: "Erro ao carregar comprovantes",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComprovantes();
  }, []);

  const filteredComprovantes = comprovantes.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.numero_spo?.toLowerCase().includes(term) ||
      c.file_name?.toLowerCase().includes(term)
    );
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handlePreview = (url: string, name: string) => {
    setPreviewUrl(url);
    setPreviewName(name);
  };

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isPdf = (fileName: string) => {
    return fileName?.toLowerCase().endsWith(".pdf");
  };

  const isImage = (fileName: string) => {
    const ext = fileName?.toLowerCase();
    return ext?.endsWith(".jpg") || ext?.endsWith(".jpeg") || ext?.endsWith(".png") || ext?.endsWith(".webp");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Comprovantes Anexados</CardTitle>
                <CardDescription>
                  Visualize todos os comprovantes de pagamento anexados aos vouchers
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadComprovantes}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por SPO ou nome do arquivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-input/50 border-border/50"
              />
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Total: <strong className="text-foreground">{comprovantes.length}</strong></span>
            <span>Exibindo: <strong className="text-foreground">{filteredComprovantes.length}</strong></span>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredComprovantes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum comprovante encontrado</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>SPO</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Data Upload</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Forma Pgto</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredComprovantes.map((comp) => (
                    <TableRow key={comp.id} className="hover:bg-muted/20">
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {comp.numero_spo}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 max-w-[200px]">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate text-sm" title={comp.file_name}>
                            {comp.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {comp.created_at
                            ? format(new Date(comp.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {comp.file_size ? formatFileSize(comp.file_size) : "-"}
                      </TableCell>
                      <TableCell>
                        {comp.forma_pagamento ? (
                          <Badge variant="secondary" className="text-xs">
                            {comp.forma_pagamento}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {comp.valor
                          ? `R$ ${comp.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlePreview(comp.file_url, comp.file_name)}
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDownload(comp.file_url, comp.file_name)}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewName}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[70vh]">
            {previewUrl && isPdf(previewName) && (
              <iframe
                src={previewUrl}
                className="w-full h-[65vh] border rounded-lg"
                title={previewName}
              />
            )}
            {previewUrl && isImage(previewName) && (
              <img
                src={previewUrl}
                alt={previewName}
                className="max-w-full h-auto mx-auto rounded-lg"
              />
            )}
            {previewUrl && !isPdf(previewName) && !isImage(previewName) && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-16 w-16 mb-4" />
                <p>Pré-visualização não disponível para este tipo de arquivo</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => handleDownload(previewUrl, previewName)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Fazer Download
                </Button>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
