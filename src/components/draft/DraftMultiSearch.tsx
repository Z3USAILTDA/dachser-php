import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Clipboard, 
  Play, 
  Save, 
  FileSpreadsheet, 
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ship,
  FileText,
  Package,
  Info,
  Search
} from "lucide-react";
import { TrackingStatusBadge } from "./TrackingStatusBadge";
import { BookingResultCard } from "./BookingResultCard";
import { DraftEventTimelineVertical } from "./DraftEventTimelineVertical";
import { BatchProcessResult, SyncStatus } from "@/types/draft";
import * as XLSX from 'xlsx';

interface DraftMultiSearchProps {
  onComplete?: () => void;
}

type SearchType = 'BOOKING' | 'BL' | 'CONTAINER';

interface SearchTypeOption {
  id: SearchType;
  label: string;
  description: string;
  icon: React.ElementType;
  placeholder: string;
}

const searchTypes: SearchTypeOption[] = [
  { 
    id: 'BOOKING', 
    label: 'Booking Number', 
    description: 'Número de booking da reserva',
    icon: Ship,
    placeholder: 'Ex: 14387297'
  },
  { 
    id: 'BL', 
    label: 'Bill of Lading', 
    description: 'Número do conhecimento (BL/MBL)',
    icon: FileText,
    placeholder: 'Ex: HLCUSHA240001234'
  },
  { 
    id: 'CONTAINER', 
    label: 'Container Number', 
    description: 'Número do container',
    icon: Package,
    placeholder: 'Ex: HLCU1234567'
  },
];

const DELAY_BETWEEN_REQUESTS_MS = 6500;

export const DraftMultiSearch = ({ onComplete }: DraftMultiSearchProps) => {
  const [searchType, setSearchType] = useState<SearchType>('BL');
  const [isBatchMode, setIsBatchMode] = useState(true);
  const [singleSearchValue, setSingleSearchValue] = useState("");
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<BatchProcessResult[]>([]);
  const [estimatedTime, setEstimatedTime] = useState("");
  const [singleResult, setSingleResult] = useState<any>(null);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const getMBLsFromInput = (): string[] => {
    return inputText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
      toast.success('Texto colado da área de transferência');
    } catch (err) {
      toast.error('Não foi possível acessar a área de transferência');
    }
  };

  const calculateEstimatedTime = (remaining: number): string => {
    const seconds = remaining * (DELAY_BETWEEN_REQUESTS_MS / 1000);
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes} min`;
  };

  const processSingleSearch = async () => {
    if (!singleSearchValue.trim()) {
      toast.error('Digite um valor para buscar');
      return;
    }

    setIsProcessing(true);
    setSingleResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('draft-track-hapag-multi', {
        body: { searchType, searchValue: singleSearchValue.trim() }
      });

      if (error) throw error;

      if (data?.success) {
        setSingleResult(data);
        toast.success('Consulta realizada com sucesso');
      } else {
        toast.error(data?.error || 'Erro na consulta');
      }
    } catch (err: any) {
      console.error('Erro na busca:', err);
      toast.error(err.message?.includes('429') ? 'Rate limit atingido. Aguarde alguns segundos.' : 'Erro na consulta');
    } finally {
      setIsProcessing(false);
    }
  };

  const processQueue = async () => {
    const mbls = getMBLsFromInput();
    
    if (mbls.length === 0) {
      toast.error('Nenhum item para processar');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: mbls.length });
    setResults([]);
    setEstimatedTime(calculateEstimatedTime(mbls.length));

    const newResults: BatchProcessResult[] = [];

    for (let i = 0; i < mbls.length; i++) {
      const mbl = mbls[i];
      setProgress({ current: i + 1, total: mbls.length });
      setEstimatedTime(calculateEstimatedTime(mbls.length - i - 1));

      try {
        const { data, error } = await supabase.functions.invoke('draft-track-hapag-multi', {
          body: { searchType, searchValue: mbl }
        });

        if (error) throw error;

        if (data?.success) {
          newResults.push({
            mbl_id: mbl,
            success: true,
            status: data.bookingInfo?.documentStatus as SyncStatus || 'Unknown',
            booking: data.bookingInfo?.bookingNumber
          });
        } else {
          newResults.push({
            mbl_id: mbl,
            success: false,
            error: data?.error || 'Erro desconhecido'
          });
        }
      } catch (err: any) {
        newResults.push({
          mbl_id: mbl,
          success: false,
          error: err.message?.includes('429') ? 'Rate Limited' : err.message
        });
      }

      setResults([...newResults]);

      if (i < mbls.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    setIsProcessing(false);
    
    const successCount = newResults.filter(r => r.success).length;
    toast.success(`Processamento concluído: ${successCount}/${mbls.length} sucesso`);
    onComplete?.();
  };

  const saveAllResults = async () => {
    const successResults = results.filter(r => r.success);
    
    if (successResults.length === 0) {
      toast.error('Nenhum resultado válido para salvar');
      return;
    }

    setIsSaving(true);

    try {
      for (const result of successResults) {
        await supabase.functions.invoke('draft-save-tracking', {
          body: {
            trackingData: {
              mbl_id: result.mbl_id,
              booking: result.booking,
              status_armador: result.status
            }
          }
        });
      }

      toast.success(`${successResults.length} registros salvos no MariaDB`);
      onComplete?.();
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toast.error('Erro ao salvar resultados');
    } finally {
      setIsSaving(false);
    }
  };

  const exportToExcel = () => {
    if (results.length === 0) {
      toast.error('Nenhum resultado para exportar');
      return;
    }

    const exportData = results.map(r => ({
      'Referência': r.mbl_id,
      'Status': r.status || 'N/A',
      'Booking': r.booking || 'N/A',
      'Resultado': r.success ? 'Sucesso' : 'Erro',
      'Erro': r.error || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
    
    const fileName = `hapag_multi_search_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast.success('Arquivo exportado com sucesso');
  };

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const currentSearchType = searchTypes.find(t => t.id === searchType)!;

  return (
    <div className="space-y-6">
      {/* Rate Limit Alert */}
      <Alert className="bg-blue-500/10 border-blue-500/30">
        <Info className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-200">
          A API Hapag-Lloyd possui limite de 10 consultas/minuto. O sistema aguarda automaticamente entre requisições.
        </AlertDescription>
      </Alert>

      {/* Search Type Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {searchTypes.map((type) => {
          const Icon = type.icon;
          const isActive = searchType === type.id;
          return (
            <button
              key={type.id}
              onClick={() => setSearchType(type.id)}
              className={`
                p-4 rounded-xl border text-left transition-all duration-200
                ${isActive 
                  ? 'bg-[rgba(255,200,0,0.15)] border-[#ffc800]/40 shadow-[0_0_15px_rgba(255,200,0,0.2)]' 
                  : 'bg-card border-border hover:border-white/20 hover:bg-card'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-[#ffc800]/20' : 'bg-muted/50'}`}>
                  <Icon className={`h-5 w-5 ${isActive ? 'text-[#ffc800]' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h4 className={`font-medium ${isActive ? 'text-[#ffc800]' : 'text-foreground'}`}>
                    {type.label}
                  </h4>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={!isBatchMode ? "default" : "outline"}
          size="sm"
          onClick={() => setIsBatchMode(false)}
          className={!isBatchMode ? "bg-[#ffc800] text-black hover:bg-[#ffdc50]" : ""}
        >
          <Search className="h-4 w-4 mr-2" />
          Busca Única
        </Button>
        <Button
          variant={isBatchMode ? "default" : "outline"}
          size="sm"
          onClick={() => setIsBatchMode(true)}
          className={isBatchMode ? "bg-[#ffc800] text-black hover:bg-[#ffdc50]" : ""}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Busca em Lote
        </Button>
      </div>

      {/* Single Search Mode */}
      {!isBatchMode && (
        <Card className="bg-card border-border">
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={currentSearchType.placeholder}
                  value={singleSearchValue}
                  onChange={(e) => setSingleSearchValue(e.target.value)}
                  className="pl-10"
                  disabled={isProcessing}
                  onKeyDown={(e) => e.key === 'Enter' && processSingleSearch()}
                />
              </div>
              <Button
                onClick={processSingleSearch}
                disabled={isProcessing || !singleSearchValue.trim()}
                className="bg-[#ffc800] text-black hover:bg-[#ffdc50] shadow-[0_0_20px_rgba(255,200,0,0.3)]"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Consultar
              </Button>
            </div>

            {/* Single Result Display */}
            {singleResult && (
              <div className="space-y-4 pt-4 border-t border-border">
                <BookingResultCard 
                  bookingInfo={singleResult.bookingInfo}
                  apiMetadata={singleResult.apiMetadata}
                />

                {singleResult.events?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3 text-sm">Timeline de Eventos</h4>
                    <DraftEventTimelineVertical events={singleResult.events} />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch Search Mode */}
      {isBatchMode && (
        <>
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                Cole os {currentSearchType.label}s (um por linha)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={`${currentSearchType.placeholder}\n${currentSearchType.placeholder.replace(/\d/g, (d) => String((parseInt(d) + 1) % 10))}\n...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={8}
                className="font-mono text-sm"
                disabled={isProcessing}
              />
              
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handlePaste} disabled={isProcessing}>
                  <Clipboard className="h-4 w-4 mr-2" />
                  Colar da Área de Transferência
                </Button>
                <Button 
                  onClick={processQueue} 
                  disabled={isProcessing || getMBLsFromInput().length === 0}
                  className="bg-[#ffc800] text-black hover:bg-[#ffdc50] shadow-[0_0_20px_rgba(255,200,0,0.3)]"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Processar Lista ({getMBLsFromInput().length})
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Progress Bar */}
          {(isProcessing || results.length > 0) && (
            <Card className="bg-card border-border">
              <CardContent className="py-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isProcessing ? 'Processando...' : 'Concluído'}
                  </span>
                  <div className="flex items-center gap-4">
                    {isProcessing && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {estimatedTime}
                      </span>
                    )}
                    <span className="font-medium">
                      {progress.current}/{progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
                    </span>
                  </div>
                </div>
                <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} />
                
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {successCount} sucesso
                  </span>
                  <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="h-4 w-4" />
                    {errorCount} erros
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results Table */}
          {results.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Resultados</CardTitle>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={saveAllResults}
                      disabled={isSaving || successCount === 0}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Salvar Todos
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportToExcel}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Exportar Excel
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Referência</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Booking</TableHead>
                        <TableHead className="text-center">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-sm">
                            {result.mbl_id}
                          </TableCell>
                          <TableCell>
                            {result.status ? (
                              <TrackingStatusBadge status={result.status} showIcon={false} />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {result.booking || '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {result.success ? (
                              <CheckCircle2 className="h-5 w-5 text-green-400 mx-auto" />
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <XCircle className="h-5 w-5 text-red-400" />
                                <span className="text-xs text-red-400 truncate max-w-[100px]">
                                  {result.error}
                                </span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
