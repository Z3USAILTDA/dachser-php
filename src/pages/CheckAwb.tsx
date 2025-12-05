import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, FileText, Check, X, AlertTriangle, Loader2, Search, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";

interface User {
  id: number;
  email: string;
  username: string;
  is_admin: number;
}

interface ParsedAwbData {
  awb_number: string | null;
  cnpj: string | null;
  origin_airport: string | null;
  destination_airport: string | null;
  shipper_name: string | null;
  consignee_name: string | null;
  customer: string | null;
  delivery_address: string | null;
  confidence: string;
}

interface AwbCheck {
  id: number;
  awb_number: string | null;
  cnpj: string | null;
  customer: string | null;
  origin: string | null;
  destination: string | null;
  status: string;
  validation_message: string | null;
  rule_email?: string | null;
  created_at: string;
  username: string | null;
  consignee?: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const CheckAwb = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  
  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedAwbData | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  
  // Results state
  const [checks, setChecks] = useState<AwbCheck[]>([]);
  const [isLoadingChecks, setIsLoadingChecks] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");
  
  // Detail modal
  const [selectedCheck, setSelectedCheck] = useState<AwbCheck | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchChecks();
    }
  }, [user]);

  const fetchChecks = async () => {
    setIsLoadingChecks(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_awb_checks' }),
      });
      const data = await response.json();
      if (data.success) {
        setChecks(data.checks || []);
      }
    } catch (error) {
      console.error('Error fetching checks:', error);
    } finally {
      setIsLoadingChecks(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploadedFile(files[0]);
      setParsedData(null);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isInstruction = false) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (isInstruction) {
        setInstructionFile(files[0]);
      } else {
        setUploadedFile(files[0]);
        setParsedData(null);
      }
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

  const parseDocument = async () => {
    if (!uploadedFile) return;

    setIsParsing(true);
    try {
      const base64 = await fileToBase64(uploadedFile);
      const fileType = uploadedFile.type.includes('pdf') ? 'pdf' : 'image';

      const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-awb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: base64,
          file_type: fileType,
          document_type: 'house_awb',
        }),
      });

      const data = await response.json();
      if (data.success) {
        setParsedData(data.data);
        toast({
          title: "Documento processado",
          description: `Confiança: ${data.data.confidence}`,
        });
      } else {
        throw new Error(data.error || 'Erro ao processar documento');
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        variant: "destructive",
        title: "Erro ao processar",
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const validateAwb = async () => {
    if (!parsedData || !user) return;

    setIsValidating(true);
    try {
      // First, create a parsed_awb record with the extracted data
      const parsedResponse = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_parsed_awb',
          documentId: null, // No document storage for now
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
      const checkResponse = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_awb_check',
          userId: user.id,
          parsedDataId: parsedDataId,
          ruleRowId: ruleRowId,
          status,
          validationMessage: validationMessage,
        }),
      });

      const checkData = await checkResponse.json();
      
      if (checkData.success) {
        toast({
          title: status === 'VALID' ? "Validação OK" : "Validação Falhou",
          description: validationMessage,
          variant: status === 'VALID' ? "default" : "destructive",
        });
        
        // Refresh checks list
        fetchChecks();
        
        // Reset upload
        setUploadedFile(null);
        setInstructionFile(null);
        setParsedData(null);
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        variant: "destructive",
        title: "Erro na validação",
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const clearUpload = () => {
    setUploadedFile(null);
    setInstructionFile(null);
    setParsedData(null);
  };

  const filteredChecks = checks.filter(check => {
    if (statusFilter !== "all" && check.status.toLowerCase() !== statusFilter) return false;
    if (dateFilter && !check.created_at.startsWith(dateFilter)) return false;
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      return (
        check.awb_number?.toLowerCase().includes(search) ||
        check.cnpj?.toLowerCase().includes(search) ||
        check.customer?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const getStatusIcon = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'valid':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'invalid':
        return <X className="w-4 h-4 text-destructive" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusClass = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'valid':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'invalid':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return 'bg-warning/20 text-warning border-warning/30';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR');
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `
          }}
        />
        
        {/* Animated Lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(6)].map((_, i) => (
            <div
              key={`line-${i}`}
              className="absolute h-full w-px bg-gradient-to-b from-primary/70 to-primary/10"
              style={{
                left: `${15 + i * 14}%`,
                transform: `skewX(${-20 + i * 8}deg)`,
              }}
            />
          ))}
        </div>

        {/* Floating Particles */}
        {[...Array(15)].map((_, i) => (
          <div
            key={`particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-primary/40 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-6 py-3 bg-background/30 backdrop-blur-sm border-b border-border/30">
        <div className="flex items-center gap-3">
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
            className="h-8 drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]"
          />
          <span className="text-muted-foreground text-xs tracking-[0.2em] uppercase hidden sm:block">
            Check AWB x CNPJ
          </span>
        </div>

        <div className="px-4 py-1.5 rounded-full bg-background/65 border border-border/30 text-muted-foreground text-sm">
          @{user?.username || "usuario"}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
          Check AWB x CNPJ
        </h1>

        {/* Upload Section */}
        <div 
          className="rounded-2xl p-6 mb-8"
          style={{
            background: 'rgba(4, 10, 30, 0.75)',
            backdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Upload size={20} className="text-primary" />
            Upload de Documento
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Main Document Upload */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">House AWB (PDF ou Imagem)</label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
                  ${isDragging 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border/50 hover:border-primary/50'
                  }
                `}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={(e) => handleFileSelect(e)}
                  className="hidden"
                />
                {uploadedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="text-primary" size={24} />
                    <span className="text-foreground">{uploadedFile.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); clearUpload(); }}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto text-muted-foreground mb-2" size={32} />
                    <p className="text-muted-foreground">
                      Arraste o arquivo ou clique para selecionar
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Instruction Document (Optional - for ZF) */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Instrução ZF (Opcional)
              </label>
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center border-border/50 hover:border-primary/50 transition-all cursor-pointer"
                onClick={() => document.getElementById('instruction-input')?.click()}
              >
                <input
                  id="instruction-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={(e) => handleFileSelect(e, true)}
                  className="hidden"
                />
                {instructionFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="text-primary" size={24} />
                    <span className="text-foreground">{instructionFile.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setInstructionFile(null); }}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                ) : (
                  <>
                    <FileText className="mx-auto text-muted-foreground mb-2" size={32} />
                    <p className="text-muted-foreground text-sm">
                      Para CNPJ composto ZF
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            <Button
              onClick={parseDocument}
              disabled={!uploadedFile || isParsing}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isParsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Extrair Dados
                </>
              )}
            </Button>

            <Button
              onClick={validateAwb}
              disabled={!parsedData || isValidating}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10"
            >
              {isValidating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Validar CNPJ
                </>
              )}
            </Button>
          </div>

          {/* Parsed Data Preview */}
          {parsedData && (
            <div className="mt-6 p-4 rounded-xl bg-background/50 border border-border/30">
              <h3 className="text-sm font-semibold text-foreground mb-3">Dados Extraídos</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">AWB:</span>
                  <p className="text-foreground font-medium">{parsedData.awb_number || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">CNPJ:</span>
                  <p className="text-foreground font-medium">{parsedData.cnpj || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente:</span>
                  <p className="text-foreground font-medium">{parsedData.customer || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Confiança:</span>
                  <p className={`font-medium ${
                    parsedData.confidence === 'high' ? 'text-green-400' :
                    parsedData.confidence === 'medium' ? 'text-warning' : 'text-destructive'
                  }`}>
                    {parsedData.confidence}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Origem:</span>
                  <p className="text-foreground font-medium">{parsedData.origin_airport || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Destino:</span>
                  <p className="text-foreground font-medium">{parsedData.destination_airport || '-'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Endereço:</span>
                  <p className="text-foreground font-medium truncate">{parsedData.delivery_address || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        <div 
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(4, 10, 30, 0.75)',
            backdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Histórico de Validações</h2>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Buscar AWB, CNPJ ou Cliente..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-10 bg-background/50 border-border/50"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-background/50 border-border/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="valid">Válido</SelectItem>
                <SelectItem value="invalid">Inválido</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pl-10 bg-background/50 border-border/50"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden border border-border/30">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/50 hover:bg-background/50">
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">AWB</TableHead>
                  <TableHead className="text-muted-foreground">CNPJ</TableHead>
                  <TableHead className="text-muted-foreground">Cliente</TableHead>
                  <TableHead className="text-muted-foreground">Destino</TableHead>
                  <TableHead className="text-muted-foreground">Data</TableHead>
                  <TableHead className="text-muted-foreground">Criado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingChecks ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                    </TableCell>
                  </TableRow>
                ) : filteredChecks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma validação encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChecks.map((check) => (
                    <TableRow 
                      key={check.id}
                      className="cursor-pointer hover:bg-primary/5"
                      onClick={() => setSelectedCheck(check)}
                    >
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${getStatusClass(check.status)}`}>
                          {getStatusIcon(check.status)}
                          {check.status}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-foreground">{check.awb_number || '-'}</TableCell>
                      <TableCell className="font-mono text-foreground">{check.cnpj || '-'}</TableCell>
                      <TableCell className="text-foreground">{check.customer || '-'}</TableCell>
                      <TableCell className="text-foreground">{check.destination || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(check.created_at)}</TableCell>
                      <TableCell className="text-muted-foreground">{check.username || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      <Dialog open={!!selectedCheck} onOpenChange={() => setSelectedCheck(null)}>
        <DialogContent className="bg-card border-border/50 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {selectedCheck && getStatusIcon(selectedCheck.status)}
              Detalhes da Validação
            </DialogTitle>
          </DialogHeader>
          
          {selectedCheck && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">AWB</label>
                  <p className="text-foreground font-mono">{selectedCheck.awb_number || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">CNPJ</label>
                  <p className="text-foreground font-mono">{selectedCheck.cnpj || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Cliente</label>
                  <p className="text-foreground">{selectedCheck.customer || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Status</label>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${getStatusClass(selectedCheck.status)}`}>
                    {getStatusIcon(selectedCheck.status)}
                    {selectedCheck.status}
                  </span>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Origem</label>
                  <p className="text-foreground">{selectedCheck.origin || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Destino</label>
                  <p className="text-foreground">{selectedCheck.destination || '-'}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">Mensagem de Validação</label>
                <p className="text-foreground">{selectedCheck.validation_message || '-'}</p>
              </div>
              
              {selectedCheck.rule_email && (
                <div>
                  <label className="text-sm text-muted-foreground">Email Despachante</label>
                  <p className="text-primary">{selectedCheck.rule_email}</p>
                </div>
              )}
              
              <div className="pt-4 border-t border-border/30 text-sm text-muted-foreground">
                Criado em {formatDate(selectedCheck.created_at)} por {selectedCheck.username || '-'}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CheckAwb;
