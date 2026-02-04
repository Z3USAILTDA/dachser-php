import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  parseExcelMasterFile,
  extractTipoProcesso,
  isValidExcelFile,
  getFileFormatDescription,
  ACCEPT_STRING,
  DB_COLUMNS,
  type MasterRow,
  type ColumnMapping,
  type ParseValidationError,
  type TipoProcesso,
} from "@/lib/parseExcelMaster";

export default function UploadMaster() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  // Estados do upload
  const [file, setFile] = useState<File | null>(null);
  const [tipoProcesso, setTipoProcesso] = useState<TipoProcesso | null>(null);
  const [fileFormat, setFileFormat] = useState<string>("");

  // Estados do parsing
  const [isValidating, setIsValidating] = useState(false);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [unmappedColumns, setUnmappedColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<MasterRow[]>([]);
  const [allRows, setAllRows] = useState<MasterRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<ParseValidationError[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Estados da importação
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    rejected: number;
    errors: Array<{ index: number; message: string }>;
  } | null>(null);

  // Verificar permissão admin
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const adminStatus = parsed.is_admin === 1 || parsed.is_admin === "1";
      if (!adminStatus) {
        toast.error("Acesso não autorizado");
        navigate("/dashboard");
        return;
      }
      setIsAdmin(true);
    } else {
      navigate("/");
    }
  }, [navigate]);

  // Handler de seleção de arquivo
  const handleFileSelect = useCallback((selectedFile: File) => {
    // Reset estados
    setColumnMappings([]);
    setUnmappedColumns([]);
    setPreviewRows([]);
    setAllRows([]);
    setValidationErrors([]);
    setImportResult(null);
    setTotalRows(0);

    // Validar extensão
    if (!isValidExcelFile(selectedFile)) {
      toast.error("Formato de arquivo não suportado");
      setFile(null);
      setTipoProcesso(null);
      return;
    }

    // Validar tamanho (20MB)
    if (selectedFile.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 20MB)");
      setFile(null);
      setTipoProcesso(null);
      return;
    }

    // Extrair tipo_processo do nome
    const tipo = extractTipoProcesso(selectedFile.name);
    if (!tipo) {
      toast.error(
        "Nome do arquivo deve conter AIR ou SEA e IMPORT ou EXPORT. Ex: 'Air Export 03fev.xlsx'"
      );
      setFile(null);
      setTipoProcesso(null);
      return;
    }

    setFile(selectedFile);
    setTipoProcesso(tipo);
    setFileFormat(getFileFormatDescription(selectedFile.name));
  }, []);

  // Handler de drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Handler de input file
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  // Validar e pré-visualizar
  const handleValidate = async () => {
    if (!file || !tipoProcesso) return;

    setIsValidating(true);
    try {
      const result = await parseExcelMasterFile(file, tipoProcesso);

      setColumnMappings(result.columnMappings);
      setUnmappedColumns(result.unmappedColumns);
      setPreviewRows(result.previewRows);
      setAllRows(result.rows);
      setValidationErrors(result.errors);
      setTotalRows(result.totalRows);

      if (!result.success && result.errors.length > 0) {
        toast.warning(`${result.errors.length} linha(s) com problemas`);
      } else {
        toast.success(`${result.totalRows} linhas prontas para importação`);
      }
    } catch (error) {
      console.error("Erro ao processar arquivo:", error);
      toast.error("Erro ao processar arquivo");
    } finally {
      setIsValidating(false);
    }
  };

  // Atualizar mapeamento de coluna
  const handleMappingChange = (excelColumn: string, newDbColumn: string) => {
    setColumnMappings((prev) =>
      prev.map((m) =>
        m.excelColumn === excelColumn ? { ...m, dbColumn: newDbColumn } : m
      )
    );
  };

  // Importar dados
  const handleImport = async () => {
    if (!tipoProcesso || allRows.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      // Filtrar linhas válidas (que não estão em erro)
      const errorRows = new Set(validationErrors.map((e) => e.row - 2)); // -2 porque row é baseado em linha do Excel
      const validRows = allRows.filter((_, idx) => !errorRows.has(idx));

      if (validRows.length === 0) {
        toast.error("Nenhuma linha válida para importar");
        setIsImporting(false);
        return;
      }

      // Fazer requisição para o edge function
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "bulk_insert_master",
          rows: validRows,
          modal: tipoProcesso.modal,
        },
      });

      if (error) {
        throw error;
      }

      setImportResult({
        inserted: data.inserted || 0,
        rejected: data.rejected || 0,
        errors: data.errors || [],
      });

      if (data.inserted > 0) {
        toast.success(`${data.inserted} registro(s) importado(s) com sucesso!`);
      }

      if (data.rejected > 0) {
        toast.warning(`${data.rejected} registro(s) rejeitado(s)`);
      }
    } catch (error) {
      console.error("Erro na importação:", error);
      toast.error("Erro ao importar dados");
    } finally {
      setIsImporting(false);
      setImportProgress(100);
    }
  };

  // Limpar e recomeçar
  const handleReset = () => {
    setFile(null);
    setTipoProcesso(null);
    setFileFormat("");
    setColumnMappings([]);
    setUnmappedColumns([]);
    setPreviewRows([]);
    setAllRows([]);
    setValidationErrors([]);
    setImportResult(null);
    setTotalRows(0);
    setImportProgress(0);
  };

  // Verificar se uma linha tem erro
  const rowHasError = (rowIndex: number) => {
    return validationErrors.some((e) => e.row === rowIndex + 2);
  };

  // Obter erro de uma linha
  const getRowError = (rowIndex: number) => {
    return validationErrors.find((e) => e.row === rowIndex + 2)?.message;
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <PageLayout
      title="Upload Master (Air/Sea)"
      subtitle="Importação de planilhas para t_air_master ou t_sea_master"
      backTo="/dashboard"
    >
      <div className="space-y-6">
        {/* Upload Zone */}
        {!file && (
          <PageCard>
            <h3 className="text-lg font-semibold text-foreground mb-4">Upload de Arquivo</h3>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <input
                type="file"
                accept={ACCEPT_STRING}
                onChange={handleInputChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium text-foreground mb-2">
                  Arraste ou clique para selecionar
                </p>
                <p className="text-sm text-muted-foreground">
                  Formatos aceitos: Excel (.xlsx, .xls, .xlsm, .xlsb), CSV, ODS
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  O nome do arquivo deve conter AIR ou SEA e IMPORT ou EXPORT
                </p>
              </label>
            </div>
          </PageCard>
        )}

        {/* Arquivo Selecionado */}
        {file && tipoProcesso && (
          <PageCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Arquivo Selecionado</h3>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <X className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{fileFormat}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={tipoProcesso.modal === "AIR" ? "default" : "secondary"}
                  className="text-sm px-3 py-1"
                >
                  {tipoProcesso.full}
                </Badge>
                {!columnMappings.length && (
                  <Button onClick={handleValidate} disabled={isValidating}>
                    {isValidating ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Validar e Pré-visualizar
                  </Button>
                )}
              </div>
            </div>
          </PageCard>
        )}

        {/* Mapeamento de Colunas */}
        {columnMappings.length > 0 && (
          <PageCard>
            <h3 className="text-lg font-semibold text-foreground mb-4">Mapa de Campos Detectado</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coluna no Excel</TableHead>
                    <TableHead>Mapeado para</TableHead>
                    <TableHead>Ajustar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnMappings.map((mapping) => (
                    <TableRow key={mapping.excelColumn}>
                      <TableCell className="font-medium">
                        {mapping.originalHeader}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{mapping.dbColumn}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping.dbColumn}
                          onValueChange={(value) =>
                            handleMappingChange(mapping.excelColumn, value)
                          }
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DB_COLUMNS.map((col) => (
                              <SelectItem key={col} value={col}>
                                {col}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {unmappedColumns.length > 0 && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Colunas não mapeadas:</strong>{" "}
                  {unmappedColumns.join(", ")}
                </p>
              </div>
            )}
          </PageCard>
        )}

        {/* Preview de Dados */}
        {previewRows.length > 0 && (
          <PageCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Preview ({previewRows.length} de {totalRows} linhas)
              </h3>
              {validationErrors.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {validationErrors.length} erro(s)
                </Badge>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Analista</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>HAWB</TableHead>
                    <TableHead>Master</TableHead>
                    <TableHead>ETD</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => {
                    const hasError = rowHasError(idx);
                    const errorMsg = getRowError(idx);

                    return (
                      <TableRow
                        key={idx}
                        className={hasError ? "bg-destructive/10" : ""}
                      >
                        <TableCell className="font-mono text-xs">
                          {idx + 2}
                        </TableCell>
                        <TableCell className="truncate max-w-[120px]">
                          {row.nome_analista || "-"}
                        </TableCell>
                        <TableCell className="truncate max-w-[120px]">
                          {row.customer_no || "-"}
                        </TableCell>
                        <TableCell className="truncate max-w-[100px]">
                          {row.po || "-"}
                        </TableCell>
                        <TableCell
                          className={`truncate max-w-[100px] ${
                            !row.hawb && !row.master ? "text-destructive" : ""
                          }`}
                        >
                          {row.hawb || "-"}
                        </TableCell>
                        <TableCell
                          className={`truncate max-w-[100px] ${
                            !row.hawb && !row.master ? "text-destructive" : ""
                          }`}
                        >
                          {row.master || "-"}
                        </TableCell>
                        <TableCell className="truncate max-w-[140px]">
                          {row.etd || "-"}
                        </TableCell>
                        <TableCell>
                          {hasError ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent>{errorMsg}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Botão de Importar */}
            {!importResult && (
              <div className="mt-6 flex justify-end">
                <Button
                  size="lg"
                  onClick={handleImport}
                  disabled={isImporting || totalRows === 0}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    `Importar ${totalRows - validationErrors.length} registro(s)`
                  )}
                </Button>
              </div>
            )}

            {/* Progress durante importação */}
            {isImporting && (
              <div className="mt-4">
                <Progress value={importProgress} />
              </div>
            )}
          </PageCard>
        )}

        {/* Resultado da Importação */}
        {importResult && (
          <PageCard>
            <h3 className="text-lg font-semibold text-foreground mb-4">Resultado da Importação</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium text-foreground">{importResult.inserted} inseridos</span>
                </div>
                {importResult.rejected > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <span className="font-medium text-foreground">{importResult.rejected} rejeitados</span>
                  </div>
                )}
              </div>

              {importResult.errors.length > 0 && (
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <p className="font-medium text-destructive mb-2">Erros:</p>
                  <ul className="text-sm space-y-1">
                    {importResult.errors.slice(0, 10).map((err, idx) => (
                      <li key={idx} className="text-foreground">
                        Linha {err.index + 2}: {err.message}
                      </li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li className="text-muted-foreground">
                        ... e mais {importResult.errors.length - 10} erros
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <Button onClick={handleReset} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Nova Importação
              </Button>
            </div>
          </PageCard>
        )}
      </div>
    </PageLayout>
  );
}
