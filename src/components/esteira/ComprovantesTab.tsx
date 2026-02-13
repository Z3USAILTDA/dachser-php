import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Search, RefreshCw, Calendar, Loader2, Eye, Files } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FilePreview } from "./FilePreview";

interface ComprovanteItem {
  id: number;
  voucher_id: number;
  numero_spo: string;
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
  tipo_anexo?: string;
  forma_pagamento?: string;
  valor?: number;
  fornecedor?: string;
  tipo_documento?: string;
}

export function ComprovantesTab() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [comprovantes, setComprovantes] = useState<ComprovanteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [docsDialogVoucherId, setDocsDialogVoucherId] = useState<string | null>(null);
  const [docsForDialog, setDocsForDialog] = useState<ComprovanteItem[]>([]);

  const loadComprovantes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "list_comprovantes" },
      });
      if (error) throw error;
      if (data?.comprovantes) {
        setComprovantes(data.comprovantes);
      }
    } catch (err: any) {
      console.error("Erro ao carregar comprovantes:", err);
      toast({ title: "Erro ao carregar comprovantes", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadComprovantes(); }, []);

  const filteredComprovantes = comprovantes.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.numero_spo?.toLowerCase().includes(term) ||
      c.file_name?.toLowerCase().includes(term) ||
      c.fornecedor?.toLowerCase().includes(term)
    );
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

  const handleShowDocs = (voucherId: string) => {
    const docs = comprovantes.filter(c => String(c.voucher_id) === String(voucherId));
    setDocsForDialog(docs);
    setDocsDialogVoucherId(voucherId);
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
                <CardTitle>Documentos Anexados</CardTitle>
                <CardDescription>
                  Visualize todos os documentos anexados aos vouchers
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadComprovantes} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por SPO, arquivo ou fornecedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-input/50 border-border/50"
              />
            </div>
          </div>

          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Total: <strong className="text-foreground">{comprovantes.length}</strong></span>
            <span>Exibindo: <strong className="text-foreground">{filteredComprovantes.length}</strong></span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredComprovantes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum documento encontrado</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>SPO</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Tipo Doc</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Tipo Anexo</TableHead>
                    <TableHead>Data Upload</TableHead>
                    <TableHead>Tamanho</TableHead>
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
                      <TableCell className="text-sm max-w-[150px] truncate" title={comp.fornecedor}>
                        {comp.fornecedor || "-"}
                      </TableCell>
                      <TableCell>
                        {comp.tipo_documento ? (
                          <Badge variant="secondary" className="text-xs">
                            {comp.tipo_documento}
                          </Badge>
                        ) : "-"}
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
                        {comp.tipo_anexo ? (
                          <Badge variant="outline" className="text-xs">
                            {comp.tipo_anexo.replace(/_/g, " ")}
                          </Badge>
                        ) : "-"}
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
                      <TableCell className="text-sm">
                        {comp.valor
                          ? `R$ ${comp.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <FilePreview
                            fileName={comp.file_name}
                            fileUrl={comp.file_url}
                            fileType="COMPROVANTE"
                            onDownload={() => handleDownload(comp.file_url, comp.file_name)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver todos os documentos do voucher"
                            onClick={() => handleShowDocs(String(comp.voucher_id))}
                          >
                            <Files className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver detalhes do voucher"
                            onClick={() => navigate(`/fin/esteira/voucher/${comp.voucher_id}`)}
                          >
                            <Eye className="h-4 w-4" />
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

      {/* Dialog: todos os documentos do voucher */}
      <Dialog open={!!docsDialogVoucherId} onOpenChange={() => setDocsDialogVoucherId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Documentos do Voucher {docsForDialog[0]?.numero_spo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {docsForDialog.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum documento</p>
            ) : (
              docsForDialog.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">{doc.tipo_anexo?.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <FilePreview
                    fileName={doc.file_name}
                    fileUrl={doc.file_url}
                    fileType={doc.tipo_anexo || "OUTROS"}
                    onDownload={() => handleDownload(doc.file_url, doc.file_name)}
                  />
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
