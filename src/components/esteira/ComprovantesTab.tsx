import { useState, useEffect, useMemo } from "react";
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

interface VoucherGroup {
  voucher_id: number;
  numero_spo: string;
  fornecedor?: string;
  tipo_documento?: string;
  valor?: number;
  forma_pagamento?: string;
  docs: ComprovanteItem[];
  lastUpload: string;
}

export function ComprovantesTab() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [comprovantes, setComprovantes] = useState<ComprovanteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<VoucherGroup | null>(null);

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

  const grouped = useMemo<VoucherGroup[]>(() => {
    const map = new Map<number, VoucherGroup>();
    for (const c of comprovantes) {
      const existing = map.get(c.voucher_id);
      if (existing) {
        existing.docs.push(c);
        if (c.created_at > existing.lastUpload) existing.lastUpload = c.created_at;
      } else {
        map.set(c.voucher_id, {
          voucher_id: c.voucher_id,
          numero_spo: c.numero_spo,
          fornecedor: c.fornecedor,
          tipo_documento: c.tipo_documento,
          valor: c.valor,
          forma_pagamento: c.forma_pagamento,
          docs: [c],
          lastUpload: c.created_at,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastUpload.localeCompare(a.lastUpload));
  }, [comprovantes]);

  const filteredGroups = grouped.filter((g) => {
    const term = searchTerm.toLowerCase();
    return (
      g.numero_spo?.toLowerCase().includes(term) ||
      g.fornecedor?.toLowerCase().includes(term) ||
      g.docs.some(d => d.file_name?.toLowerCase().includes(term))
    );
  });

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                <CardTitle>Comprovantes por Voucher</CardTitle>
                <CardDescription>
                  Vouchers concluídos agrupados com seus comprovantes
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
                placeholder="Buscar por SPO, fornecedor ou arquivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-input/50 border-border/50"
              />
            </div>
          </div>

          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Vouchers: <strong className="text-foreground">{filteredGroups.length}</strong></span>
            <span>Documentos: <strong className="text-foreground">{comprovantes.length}</strong></span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredGroups.length === 0 ? (
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
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Tipo Doc</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Documentos</TableHead>
                    <TableHead>Último Upload</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <TableRow key={group.voucher_id} className="hover:bg-muted/20">
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {group.numero_spo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate" title={group.fornecedor}>
                        {group.fornecedor || "-"}
                      </TableCell>
                      <TableCell>
                        {group.tipo_documento ? (
                          <Badge variant="secondary" className="text-xs">
                            {group.tipo_documento}
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {group.valor
                          ? `R$ ${group.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <Files className="h-3 w-3" />
                          {group.docs.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {group.lastUpload
                            ? format(new Date(group.lastUpload), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver documentos do voucher"
                            onClick={() => setSelectedGroup(group)}
                          >
                            <Files className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver detalhes do voucher"
                            onClick={() => navigate(`/fin/esteira/voucher/${group.voucher_id}`)}
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

      {/* Dialog: documentos do voucher */}
      <Dialog open={!!selectedGroup} onOpenChange={() => setSelectedGroup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Documentos — {selectedGroup?.numero_spo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {selectedGroup?.docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.tipo_anexo?.replace(/_/g, " ")} • {doc.created_at ? format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ""}
                    </p>
                  </div>
                </div>
                <FilePreview
                  fileName={doc.file_name}
                  fileUrl={doc.file_url}
                  fileType={doc.tipo_anexo || "OUTROS"}
                  onDownload={() => handleDownload(doc.file_url, doc.file_name)}
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
