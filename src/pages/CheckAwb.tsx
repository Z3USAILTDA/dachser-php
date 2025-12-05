// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Type assertion to bypass strict typing (DB schema not in sync)
const db = supabase as any;
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
      const { data, error } = await supabase
        .from("awb_check")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setChecks(data || []);
    } catch (error) {
      console.error("Error fetching checks:", error);
      toast.error("Erro ao carregar validações");
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
        const { data, error } = await supabase
          .from("parsed_awb")
          .select("*")
          .eq("id", check.parsed_awb_id)
          .single();

        if (error) throw error;
        setSelectedParsedData(data);
      } catch (error) {
        console.error("Error fetching parsed data:", error);
      }
    }

    // Buscar email do despachante da matriz de regras (apenas para Klabin)
    if (check.customer === "KLABIN") {
      try {
        const { data: ruleData } = await supabase
          .from("rule_row")
          .select("email_despachante")
          .eq("cnpj", check.cnpj)
          .not("email_despachante", "is", null)
          .limit(1)
          .maybeSingle();

        if (ruleData?.email_despachante) {
          setSelectedEmailDespachante(ruleData.email_despachante);
        }
      } catch (error) {
        console.error("Error fetching email despachante:", error);
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
      const { error } = await supabase
        .from("awb_check")
        .delete()
        .eq("id", checkToDelete);

      if (error) throw error;
      toast.success("Validação excluída com sucesso");
      fetchChecks();
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

      const { data, error } = await supabase.functions.invoke("export-to-mariadb");

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message);
        data.results?.forEach((r: any) => {
          if (r.exported > 0) {
            toast.info(`${r.table}: ${r.exported} registros exportados`);
          }
          if (r.errors?.length > 0) {
            toast.warning(`${r.table}: ${r.errors.length} erros`);
          }
        });
      } else {
        throw new Error(data?.error || "Erro desconhecido");
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
        await processMultipleFiles(validFiles, user.id.toString());
      } else {
        await processSingleFile(validFiles[0], user.id.toString());
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

  const processSingleFile = async (file: File, odigos_by_user_id: string) => {
    // Upload do arquivo para storage
    const fileExt = file.name.split(".").pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("hawb-documents")
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("hawb-documents")
      .getPublicUrl(fileName);

    // Criar registro do documento
    const { data: docData, error: docError } = await supabase
      .from("document")
      .insert({
        type: "HAWB",
        filename: file.name,
        mime: file.type,
        file_url: publicUrl,
        uploaded_by_user_id: odigos_by_user_id,
      })
      .select()
      .single();

    if (docError) throw docError;

    // Parsear documento via edge function
    const formData = new FormData();
    formData.append("file", file);

    const { data: parsedData, error: parseError } = await supabase.functions.invoke(
      "parse-awb",
      { body: formData }
    );

    if (parseError || !parsedData || parsedData.error) {
      throw new Error(parsedData?.error || "Erro ao extrair dados do documento");
    }

    await processValidation(parsedData, docData.id, userId);
    toast.success("Documento processado com sucesso!");
  };

  const processMultipleFiles = async (files: File[], userId: string) => {
    toast.info("Processando arquivos...");

    const parsedResults: Array<{
      file: File;
      parsed: any;
      isLikelyInstruction: boolean;
      cnpjSuffixPattern: string | null;
    }> = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

      const { data: parsed } = await supabase.functions.invoke("parse-awb", {
        body: formData,
      });

      const references = parsed?.references || [];
      let cnpjSuffixPattern: string | null = null;
      for (const ref of references) {
        const match = ref.match(/CNPJ\s*(\d{2})-(\d{2})/i) || ref.match(/^(\d{2})-(\d{2})$/);
        if (match) {
          cnpjSuffixPattern = match[1] + match[2];
          break;
        }
      }

      const cnpj = parsed?.cnpj?.replace(/\D/g, "") || "";
      const isLikelyFabricatedCnpj = cnpj.length === 14 && (
        cnpj.startsWith("0176") ||
        cnpj.startsWith("0001") ||
        /^0\d{3}0+\d{2,4}$/.test(cnpj)
      );
      const isLikelyInstruction = !!cnpjSuffixPattern || isLikelyFabricatedCnpj;

      parsedResults.push({
        file,
        parsed,
        isLikelyInstruction,
        cnpjSuffixPattern,
      });
    }

    const instructionResult = parsedResults.find(r => r.isLikelyInstruction);
    const houseResult = parsedResults.find(r => {
      const cnpj = r.parsed?.cnpj?.replace(/\D/g, "") || "";
      return cnpj.length === 14 && r.parsed?.awbNumber && !r.isLikelyInstruction;
    }) || parsedResults.find(r => {
      const cnpj = r.parsed?.cnpj?.replace(/\D/g, "") || "";
      return cnpj.length === 14 && r.parsed?.awbNumber && r !== instructionResult;
    });

    if (!houseResult) {
      throw new Error("Nenhum documento identificado como House AWB com CNPJ válido.");
    }

    const houseFile = houseResult.file;
    const houseParsed = houseResult.parsed;
    toast.info(`House AWB identificado: ${houseFile.name}`);

    // Upload do House
    const houseExt = houseFile.name.split(".").pop();
    const houseFileName = `${userId}/${Date.now()}-house.${houseExt}`;
    await supabase.storage.from("hawb-documents").upload(houseFileName, houseFile);

    const { data: { publicUrl: houseUrl } } = supabase.storage
      .from("hawb-documents")
      .getPublicUrl(houseFileName);

    const { data: docData, error: docError } = await supabase
      .from("document")
      .insert({
        type: "HAWB",
        filename: houseFile.name,
        mime: houseFile.type,
        file_url: houseUrl,
        uploaded_by_user_id: userId,
      })
      .select()
      .single();

    if (docError) throw docError;

    let finalCnpj = houseParsed.cnpj;

    if (instructionResult) {
      toast.info(`Instrução identificada: ${instructionResult.file.name}`);
      let cnpjSuffix: string | null = instructionResult.cnpjSuffixPattern;

      if (!cnpjSuffix) {
        const instructionFormData = new FormData();
        instructionFormData.append("file", instructionResult.file);
        const { data: instructionParsed } = await supabase.functions.invoke("parse-instruction", {
          body: instructionFormData,
        });
        cnpjSuffix = instructionParsed?.cnpjSuffix?.replace(/\D/g, "") || null;
      }

      if (cnpjSuffix && houseParsed.cnpj) {
        const baseCnpj = houseParsed.cnpj.replace(/\D/g, "");
        if (cnpjSuffix.length === 4) {
          finalCnpj = baseCnpj.substring(0, 8) + cnpjSuffix + baseCnpj.substring(12, 14);
          toast.info(`CNPJ ajustado conforme instrução: filial ${cnpjSuffix}`);
        } else if (cnpjSuffix.length >= 2 && cnpjSuffix.length <= 6) {
          const prefixLength = 14 - cnpjSuffix.length;
          finalCnpj = baseCnpj.substring(0, prefixLength) + cnpjSuffix;
          toast.info(`CNPJ ajustado conforme instrução: ...${cnpjSuffix}`);
        }
      }
    }

    const composedParsedData = {
      ...houseParsed,
      cnpj: finalCnpj,
      instructionUsed: !!instructionResult,
    };

    await processValidation(composedParsedData, docData.id, userId);
    toast.success("Documentos processados com sucesso!");
  };

  const processValidation = async (parsedData: any, documentId: string, userId: string) => {
    try {
      const { data: parsedAwbData, error: parsedError } = await supabase
        .from("parsed_awb")
        .insert({
          document_id: documentId,
          awb_number: parsedData.awbNumber,
          cnpj_detected: parsedData.cnpj,
          origin_detected: parsedData.origin,
          destination_detected: parsedData.destination,
          shipper: parsedData.shipper,
          consignee: parsedData.consignee,
          carrier: parsedData.carrier,
          gross_weight_kg: parsedData.grossWeight,
          chargeable_weight_kg: parsedData.chargeableWeight,
          routing_legs: parsedData.routingLegs,
          flight_numbers: parsedData.flightNumbers,
          mrn: parsedData.mrn,
          hs_codes: parsedData.hsCodes,
          dims: parsedData.dimensions,
          incoterms: parsedData.incoterms,
          reference_numbers: parsedData.references,
        })
        .select()
        .single();

      if (parsedError) throw parsedError;

      const result = await validateAgainstMatrix(parsedData);
      const dbResult = result.result === "COMPATIVEL" ? "OK" : "BLOQUEIO";

      const { error: checkError } = await supabase
        .from("awb_check")
        .insert({
          awb: parsedData.awbNumber || "N/A",
          cnpj: parsedData.cnpj || "N/A",
          origin: parsedData.origin || "N/A",
          destination: parsedData.destination || "N/A",
          customer: result.customer,
          result: dbResult,
          reason: result.reason,
          rule_matrix_version: result.matrixVersion,
          uploaded_by_user_id: userId,
          parsed_awb_id: parsedAwbData.id,
        });

      if (checkError) throw checkError;

      await supabase.from("log_entry").insert({
        entity: "CHECK",
        action: "RUN_CHECK",
        entity_id: documentId,
        user_id: userId,
        details: `AWB ${parsedData.awbNumber} validado - Resultado: ${result.result}`,
      });
    } catch (error) {
      console.error("Erro na validação:", error);
      throw error;
    }
  };

  const normalizeAddress = (address: string): string => {
    return address
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/rodovia|rod\.|via|av\.|avenida|rua|r\./g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const addressMatches = (docAddress: string, matrixAddress: string): boolean => {
    const normalizedDoc = normalizeAddress(docAddress);
    const normalizedMatrix = normalizeAddress(matrixAddress);

    const matrixWords = normalizedMatrix.split(" ").filter(w => w.length > 2);

    let matchCount = 0;
    for (const matrixWord of matrixWords) {
      if (normalizedDoc.includes(matrixWord)) {
        matchCount++;
      }
    }

    const matchRatio = matrixWords.length > 0 ? matchCount / matrixWords.length : 0;
    return matchRatio >= 0.6;
  };

  const validateAgainstMatrix = async (parsedData: any) => {
    const missingFields = [];
    if (!parsedData.cnpj) missingFields.push("CNPJ");
    if (!parsedData.origin) missingFields.push("Origem");
    if (!parsedData.destination) missingFields.push("Destino");

    if (missingFields.length > 0) {
      throw new Error(`Campos não encontrados no documento: ${missingFields.join(", ")}`);
    }

    const normalizedCnpj = parsedData.cnpj.replace(/\D/g, "");
    if (normalizedCnpj.length !== 14) {
      throw new Error("CNPJ inválido detectado");
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: matrices, error: matrixError } = await supabase
      .from("rule_matrix")
      .select("*")
      .eq("is_active", true)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`);

    if (matrixError) throw matrixError;
    if (!matrices || matrices.length === 0) {
      throw new Error("Nenhuma matriz de regras ativa encontrada");
    }

    const extractedCustomer = parsedData.customer as "KLABIN" | "ZF" | null;
    if (!extractedCustomer) {
      return {
        result: "INCOMPATIVEL" as const,
        reason: "Não foi possível identificar o cliente (Klabin/ZF) no consignee do documento",
        customer: "KLABIN" as const,
        matrixVersion: matrices[0].version,
      };
    }

    const customerMatrix = matrices.find(m => m.customer === extractedCustomer);
    if (!customerMatrix) {
      return {
        result: "INCOMPATIVEL" as const,
        reason: `Matriz ${extractedCustomer} não encontrada ou inativa`,
        customer: extractedCustomer,
        matrixVersion: matrices[0].version,
      };
    }

    const { data: rules, error: rulesError } = await supabase
      .from("rule_row")
      .select("*")
      .eq("rule_matrix_id", customerMatrix.id)
      .eq("cnpj", normalizedCnpj);

    if (rulesError) throw rulesError;

    let result: "COMPATIVEL" | "INCOMPATIVEL";
    let reason: string;

    if (rules && rules.length > 0) {
      const consigneeAddress = parsedData.consignee || "";

      const airportMatch = rules.find(r =>
        r.airport_code &&
        r.airport_code !== "N/A" &&
        (r.airport_code === parsedData.origin.toUpperCase() ||
          r.airport_code === parsedData.destination.toUpperCase())
      );

      const addressMatch = rules.find(r =>
        r.endereco_completo && addressMatches(consigneeAddress, r.endereco_completo)
      );

      if (airportMatch) {
        result = "COMPATIVEL";
        reason = "CNPJ e aeroporto compatíveis";
      } else if (addressMatch) {
        result = "COMPATIVEL";
        reason = "CNPJ e endereço compatíveis";
      } else {
        const hasValidAirport = rules.some(r => r.airport_code && r.airport_code !== "N/A");
        const hasValidAddress = rules.some(r => r.endereco_completo && r.endereco_completo.trim() !== "");

        if (!hasValidAirport && !hasValidAddress) {
          result = "COMPATIVEL";
          reason = "CNPJ compatível";
        } else {
          result = "INCOMPATIVEL";
          reason = "Aeroporto não compatível";
        }
      }
    } else {
      result = "INCOMPATIVEL";
      reason = "CNPJ não compatível";
    }

    return {
      result,
      reason,
      customer: extractedCustomer,
      matrixVersion: customerMatrix.version,
    };
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
    const matchesSearch =
      check.awb.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
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
        
        {/* Radial gradient overlay */}
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
        {[...Array(20)].map((_, i) => (
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

      {/* Top Left - Back + Header */}
      <div className="fixed top-[18px] left-[18px] z-[1000] flex items-center gap-[18px]">
        <button
          onClick={() => navigate("/dashboard")}
          className="w-10 h-10 rounded-full border border-primary/90 bg-primary/15 text-primary flex items-center justify-center backdrop-blur-sm hover:bg-primary/25 transition-all"
        >
          <ArrowLeft size={20} />
        </button>

        <header>
          <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
          <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">
            Intelligent Logistics – Check AWB x CNPJ
          </p>
          <div className="flex gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
          </div>
        </header>
      </div>

      {/* Top Right - User */}
      <div className="fixed top-[18px] right-[18px] z-[1000] flex items-center gap-2.5 text-[0.85rem]">
        <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
          @{user?.username || user?.email}
        </div>
        {userRole === "ADMIN" && (
          <>
            <button
              type="button"
              onClick={handleExportToMariaDB}
              disabled={isExporting}
              className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50"
              title="Exportar para MariaDB"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/logs")}
              className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
              title="Logs do sistema"
            >
              <TerminalSquare className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[1280px] mx-auto mt-[130px] mb-12 px-4 space-y-[18px]">
        {/* CARD DE BUSCA + FILTROS */}
        <section 
          className="rounded-2xl p-4"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#aaaaaa]" />
                <input
                  type="text"
                  placeholder="Buscar por AWB, CNPJ ou cliente"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-11 w-full pl-11 pr-4 rounded-full border border-[rgba(255,255,255,.14)] bg-[#13141a] text-[#f5f5f5] text-[0.85rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,.8)]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                      <FilterIcon className="h-3.5 w-3.5 text-[#ffc800]" />
                      <span className="text-[0.74rem] tracking-[0.12em] uppercase text-[#aaaaaa]">Status</span>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 w-[150px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.85rem]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="OK">Compatível</SelectItem>
                        <SelectItem value="BLOQUEIO">Incompatível</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800]" />
                      <span className="text-[0.74rem] tracking-[0.12em] uppercase text-[#aaaaaa]">Período</span>
                    </div>
                    <Select value={periodFilter} onValueChange={setPeriodFilter}>
                      <SelectTrigger className="h-9 w-[150px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.85rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Últimos 7 dias</SelectItem>
                        <SelectItem value="30">Últimos 30 dias</SelectItem>
                        <SelectItem value="90">Últimos 90 dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <button
                    onClick={fetchChecks}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 h-9 px-[14px] rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.25)] text-[#f5f5f5] text-[0.8rem] font-bold uppercase tracking-[0.12em] hover:bg-[rgba(255,255,255,.08)] disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    Atualizar
                  </button>
                </div>

                <Button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="h-10 rounded-full px-5 bg-[#ffc800] text-black font-semibold text-sm shadow-[0_0_22px_rgba(255,200,0,.6)] hover:bg-[#f5b843]"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Nova Validação
                </Button>
              </div>
            </div>
          </section>

          {/* TABELA DE HISTÓRICO */}
          <section 
            className="rounded-2xl p-[14px_16px_12px]"
            style={{
              background: 'rgba(4,5,15,.94)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 18px 40px rgba(0,0,0,.9)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[0.86rem] tracking-[0.18em] uppercase text-[#f5f5f5]">
                  Resumo de Validações
                </div>
                <div className="text-[0.76rem] text-[#aaaaaa] mt-1">
                  Consultas recentes de AWB/HAWB por status e cliente
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[rgba(255,255,255,.06)] border border-[rgba(255,255,255,.20)] text-[0.75rem]">
                <span className="w-[7px] h-[7px] rounded-full bg-[#ffc800]" />
                <span>{filteredChecks.length} registros</span>
              </div>
            </div>

            <div 
              className="mt-1.5 max-h-[52vh] overflow-auto rounded-xl border border-[rgba(255,255,255,.16)]"
            >
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[rgba(255,255,255,.09)] bg-[#14151c]">
                    <TableHead className="text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">AWB</TableHead>
                    <TableHead className="text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">CNPJ</TableHead>
                    <TableHead className="text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">Rota</TableHead>
                    <TableHead className="text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">Cliente</TableHead>
                    <TableHead className="text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">Status</TableHead>
                    <TableHead className="text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">Motivo</TableHead>
                    <TableHead className="text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">Data</TableHead>
                    <TableHead className="text-right text-[0.75rem] uppercase tracking-[0.12em] text-[#aaaaaa] sticky top-0 bg-[#14151c] z-5">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredChecks.map(check => (
                    <TableRow key={check.id} className="border-b border-[rgba(255,255,255,.09)] hover:bg-[rgba(255,255,255,.05)]">
                      <TableCell className="font-mono text-[0.82rem] py-[9px] px-[10px]">{check.awb}</TableCell>
                      <TableCell className="font-mono text-[0.82rem] py-[9px] px-[10px]">{check.cnpj}</TableCell>
                      <TableCell className="font-mono text-[0.82rem] py-[9px] px-[10px]">
                        {check.origin} → {check.destination}
                      </TableCell>
                      <TableCell className="text-[0.82rem] py-[9px] px-[10px]">{check.customer}</TableCell>
                      <TableCell className="text-[0.82rem] py-[9px] px-[10px]">{getResultBadge(check.result)}</TableCell>
                      <TableCell className="max-w-xs text-[0.82rem] py-[9px] px-[10px] truncate text-[#aaaaaa]" title={check.reason || ""}>
                        {check.reason || (check.result === "OK" ? "CNPJ e aeroporto compatíveis" : "CNPJ não compatível")}
                      </TableCell>
                      <TableCell className="text-[0.82rem] py-[9px] px-[10px]">
                        {format(new Date(check.created_at), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-right py-[9px] px-[10px]">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#aaaaaa] hover:bg-[rgba(255,255,255,.1)]"
                            onClick={() => handleViewDetails(check)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#ff4d4f] hover:bg-[rgba(255,77,79,.12)]"
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
                      <TableCell colSpan={8} className="text-center py-6 text-sm text-[#aaaaaa]">
                        Nenhuma validação encontrada para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Matriz de Regras (ADMIN) */}
          {userRole === "ADMIN" && (
            <Collapsible open={isMatrixOpen} onOpenChange={setIsMatrixOpen}>
              <section 
                className="rounded-2xl"
                style={{
                  background: 'rgba(5,6,18,.9)',
                  border: '1px solid rgba(255,255,255,.12)',
                  boxShadow: '0 18px 40px rgba(0,0,0,.85)',
                }}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-[rgba(255,255,255,.05)]"
                  >
                    <span className="text-base font-semibold">Matriz de Regras</span>
                    {isMatrixOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6">
                    <RuleMatrixManager userRole={userRole} />
                  </div>
                </CollapsibleContent>
              </section>
            </Collapsible>
          )}
      </main>

      {/* MODAL UPLOAD */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent 
          className="sm:max-w-md rounded-2xl"
          style={{
            background: 'rgba(5,6,18,.95)',
            border: '1px solid rgba(255,255,255,.12)',
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl text-[#f5f5f5]">Nova Validação de AWB/HAWB</DialogTitle>
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
                isDragging ? "border-[#ffc800] bg-[rgba(255,200,0,.05)]" : "border-[rgba(255,255,255,.20)] hover:border-[rgba(255,200,0,.5)]"
              } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-16 w-16 text-[#ffc800] mx-auto mb-4 animate-spin" />
                  <p className="text-lg text-[#f5f5f5] mb-2">Processando documento...</p>
                  <p className="text-sm text-[#aaaaaa]">
                    Extraindo dados e validando contra matriz de regras
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-16 w-16 text-[#aaaaaa] mx-auto mb-4" />
                  <p className="text-lg text-[#f5f5f5] mb-2">
                    {isDragging ? "Solte o(s) arquivo(s) aqui" : "Arraste arquivo(s) ou clique para selecionar"}
                  </p>
                  <p className="text-sm text-[#aaaaaa]">Formatos aceitos: PDF ou imagens</p>
                  <p className="text-xs text-[rgba(255,200,0,.8)] mt-2">
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
        <DialogContent 
          className="sm:max-w-2xl rounded-2xl"
          style={{
            background: 'rgba(5,6,18,.95)',
            border: '1px solid rgba(255,255,255,.12)',
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl text-[#f5f5f5]">Descrição Detalhada</DialogTitle>
          </DialogHeader>
          {selectedCheck && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[#aaaaaa]">AWB</p>
                  <p className="font-mono text-sm text-[#f5f5f5]">{selectedCheck.awb}</p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa]">CNPJ</p>
                  <p className="font-mono text-sm text-[#f5f5f5]">{selectedCheck.cnpj}</p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa]">Rota</p>
                  <p className="font-mono text-sm text-[#f5f5f5]">
                    {selectedCheck.origin} → {selectedCheck.destination}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa]">Cliente</p>
                  <p className="text-sm text-[#f5f5f5]">{selectedCheck.customer}</p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa]">Status</p>
                  {getResultBadge(selectedCheck.result)}
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa]">Motivo</p>
                  <p className="text-sm text-[#f5f5f5]">
                    {selectedCheck.reason ||
                      (selectedCheck.result === "OK" ? "CNPJ e aeroporto compatíveis" : "CNPJ não compatível")}
                  </p>
                </div>
              </div>

              {selectedParsedData && (
                <div className="border-t border-[rgba(255,255,255,.12)] pt-4 mt-4">
                  <h3 className="font-semibold mb-3 text-[#f5f5f5]">Dados Adicionais</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[#aaaaaa]">Ref Othello</p>
                      <p className="font-mono text-[#f5f5f5]">
                        {selectedParsedData.mrn || "Referência não encontrada"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#aaaaaa]">Transportadora</p>
                      <p className="text-[#f5f5f5]">{selectedParsedData.carrier || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[#aaaaaa]">Remetente</p>
                      <p className="text-[#f5f5f5]">{selectedParsedData.shipper || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[#aaaaaa]">Destinatário</p>
                      <p className="text-[#f5f5f5]">{selectedParsedData.consignee || "N/A"}</p>
                    </div>
                    {selectedParsedData.gross_weight_kg && (
                      <div>
                        <p className="text-[#aaaaaa]">Peso Bruto</p>
                        <p className="text-[#f5f5f5]">{selectedParsedData.gross_weight_kg} kg</p>
                      </div>
                    )}
                    {selectedParsedData.chargeable_weight_kg && (
                      <div>
                        <p className="text-[#aaaaaa]">Peso Taxável</p>
                        <p className="text-[#f5f5f5]">{selectedParsedData.chargeable_weight_kg} kg</p>
                      </div>
                    )}
                    {selectedEmailDespachante && (
                      <div className="col-span-2">
                        <p className="text-[#aaaaaa]">E-mail Despachante</p>
                        <p className="text-[#f5f5f5]">{selectedEmailDespachante}</p>
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
        <AlertDialogContent 
          className="rounded-2xl"
          style={{
            background: 'rgba(5,6,18,.95)',
            border: '1px solid rgba(255,255,255,.12)',
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl text-[#f5f5f5]">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-[#aaaaaa]">
              Tem certeza que deseja excluir esta validação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.25)] text-[#f5f5f5] hover:bg-[rgba(255,255,255,.1)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="rounded-full bg-[#ff4d4f] text-white hover:bg-[#ff7171]">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CheckAwb;
