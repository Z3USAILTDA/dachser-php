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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

import {
  parseExcelClientesBaseFile,
  CLIENTES_BASE_COLUMNS,
  type ClienteBaseRow,
  type ColumnMapping as ClientesColumnMapping,
  type ParseValidationError as ClientesValidationError,
} from "@/lib/parseExcelClientesBase";

type ImportMode = "master" | "clientes_base";

export default function UploadMaster() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  // Estado do modo de importação
  const [importMode, setImportMode] = useState<ImportMode>("master");

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

  // Estados específicos para Clientes Base
  const [clientesPreviewRows, setClientesPreviewRows] = useState<ClienteBaseRow[]>([]);
  const [clientesAllRows, setClientesAllRows] = useState<ClienteBaseRow[]>([]);
  const [clientesColumnMappings, setClientesColumnMappings] = useState<ClientesColumnMapping[]>([]);
  const [clientesValidationErrors, setClientesValidationErrors] = useState<ClientesValidationError[]>([]);

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

  // Limpar e recomeçar
  const handleReset = useCallback(() => {
    setFile(null);
    setTipoProcesso(null);
    setFileFormat("");
    setColumnMappings([]);
    setUnmappedColumns([]);
    setPreviewRows([]);
    setAllRows([]);
    setValidationErrors([]);
    setClientesPreviewRows([]);
    setClientesAllRows([]);
    setClientesColumnMappings([]);
    setClientesValidationErrors([]);
    setImportResult(null);
    setTotalRows(0);
    setImportProgress(0);
  }, []);

  // Handler de troca de modo
  const handleModeChange = (mode: string) => {
    setImportMode(mode as ImportMode);
    handleReset();
  };

  // Handler de seleção de arquivo
  const handleFileSelect = useCallback((selectedFile: File) => {
    // Reset estados
    setColumnMappings([]);
    setUnmappedColumns([]);
    setPreviewRows([]);
    setAllRows([]);
    setValidationErrors([]);
    setClientesPreviewRows([]);
    setClientesAllRows([]);
    setClientesColumnMappings([]);
    setClientesValidationErrors([]);
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

    // No modo Master, validar nome do arquivo
    if (importMode === "master") {
      const tipo = extractTipoProcesso(selectedFile.name);
      if (!tipo) {
        toast.error(
          "Nome do arquivo deve conter AIR ou SEA e IMPORT ou EXPORT. Ex: 'Air Export 03fev.xlsx'"
        );
        setFile(null);
        setTipoProcesso(null);
        return;
      }
      setTipoProcesso(tipo);
    } else {
      // No modo Clientes Base, não exige AIR/SEA
      setTipoProcesso(null);
    }

    setFile(selectedFile);
    setFileFormat(getFileFormatDescription(selectedFile.name));
  }, [importMode]);

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
    if (!file) return;

    // No modo master, precisa do tipoProcesso
    if (importMode === "master" && !tipoProcesso) return;

    setIsValidating(true);
    try {
      if (importMode === "master") {
        const result = await parseExcelMasterFile(file, tipoProcesso!);

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
      } else {
        // Modo Clientes Base
        const result = await parseExcelClientesBaseFile(file);

        setClientesColumnMappings(result.columnMappings);
        setUnmappedColumns(result.unmappedColumns);
        setClientesPreviewRows(result.previewRows);
        setClientesAllRows(result.rows);
        setClientesValidationErrors(result.errors);
        setTotalRows(result.totalRows);

        if (!result.success && result.errors.length > 0) {
          toast.warning(`${result.errors.length} linha(s) com problemas`);
        } else {
          toast.success(`${result.totalRows} linhas prontas para importação`);
        }
      }
    } catch (error) {
      console.error("Erro ao processar arquivo:", error);
      toast.error("Erro ao processar arquivo");
    } finally {
      setIsValidating(false);
    }
  };

  // Atualizar mapeamento de coluna (Master)
  const handleMappingChange = (excelColumn: string, newDbColumn: string) => {
    setColumnMappings((prev) =>
      prev.map((m) =>
        m.excelColumn === excelColumn ? { ...m, dbColumn: newDbColumn } : m
      )
    );
  };

  // Atualizar mapeamento de coluna (Clientes Base)
  const handleClientesMappingChange = (excelColumn: string, newDbColumn: string) => {
    setClientesColumnMappings((prev) =>
      prev.map((m) =>
        m.excelColumn === excelColumn ? { ...m, dbColumn: newDbColumn } : m
      )
    );
  };

  // Importar dados
  const handleImport = async () => {
    if (importMode === "master") {
      if (!tipoProcesso || allRows.length === 0) return;

      setIsImporting(true);
      setImportProgress(0);

      try {
        // Filtrar linhas válidas (que não estão em erro)
        const errorRows = new Set(validationErrors.map((e) => e.row - 2));
        const validRows = allRows.filter((_, idx) => !errorRows.has(idx));

        if (validRows.length === 0) {
          toast.error("Nenhuma linha válida para importar");
          setIsImporting(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "bulk_insert_master",
            rows: validRows,
            modal: tipoProcesso.modal,
          },
        });

        if (error) throw error;

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
    } else {
      // Modo Clientes Base - com batching para evitar WORKER_LIMIT
      if (clientesAllRows.length === 0) return;

      setIsImporting(true);
      setImportProgress(0);

      try {
        // Filtrar linhas válidas
        const errorRows = new Set(clientesValidationErrors.map((e) => e.row - 2));
        const validRows = clientesAllRows.filter((_, idx) => !errorRows.has(idx));

        if (validRows.length === 0) {
          toast.error("Nenhuma linha válida para importar");
          setIsImporting(false);
          return;
        }

        // Dividir em batches menores (15 registros) para evitar timeout/WORKER_LIMIT
        // e adicionar delay entre batches para evitar sobrecarga de conexão
        const BATCH_SIZE = 15;
        const BATCH_DELAY_MS = 500; // 500ms entre batches
        const batches: typeof validRows[] = [];
        for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
          batches.push(validRows.slice(i, i + BATCH_SIZE));
        }

        let totalInserted = 0;
        let totalRejected = 0;
        const allErrors: Array<{ index: number; message: string }> = [];

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          const progress = Math.round(((batchIndex + 1) / batches.length) * 100);
          setImportProgress(progress);

          // Delay entre batches (exceto no primeiro)
          if (batchIndex > 0) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
            body: {
              action: "bulk_insert_clientes",
              rows: batch,
            },
          });

          if (error) {
            console.error(`Erro no batch ${batchIndex + 1}:`, error);
            // Continuar com os próximos batches mesmo em caso de erro
            totalRejected += batch.length;
            allErrors.push({ 
              index: batchIndex * BATCH_SIZE, 
              message: `Batch ${batchIndex + 1} falhou: ${error.message}` 
            });
            continue;
          }

          totalInserted += data.inserted || 0;
          totalRejected += data.rejected || 0;
          
          if (data.errors && data.errors.length > 0) {
            // Ajustar índices dos erros para refletir posição global
            const adjustedErrors = data.errors.map((e: { index: number; message: string }) => ({
              ...e,
              index: e.index + (batchIndex * BATCH_SIZE),
            }));
            allErrors.push(...adjustedErrors);
          }
        }

        setImportResult({
          inserted: totalInserted,
          rejected: totalRejected,
          errors: allErrors,
        });

        if (totalInserted > 0) {
          toast.success(`${totalInserted} cliente(s) importado(s) com sucesso!`);
        }

        if (totalRejected > 0) {
          toast.warning(`${totalRejected} registro(s) rejeitado(s)`);
        }
      } catch (error) {
        console.error("Erro na importação:", error);
        toast.error("Erro ao importar dados");
      } finally {
        setIsImporting(false);
        setImportProgress(100);
      }
    }
  };

  // Verificar se uma linha tem erro (Master)
  const rowHasError = (rowIndex: number) => {
    return validationErrors.some((e) => e.row === rowIndex + 2);
  };

  // Obter erro de uma linha (Master)
  const getRowError = (rowIndex: number) => {
    return validationErrors.find((e) => e.row === rowIndex + 2)?.message;
  };

  // Verificar se uma linha tem erro (Clientes Base)
  const clientesRowHasError = (rowIndex: number) => {
    return clientesValidationErrors.some((e) => e.row === rowIndex + 2);
  };

  // Obter erro de uma linha (Clientes Base)
  const getClientesRowError = (rowIndex: number) => {
    return clientesValidationErrors.find((e) => e.row === rowIndex + 2)?.message;
  };

  // Contagem de erros baseada no modo
  const currentErrors = importMode === "master" ? validationErrors : clientesValidationErrors;
  const currentMappings = importMode === "master" ? columnMappings : clientesColumnMappings;
  const hasPreview = importMode === "master" ? previewRows.length > 0 : clientesPreviewRows.length > 0;

  if (!isAdmin) {
    return null;
  }

  return (
    <PageLayout
      title={importMode === "master" ? "Upload Master (Air/Sea)" : "Upload Clientes Base"}
  subtitle={importMode === "master" 
    ? "Importação de planilhas para t_air_master ou t_sea_master" 
    : "Importação de planilhas para t_clientes_base"}
      backTo="/dashboard"
    >
      <div className="space-y-6">
        {/* Seletor de Modo */}
        <Tabs value={importMode} onValueChange={handleModeChange}>
          <TabsList>
            <TabsTrigger value="master">Master (Air/Sea)</TabsTrigger>
            <TabsTrigger value="clientes_base">Clientes Base</TabsTrigger>
          </TabsList>
        </Tabs>

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
                {importMode === "master" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    O nome do arquivo deve conter AIR ou SEA e IMPORT ou EXPORT
                  </p>
                )}
              </label>
            </div>
          </PageCard>
        )}

        {/* Arquivo Selecionado */}
        {file && (importMode === "clientes_base" || tipoProcesso) && (
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
                {importMode === "master" && tipoProcesso && (
                  <>
                    <Badge
                      variant={tipoProcesso.modal === "AIR" ? "default" : "secondary"}
                      className="text-sm px-3 py-1"
                    >
                      {tipoProcesso.full}
                    </Badge>
                    {tipoProcesso.dataInsert && (
                      <Badge variant="outline" className="text-sm px-3 py-1">
                        📅 {tipoProcesso.dataInsert.split(" ")[0]}
                      </Badge>
                    )}
                    {!tipoProcesso.dataInsert && (
                      <Badge variant="destructive" className="text-sm px-3 py-1">
                        ⚠️ Data não detectada
                      </Badge>
                    )}
                  </>
                )}
                {importMode === "clientes_base" && (
                  <Badge variant="outline" className="text-sm px-3 py-1">
                    Clientes Base
                  </Badge>
                )}
                {!currentMappings.length && (
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

        {/* Mapeamento de Colunas - Master */}
        {importMode === "master" && columnMappings.length > 0 && (
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

        {/* Mapeamento de Colunas - Clientes Base */}
        {importMode === "clientes_base" && clientesColumnMappings.length > 0 && (
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
                  {clientesColumnMappings.map((mapping) => (
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
                            handleClientesMappingChange(mapping.excelColumn, value)
                          }
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLIENTES_BASE_COLUMNS.map((col) => (
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

        {/* Preview de Dados - Master */}
        {importMode === "master" && previewRows.length > 0 && (
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

        {/* Preview de Dados - Clientes Base */}
        {importMode === "clientes_base" && clientesPreviewRows.length > 0 && (
          <PageCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Preview ({clientesPreviewRows.length} de {totalRows} linhas)
              </h3>
              {clientesValidationErrors.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {clientesValidationErrors.length} erro(s)
                </Badge>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Nome Cliente</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Customer No</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead>Classificação</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesPreviewRows.map((row, idx) => {
                    const hasError = clientesRowHasError(idx);
                    const errorMsg = getClientesRowError(idx);

                    return (
                      <TableRow
                        key={idx}
                        className={hasError ? "bg-destructive/10" : ""}
                      >
                        <TableCell className="font-mono text-xs">
                          {idx + 2}
                        </TableCell>
                        <TableCell className="truncate max-w-[180px]">
                          {row.nome_cliente || "-"}
                        </TableCell>
                        <TableCell className="truncate max-w-[120px]">
                          {row.cnpj || "-"}
                        </TableCell>
                        <TableCell className="truncate max-w-[100px]">
                          {row.dchr_customer_number || "-"}
                        </TableCell>
                        <TableCell className="truncate max-w-[120px]">
                          {row.cidade_uf || "-"}
                        </TableCell>
                        <TableCell className="truncate max-w-[100px]">
                          {row.classificacao || "-"}
                        </TableCell>
                        <TableCell>
                          {row.ativo === 1 ? (
                            <Badge variant="default" className="bg-primary/20 text-primary">
                              Sim
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              Não
                            </Badge>
                          )}
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
                    `Importar ${totalRows - clientesValidationErrors.length} cliente(s)`
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
