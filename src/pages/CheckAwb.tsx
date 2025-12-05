import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, RefreshCw, Filter as FilterIcon, UploadCloud, FileText, Trash2, TerminalSquare, Loader2, ChevronDown, ChevronUp, Plus, Database, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { RuleMatrixManager } from "@/components/RuleMatrixManager";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";

interface AwbCheck {
  id: string;
  awb: string;
  cnpj: string;
  origin: string;
  destination: string;
  customer: "KLABIN" | "ZF";
  result: "OK" | "ALERTA" | "BLOQUEIO";
  reason: string | null;
  rule_matrix_version: string;
  created_at: string;
  parsed_awb_id: string | null;
}

interface ParsedAwbData {
  awb_number: string | null;
  cnpj_detected: string | null;
  origin_detected: string | null;
  destination_detected: string | null;
  shipper: string | null;
  consignee: string | null;
  carrier: string | null;
  routing_legs: any;
  gross_weight_kg: number | null;
  chargeable_weight_kg: number | null;
  mrn: string | null;
}

interface User {
  id: number;
  email: string;
  username: string;
  is_admin: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const CheckAwb = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<AwbCheck[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("7");

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<AwbCheck | null>(null);
  const [selectedParsedData, setSelectedParsedData] = useState<ParsedAwbData | null>(null);
  const [selectedEmailDespachante, setSelectedEmailDespachante] = useState<string | null>(null);
  const [checkToDelete, setCheckToDelete] = useState<string | null>(null);

  // Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Matrix panel state
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setUserRole(parsedUser.is_admin === 1 ? "ADMIN" : "OPERACAO");
      fetchChecks();
    } else {
      navigate("/");
    }
    setLoading(false);
  }, [navigate]);

  const fetchChecks = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_awb_checks' }),
      });
      const data = await response.json();
      if (data.success) {
        // Map MariaDB fields to expected interface
        const mappedChecks = (data.checks || []).map((check: any) => ({
          id: check.id,
          awb: check.awb_number || 'N/A',
          cnpj: check.cnpj || 'N/A',
          origin: check.origin || 'N/A',
          destination: check.destination || 'N/A',
          customer: check.customer || 'KLABIN',
          result: check.status === 'VALID' ? 'OK' : 'BLOQUEIO',
          reason: check.validation_message,
          rule_matrix_version: '1.0',
          created_at: check.created_at,
          parsed_awb_id: check.parsed_awb_id,
        }));
        setChecks(mappedChecks);
      }
    } catch (error) {
      console.error('Error fetching checks:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewDetails = async (check: AwbCheck) => {
    setSelectedCheck(check);
    setSelectedEmailDespachante(null);
    setSelectedParsedData(null);
    
    if (check.parsed_awb_id) {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'get_parsed_awb',
            parsedAwbId: check.parsed_awb_id 
          }),
        });
        const data = await response.json();
        if (data.success && data.parsedAwb) {
          setSelectedParsedData({
            awb_number: data.parsedAwb.awb_number,
            cnpj_detected: data.parsedAwb.cnpj,
            origin_detected: data.parsedAwb.origin,
            destination_detected: data.parsedAwb.destination,
            shipper: data.parsedAwb.shipper,
            consignee: data.parsedAwb.consignee,
            carrier: data.parsedAwb.carrier,
            routing_legs: null,
            gross_weight_kg: null,
            chargeable_weight_kg: null,
            mrn: null,
          });
        }
      } catch (error) {
        console.error("Error fetching parsed data:", error);
      }
    }
    setIsDetailsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setCheckToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!checkToDelete) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'delete_awb_check',
          checkId: checkToDelete 
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Validação excluída com sucesso");
        fetchChecks();
      }
    } catch (error: any) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir validação");
    } finally {
      setIsDeleteDialogOpen(false);
      setCheckToDelete(null);
    }
  };

  const handleExportToMariaDB = async () => {
    setIsExporting(true);
    try {
      toast.info("Iniciando exportação para MariaDB...");
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export_data' }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message || "Exportação concluída");
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error(`Erro na exportação: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0) return;

    const validFiles = files.filter(f => f.type === "application/pdf" || f.type.includes("image"));
    if (validFiles.length === 0) {
      toast.error("Por favor, selecione arquivos PDF ou imagem");
      return;
    }
    setIsUploading(true);
    try {
      if (!user) {
        setIsUploading(false);
        return;
      }

      if (validFiles.length >= 2) {
        await processMultipleFiles(validFiles, user.id);
      } else {
        await processSingleFile(validFiles[0], user.id);
      }
      setIsUploadModalOpen(false);
      fetchChecks();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Erro ao processar documento(s)");
    } finally {
      setIsUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const processSingleFile = async (file: File, userId: number) => {
    const base64 = await fileToBase64(file);
    const fileType = file.type.includes('pdf') ? 'pdf' : 'image';

    const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-awb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: base64,
        file_type: fileType,
        document_type: 'house_awb',
      }),
    });

    const parsedData = await response.json();
    if (!parsedData.success) {
      throw new Error(parsedData.error || "Erro ao extrair dados do documento");
    }

    await processValidation(parsedData.data, userId);
    toast.success("Documento processado com sucesso!");
  };

  const processMultipleFiles = async (files: File[], userId: number) => {
    toast.info("Processando arquivos...");

    const parsedResults: Array<{
      file: File;
      parsed: any;
      isLikelyInstruction: boolean;
      cnpjSuffixPattern: string | null;
    }> = [];

    for (const file of files) {
      const base64 = await fileToBase64(file);
      const fileType = file.type.includes('pdf') ? 'pdf' : 'image';

      const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-awb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: base64,
          file_type: fileType,
          document_type: 'house_awb',
        }),
      });

      const parsed = await response.json();
      const data = parsed.data || parsed;

      const references = data?.references || [];
      let cnpjSuffixPattern: string | null = null;
      for (const ref of references) {
        const match = ref.match(/CNPJ\s*(\d{2})-(\d{2})/i) || ref.match(/^(\d{2})-(\d{2})$/);
        if (match) {
          cnpjSuffixPattern = match[1] + match[2];
          break;
        }
      }

      const cnpj = data?.cnpj?.replace(/\D/g, "") || "";
      const isLikelyFabricatedCnpj = cnpj.length === 14 && (
        cnpj.startsWith("0176") || 
        cnpj.startsWith("0001") || 
        /^0\d{3}0+\d{2,4}$/.test(cnpj)
      );
      const isLikelyInstruction = !!cnpjSuffixPattern || isLikelyFabricatedCnpj;
      
      parsedResults.push({
        file,
        parsed: data,
        isLikelyInstruction,
        cnpjSuffixPattern
      });
    }

    const instructionResult = parsedResults.find(r => r.isLikelyInstruction);
    const houseResult = parsedResults.find(r => {
      const cnpj = r.parsed?.cnpj?.replace(/\D/g, "") || "";
      return cnpj.length === 14 && r.parsed?.awb_number && !r.isLikelyInstruction;
    }) || parsedResults.find(r => {
      const cnpj = r.parsed?.cnpj?.replace(/\D/g, "") || "";
      return cnpj.length === 14 && r.parsed?.awb_number && r !== instructionResult;
    });

    if (!houseResult) {
      throw new Error("Nenhum documento identificado como House AWB com CNPJ válido.");
    }

    const houseParsed = houseResult.parsed;
    toast.info(`House AWB identificado: ${houseResult.file.name}`);

    let finalCnpj = houseParsed.cnpj;

    if (instructionResult) {
      toast.info(`Instrução identificada: ${instructionResult.file.name}`);
      let cnpjSuffix: string | null = instructionResult.cnpjSuffixPattern;

      if (cnpjSuffix && houseParsed.cnpj) {
        const baseCnpj = houseParsed.cnpj.replace(/\D/g, "");
        if (cnpjSuffix.length === 4) {
          finalCnpj = baseCnpj.substring(0, 8) + cnpjSuffix + baseCnpj.substring(12, 14);
          toast.info(`CNPJ ajustado conforme instrução: filial ${cnpjSuffix}`);
        }
      }
    }

    const composedParsedData = {
      ...houseParsed,
      cnpj: finalCnpj,
      instructionUsed: !!instructionResult
    };

    await processValidation(composedParsedData, userId);
    toast.success("Documentos processados com sucesso!");
  };

  const processValidation = async (parsedData: any, userId: number) => {
    try {
      // Create parsed_awb record
      const parsedResponse = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_parsed_awb',
          documentId: null,
          awbNumber: parsedData.awb_number,
          cnpj: parsedData.cnpj,
          customer: parsedData.customer,
          shipper: parsedData.shipper_name,
          consignee: parsedData.consignee_name,
          origin: parsedData.origin_airport,
          destination: parsedData.destination_airport,
          rawJson: parsedData,
        }),
      });
      
      const parsedResult = await parsedResponse.json();
      if (!parsedResult.success) {
        throw new Error('Erro ao salvar dados extraídos');
      }
      const parsedDataId = parsedResult.parsedAwbId;

      // Find matching rule
      const ruleResponse = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'find_matching_rule',
          customer: parsedData.customer,
          cnpj: parsedData.cnpj,
          airportCode: parsedData.destination_airport,
        }),
      });

      const ruleData = await ruleResponse.json();
      
      let status = 'INVALID';
      let validationMessage = 'CNPJ não encontrado na matriz de regras';
      let ruleRowId = null;

      if (ruleData.success && ruleData.rule) {
        status = 'VALID';
        validationMessage = `Regra encontrada - Email: ${ruleData.rule.email_despachante || 'N/A'}`;
        ruleRowId = ruleData.rule.id;
      }

      // Create AWB check record
      await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_awb_check',
          userId: userId,
          parsedDataId: parsedDataId,
          ruleRowId: ruleRowId,
          status,
          validationMessage: validationMessage,
        }),
      });

    } catch (error) {
      console.error("Erro na validação:", error);
      throw error;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFilesUpload(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) handleFilesUpload(files);
  };

  const filteredChecks = checks.filter(check => {
    const matchesSearch = check.awb.toLowerCase().includes(searchTerm.toLowerCase()) || 
      check.cnpj.includes(searchTerm) || 
      check.customer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || check.result === statusFilter;
    const daysAgo = parseInt(periodFilter);
    const checkDate = new Date(check.created_at);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
    const matchesPeriod = checkDate >= cutoffDate;
    return matchesSearch && matchesStatus && matchesPeriod;
  });

  const getResultBadge = (result: string) => {
    if (result === "OK") {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 px-3 py-1 rounded-full">
          COMPATÍVEL
        </Badge>
      );
    }
    return (
      <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/40 px-3 py-1 rounded-full">
        INCOMPATÍVEL
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen text-white" 
      style={{
        background: `linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55)), url(${dachserBg}) center/cover no-repeat`,
        zIndex: -2
      }}
    >
      {/* overlay para leitura */}
      <div className="min-h-screen bg-black/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* HEADER */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="text-primary hover:text-primary hover:bg-primary/10"
              >
                <ArrowLeft size={20} />
              </Button>
              <img 
                src={logoZ3us} 
                alt="Z3US.AI" 
                className="h-10 drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]"
              />
              <div className="flex flex-col gap-1">
                <div className="text-[1.7rem] tracking-[0.22em] uppercase">DACHSER</div>
                <div className="text-sm text-neutral-100">Intelligent Logistics – Check AWB x CNPJ</div>
                <div className="flex gap-2 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(251,191,36,0.9)]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-neutral-300">
              <div className="px-4 py-1 rounded-full bg-black/70 border border-white/12">
                @{user?.username ?? "usuario"}
              </div>

              {userRole === "ADMIN" && (
                <>
                  <button 
                    type="button" 
                    onClick={handleExportToMariaDB} 
                    disabled={isExporting}
                    className="w-8 h-8 rounded-full border border-white/18 bg-black/70 flex items-center justify-center hover:bg-black hover:border-primary/80 transition disabled:opacity-50" 
                    title="Exportar para MariaDB"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <Database className="w-4 h-4 text-primary" />
                    )}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => navigate("/logs")} 
                    className="w-8 h-8 rounded-full border border-white/18 bg-black/70 flex items-center justify-center hover:bg-black hover:border-primary/80 transition" 
                    title="Logs do sistema"
                  >
                    <TerminalSquare className="w-4 h-4 text-primary" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* CARD DE BUSCA + FILTROS */}
          <Card className="bg-black/86 border border-white/10 rounded-2xl shadow-[0_18px_40px_rgba(0,0,0,0.9)]">
            <CardContent className="pt-5 pb-4 space-y-4">
              {/* busca */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
                <input 
                  type="text" 
                  placeholder="Buscar por AWB, CNPJ ou cliente" 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.86)' }}
                  className="h-11 w-full pl-11 pr-4 rounded-full border border-white/12 text-sm text-white placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black" 
                />
              </div>

              {/* linha filtros */}
              <div className="flex flex-wrap items-center gap-4 justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/86 border border-white/12">
                      <FilterIcon className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] tracking-[0.22em] uppercase text-neutral-400">Status</span>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 w-[150px] rounded-full bg-black/86 border border-white/14 text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="OK">Compatível</SelectItem>
                        <SelectItem value="BLOQUEIO">Incompatível</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Período */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/86 border border-white/12">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-[10px] tracking-[0.22em] uppercase text-neutral-400">Período</span>
                    </div>
                    <Select value={periodFilter} onValueChange={setPeriodFilter}>
                      <SelectTrigger className="h-9 w-[150px] rounded-full bg-black/86 border border-white/14 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Últimos 7 dias</SelectItem>
                        <SelectItem value="30">Últimos 30 dias</SelectItem>
                        <SelectItem value="90">Últimos 90 dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    onClick={fetchChecks} 
                    disabled={isRefreshing} 
                    variant="outline" 
                    className="h-9 rounded-full border-white/24 bg-black/86 text-xs px-4 hover:border-primary/80 hover:bg-black disabled:opacity-50"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>

                {/* Nova Validação */}
                <Button 
                  onClick={() => setIsUploadModalOpen(true)} 
                  className="h-10 rounded-full px-5 bg-primary text-black font-semibold text-sm shadow-[0_0_22px_rgba(251,191,36,0.6)] hover:bg-primary/90"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Nova Validação
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* CARD HISTÓRICO */}
          <Card className="bg-black/86 border border-white/10 rounded-2xl shadow-[0_18px_40px_rgba(0,0,0,0.9)]">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs tracking-[0.22em] uppercase text-neutral-400">Resumo de Validações</div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Consultas recentes de AWB/HAWB por status e cliente
                  </div>
                </div>
                <div className="text-xs text-neutral-400">
                  Total: <span className="text-primary font-semibold">{filteredChecks.length}</span> registros
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-black/86 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-white/10 bg-black/86">
                      <TableHead className="text-xs uppercase tracking-[0.18em] text-neutral-400">AWB</TableHead>
                      <TableHead className="text-xs uppercase tracking-[0.18em] text-neutral-400">CNPJ</TableHead>
                      <TableHead className="text-xs uppercase tracking-[0.18em] text-neutral-400">Rota</TableHead>
                      <TableHead className="text-xs uppercase tracking-[0.18em] text-neutral-400">Cliente</TableHead>
                      <TableHead className="text-xs uppercase tracking-[0.18em] text-neutral-400">Status</TableHead>
                      <TableHead className="text-xs uppercase tracking-[0.18em] text-neutral-400">Motivo</TableHead>
                      <TableHead className="text-xs uppercase tracking-[0.18em] text-neutral-400">Data</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-[0.18em] text-neutral-400">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredChecks.map(check => (
                      <TableRow key={check.id} className="border-b border-white/5 hover:bg-white/5">
                        <TableCell className="font-mono text-xs">{check.awb}</TableCell>
                        <TableCell className="font-mono text-xs">{check.cnpj}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {check.origin} → {check.destination}
                        </TableCell>
                        <TableCell className="text-xs">{check.customer}</TableCell>
                        <TableCell className="text-xs">{getResultBadge(check.result)}</TableCell>
                        <TableCell className="max-w-xs text-xs truncate" title={check.reason || ""}>
                          {check.reason || (check.result === "OK" ? "CNPJ e aeroporto compatíveis" : "CNPJ não compatível")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(check.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-neutral-300 hover:bg-white/10" 
                              onClick={() => handleViewDetails(check)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-rose-400 hover:bg-rose-500/10" 
                              onClick={() => handleDeleteClick(check.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {filteredChecks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-sm text-neutral-400">
                          Nenhuma validação encontrada para os filtros selecionados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Matriz de Regras (ADMIN) */}
          {userRole === "ADMIN" && (
            <Collapsible open={isMatrixOpen} onOpenChange={setIsMatrixOpen}>
              <Card className="bg-black/86 border border-white/10 rounded-2xl">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5">
                    <span className="text-base font-semibold">Matriz de Regras</span>
                    {isMatrixOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6">
                    <RuleMatrixManager userRole={userRole} />
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </div>
      </div>

      {/* MODAL UPLOAD */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="sm:max-w-md bg-black/95 border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Nova Validação de AWB/HAWB</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input 
              ref={fileInputRef} 
              type="file" 
              accept=".pdf,image/*" 
              multiple 
              onChange={handleFileInputChange} 
              className="hidden" 
            />
            <div 
              onDragOver={handleDragOver} 
              onDragLeave={handleDragLeave} 
              onDrop={handleDrop} 
              onClick={() => fileInputRef.current?.click()} 
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer ${
                isDragging ? "border-primary bg-primary/5" : "border-white/20 hover:border-primary/50"
              } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
                  <p className="text-lg text-white mb-2">Processando documento...</p>
                  <p className="text-sm text-neutral-400">Extraindo dados e validando contra matriz de regras</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
                  <p className="text-lg text-white mb-2">
                    {isDragging ? "Solte o(s) arquivo(s) aqui" : "Arraste arquivo(s) ou clique para selecionar"}
                  </p>
                  <p className="text-sm text-neutral-400">Formatos aceitos: PDF ou imagens</p>
                  <p className="text-xs text-primary/80 mt-2">
                    Para ZF com múltiplos CNPJs: envie House + PDF de Instrução juntos
                  </p>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DETALHES */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-black/95 border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Descrição Detalhada</DialogTitle>
          </DialogHeader>
          {selectedCheck && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-neutral-400">AWB</p>
                  <p className="font-mono text-sm text-white">{selectedCheck.awb}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral-400">CNPJ</p>
                  <p className="font-mono text-sm text-white">{selectedCheck.cnpj}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral-400">Rota</p>
                  <p className="font-mono text-sm text-white">
                    {selectedCheck.origin} → {selectedCheck.destination}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-400">Cliente</p>
                  <p className="text-sm text-white">{selectedCheck.customer}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral-400">Status</p>
                  {getResultBadge(selectedCheck.result)}
                </div>
                <div>
                  <p className="text-sm text-neutral-400">Motivo</p>
                  <p className="text-sm text-white">
                    {selectedCheck.reason || (selectedCheck.result === "OK" ? "CNPJ e aeroporto compatíveis" : "CNPJ não compatível")}
                  </p>
                </div>
              </div>

              {selectedParsedData && (
                <div className="border-t border-white/10 pt-4 mt-4">
                  <h3 className="font-semibold mb-3 text-white">Dados Adicionais</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-neutral-400">Ref Othello</p>
                      <p className="font-mono text-white">
                        {selectedParsedData.mrn || "Referência não encontrada na matriz de regras"}
                      </p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Transportadora</p>
                      <p className="text-white">{selectedParsedData.carrier || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Remetente</p>
                      <p className="text-white">{selectedParsedData.shipper || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Destinatário</p>
                      <p className="text-white">{selectedParsedData.consignee || "N/A"}</p>
                    </div>
                    {selectedParsedData.gross_weight_kg && (
                      <div>
                        <p className="text-neutral-400">Peso Bruto</p>
                        <p className="text-white">{selectedParsedData.gross_weight_kg} kg</p>
                      </div>
                    )}
                    {selectedParsedData.chargeable_weight_kg && (
                      <div>
                        <p className="text-neutral-400">Peso Taxável</p>
                        <p className="text-white">{selectedParsedData.chargeable_weight_kg} kg</p>
                      </div>
                    )}
                    {selectedEmailDespachante && (
                      <div className="col-span-2">
                        <p className="text-neutral-400">E-mail Despachante</p>
                        <p className="text-white">{selectedEmailDespachante}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-black/95 border border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl text-white">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              Tem certeza que deseja excluir esta validação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white border-white/20 hover:bg-white/20">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-rose-600 text-white hover:bg-rose-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CheckAwb;
