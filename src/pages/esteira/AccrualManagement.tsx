import { useState, useEffect, useRef } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, FileSpreadsheet, RefreshCw, Search, Info, AlertCircle, DollarSign } from "lucide-react";
import { HelpButton } from "@/components/esteira/HelpButton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

interface AccrualEntry {
  id: string;
  fornecedor: string;
  valor: number;
  shared_code: string | null;
  status_accrual: string;
  data_upload: string;
  created_at: string;
}

const AccrualManagement = () => {
  const [entries, setEntries] = useState<AccrualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadEntries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("accrual_entries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar accruals",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];

    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv")) {
      toast({
        title: "Formato inválido",
        description: "Envie um arquivo Excel (.xlsx, .xls) ou CSV",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];

      if (jsonData.length === 0) {
        toast({
          title: "Arquivo vazio",
          description: "O arquivo não contém dados",
          variant: "destructive",
        });
        return;
      }

      // Map expected columns
      const entriesData = jsonData.map((row) => ({
        fornecedor: row["fornecedor"] || row["Fornecedor"] || row["FORNECEDOR"] || "N/A",
        valor: parseFloat(row["valor"] || row["Valor"] || row["VALOR"] || "0"),
        shared_code: row["shared_code"] || row["Shared Code"] || row["SHARED_CODE"] || row["referencia"] || null,
        status_accrual: row["status"] || row["Status"] || row["STATUS"] || "ATIVO",
        uploaded_by_user_id: user.id,
      }));

      const validEntries = entriesData.filter((e) => e.fornecedor && e.valor > 0);

      if (validEntries.length === 0) {
        toast({
          title: "Nenhum dado válido",
          description: "Verifique se o arquivo possui as colunas: fornecedor, valor, shared_code (opcional)",
          variant: "destructive",
        });
        return;
      }

      const { error: insertError } = await supabase
        .from("accrual_entries")
        .insert(validEntries as any);

      if (insertError) throw insertError;

      toast({
        title: "Upload concluído!",
        description: `${validEntries.length} registros importados com sucesso`,
      });

      loadEntries();
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;

    try {
      const { error } = await supabase
        .from("accrual_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setEntries(prev => prev.filter(e => e.id !== id));
      toast({ title: "Registro excluído!" });
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Tem certeza que deseja excluir TODOS os registros de accrual?")) return;

    try {
      const { error } = await supabase
        .from("accrual_entries")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

      if (error) throw error;
      setEntries([]);
      toast({ title: "Todos os registros foram excluídos!" });
    } catch (error: any) {
      toast({
        title: "Erro ao limpar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.fornecedor.toLowerCase().includes(term) ||
      (e.shared_code || "").toLowerCase().includes(term)
    );
  });

  const totalValor = filteredEntries.reduce((acc, e) => acc + e.valor, 0);

  return (
    <PageLayout backTo="/fin/esteira" rightContent={<HelpButton />}>
      <PageHeader
        title="Gestão de Accrual"
        subtitle="Upload e gerenciamento da base de provisões (conciliação)"
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Info Card */}
        <Card className="border-info/30 bg-info/5">
          <CardContent className="py-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Como funciona a conciliação</p>
                <p>
                  Faça o upload da planilha de accrual (diária ou semanal). O sistema irá cruzar automaticamente 
                  os valores com as faturas dos vouchers para identificar: <strong className="text-green-500">Match OK</strong>, 
                  <strong className="text-warning"> Match Parcial</strong> ou <strong className="text-destructive"> Sem Accrual</strong>.
                </p>
                <p className="mt-2">
                  <strong>Colunas esperadas:</strong> fornecedor, valor, shared_code (opcional), status (opcional)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload e Ações */}
        <Card className="bg-card/60 border-border/50">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4 items-end justify-between">
              <div className="flex gap-4 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">Upload de Planilha</Label>
                  <div className="flex gap-2 mt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Excel/CSV
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={loadEntries} disabled={loading}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                      Atualizar
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 items-end">
                <div className="min-w-[200px]">
                  <Label className="text-xs text-muted-foreground">Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Fornecedor ou código..."
                      className="pl-9"
                    />
                  </div>
                </div>
                {entries.length > 0 && (
                  <Button variant="destructive" onClick={handleClearAll}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Limpar Tudo
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-card/60 border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-primary/20">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Total Registros</p>
                  <p className="text-2xl font-bold">{filteredEntries.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-info/20">
                  <AlertCircle className="h-5 w-5 text-info" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Valor Total Provisionado</p>
                  <p className="text-2xl font-bold">
                    R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-green-500/20">
                  <Upload className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Último Upload</p>
                  <p className="text-sm font-medium">
                    {entries.length > 0
                      ? format(new Date(entries[0].created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : "Nenhum"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabela */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Base de Accrual</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum registro de accrual encontrado</p>
                <p className="text-sm mt-1">Faça o upload de uma planilha para começar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Shared Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data Upload</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.fornecedor}</TableCell>
                      <TableCell>
                        R$ {entry.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {entry.shared_code || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={entry.status_accrual === "ATIVO" ? "default" : "secondary"}
                        >
                          {entry.status_accrual}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </PageLayout>
  );
};

export default AccrualManagement;
