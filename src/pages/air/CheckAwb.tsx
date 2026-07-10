// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUsageLog } from "@/hooks/useUsageLog";
import {
  fetchChecks, deleteCheck, uploadDocument, parseDocument,
  parseDocumentById, createCheck, updateParsed, fetchActiveMatrices, fetchRules,
} from "@/services/checkAwbService";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, RefreshCw, Filter as FilterIcon, UploadCloud, FileText, Trash2, TerminalSquare, Loader2, ChevronDown, ChevronUp, Plus, Database, ArrowLeft, RotateCw, FileCheck, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { RuleMatrixManager } from "@/components/air/RuleMatrixManager";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";

interface AwbCheck {
  id: number;
  awb_number: string;
  cnpj: string;
  origin: string;
  destination: string;
  customer: "KLABIN" | "ZF";
  validation_status: "OK" | "ALERTA" | "BLOQUEIO" | "PENDING";
  validation_message: string | null;
  matched_rule_id: number | null;
  created_by: number | null;
  created_at: string;
  // Joined fields from parsed_awb
  extracted_awb: string | null;
  extracted_cnpj: string | null;
  extracted_origin: string | null;
  extracted_destination: string | null;
  extracted_customer: string | null;
  confidence_score: number | null;
  // Additional parsed fields
  shipper: string | null;
  consignee: string | null;
  carrier: string | null;
  gross_weight_kg: number | null;
  chargeable_weight_kg: number | null;
  mrn: string | null;
  routing_legs: string | null;
  flight_numbers: string | null;
  hs_codes: string | null;
  dims: string | null;
  incoterms: string | null;
  references: string | null;
  // File info
  hawb_file_name: string | null;
  hawb_file_path: string | null;
  // Rule info
  rule_email: string | null;
  rule_airport: string | null;
  rule_ref_othello: string | null;
}

interface User {
  id: number;
  email: string;
  username: string;
  is_admin: number;
}

const CheckAwb = () => {
  useUsageLog({ endpoint: "/air/check-awb" });
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<AwbCheck[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("30");

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<AwbCheck | null>(null);
  const [selectedEmailDespachante, setSelectedEmailDespachante] = useState<string | null>(null);
  const [checkToDelete, setCheckToDelete] = useState<number | null>(null);

  // Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  const [reextractProgress, setReextractProgress] = useState({ current: 0, total: 0 });

  // Matrix panel state
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setUserRole(parsedUser.is_admin === 1 ? "ADMIN" : "OPERACAO");
      loadChecks();
    } else {
      navigate("/");
    }
    setLoading(false);
  }, [navigate]);

  const loadChecks = async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchChecks();
      if (!data?.success) throw new Error(data?.error || "Erro ao buscar validações");
      setChecks(data.checks || []);
    } catch (error) {
      console.error("Error fetching checks:", error);
      toast.error("Erro ao carregar validações");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewDetails = (check: AwbCheck) => {
    setSelectedCheck(check);
    // O email do despachante já vem no campo rule_email do JOIN
    setSelectedEmailDespachante(check.rule_email || null);
    setIsDetailsModalOpen(true);
  };

  const handleDeleteClick = (id: number) => {
    setCheckToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!checkToDelete) return;
    try {
      const data = await deleteCheck(checkToDelete, user?.username);
      if (!data?.success) throw new Error(data?.error || "Erro ao excluir");
      toast.success("Validação excluída com sucesso");
      loadChecks();
    } catch (error: any) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir validação");
    } finally {
      setIsDeleteDialogOpen(false);
      setCheckToDelete(null);
    }
  };

  const handleExportToMariaDB = async () => {
    toast.info("Exportação não disponível — dados já residem no MariaDB.");
  };

  const handleReextractAll = async () => {
    const eligible = checks.filter(c => c.hawb_document_id);
    if (eligible.length === 0) {
      toast.error("Nenhum processo com documento armazenado para reextrair");
      return;
    }

    setIsReextracting(true);
    setReextractProgress({ current: 0, total: eligible.length });
    let successCount = 0, errorCount = 0;

    toast.info(`Iniciando reextração de ${eligible.length} processos...`);

    for (let i = 0; i < eligible.length; i++) {
      const check = eligible[i];
      setReextractProgress({ current: i + 1, total: eligible.length });
      try {
        const parsedData = await parseDocumentById(check.hawb_document_id);
        if (!parsedData?.success) { errorCount++; continue; }

        await updateParsed(check.id, {
          shipper: parsedData.shipper,
          consignee: parsedData.consignee,
          carrier: parsedData.carrier,
          grossWeight: parsedData.grossWeight,
          chargeableWeight: parsedData.chargeableWeight,
          mrn: parsedData.mrn,
          routingLegs: parsedData.routingLegs,
          flightNumbers: parsedData.flightNumbers,
          hsCodes: parsedData.hsCodes,
          dimensions: parsedData.dimensions,
          incoterms: parsedData.incoterms,
          references: parsedData.references,
          extractedAwb: parsedData.awbNumber,
          extractedCnpj: parsedData.cnpj,
          extractedOrigin: parsedData.origin,
          extractedDestination: parsedData.destination,
          extractedCustomer: parsedData.customer,
        });
        successCount++;
      } catch (err) {
        console.error(`Erro no check ${check.id}:`, err);
        errorCount++;
      }
    }

    setIsReextracting(false);
    setReextractProgress({ current: 0, total: 0 });
    toast.success(`Reextração concluída: ${successCount} sucesso, ${errorCount} erros`);
    loadChecks();
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
      loadChecks();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Erro ao processar documento(s)");
    } finally {
      setIsUploading(false);
    }
  };

  const processSingleFile = async (file: File, userId: string) => {
    const uploadResult = await uploadDocument(file, user?.id);
    if (!uploadResult?.success) throw new Error(uploadResult?.error || "Erro no upload");
    const documentId = uploadResult.documentId;

    const parsedData = await parseDocument(file, "house_awb");
    if (!parsedData || parsedData.error) throw new Error(parsedData?.error || "Erro ao extrair dados do documento");

    await processValidation(parsedData, documentId, userId);
    toast.success("Documento processado com sucesso!");
  };

  const processMultipleFiles = async (files: File[], userId: string) => {
    toast.info("Processando arquivos...");

    const parsedResults: Array<{ file: File; parsed: any; isLikelyInstruction: boolean; cnpjSuffixPattern: string | null }> = [];

    for (const file of files) {
      const parsed = await parseDocument(file, "house_awb");
      const references = parsed?.references || [];
      let cnpjSuffixPattern: string | null = null;
      for (const ref of references) {
        if (typeof ref === 'string') {
          const match = ref.match(/CNPJ\s*(\d{2})-(\d{2})/i) || ref.match(/^(\d{2})-(\d{2})$/);
          if (match) { cnpjSuffixPattern = match[1] + match[2]; break; }
        }
      }
      const cnpj = parsed?.cnpj?.replace(/\D/g, "") || "";
      const isLikelyFabricatedCnpj = cnpj.length === 14 && (cnpj.startsWith("0176") || cnpj.startsWith("0001") || /^0\d{3}0+\d{2,4}$/.test(cnpj));
      parsedResults.push({ file, parsed, isLikelyInstruction: !!cnpjSuffixPattern || isLikelyFabricatedCnpj, cnpjSuffixPattern });
    }

    const instructionResult = parsedResults.find(r => r.isLikelyInstruction);
    const houseResult = parsedResults.find(r => {
      const cnpj = r.parsed?.cnpj?.replace(/\D/g, "") || "";
      return cnpj.length === 14 && r.parsed?.awbNumber && !r.isLikelyInstruction;
    }) || parsedResults.find(r => r !== instructionResult);

    if (!houseResult) throw new Error("Nenhum documento identificado como House AWB com CNPJ válido.");

    toast.info(`House AWB identificado: ${houseResult.file.name}`);

    const uploadResult = await uploadDocument(houseResult.file, user?.id);
    if (!uploadResult?.success) throw new Error(uploadResult?.error || "Erro no upload");
    const documentId = uploadResult.documentId;

    let finalCnpj = houseResult.parsed.cnpj;

    if (instructionResult) {
      toast.info(`Instrução identificada: ${instructionResult.file.name}`);
      let cnpjSuffix = instructionResult.cnpjSuffixPattern;
      if (!cnpjSuffix) {
        const instrParsed = await parseDocument(instructionResult.file, "instruction");
        cnpjSuffix = instrParsed?.cnpjSuffix?.replace(/\D/g, "") || null;
      }
      if (cnpjSuffix && houseResult.parsed.cnpj) {
        const base = houseResult.parsed.cnpj.replace(/\D/g, "");
        if (cnpjSuffix.length === 4) {
          finalCnpj = base.substring(0, 8) + cnpjSuffix + base.substring(12, 14);
          toast.info(`CNPJ ajustado conforme instrução: filial ${cnpjSuffix}`);
        } else if (cnpjSuffix.length >= 2 && cnpjSuffix.length <= 6) {
          finalCnpj = base.substring(0, 14 - cnpjSuffix.length) + cnpjSuffix;
          toast.info(`CNPJ ajustado conforme instrução: ...${cnpjSuffix}`);
        }
      }
    }

    await processValidation({ ...houseResult.parsed, cnpj: finalCnpj }, documentId, userId);
    toast.success("Documentos processados com sucesso!");
  };

  const processValidation = async (parsedData: any, documentId: number | undefined, userId: string) => {
    const result = await validateAgainstMatrix(parsedData);
    const dbResult = result.result === "COMPATIVEL" ? "OK" : "BLOQUEIO";
    const data = await createCheck({
      awbNumber: parsedData.awbNumber || "N/A",
      cnpj: parsedData.cnpj?.replace(/\D/g, "") || "N/A",
      origin: parsedData.origin || "N/A",
      destination: parsedData.destination || "N/A",
      customer: result.customer,
      validationStatus: dbResult,
      validationMessage: result.reason,
      matchedRuleId: result.matchedRuleId || null,
      createdBy: userId,
      documentId: documentId || null,
      extractedAwb: parsedData.awbNumber,
      extractedCnpj: parsedData.cnpj,
      extractedOrigin: parsedData.origin,
      extractedDestination: parsedData.destination,
      extractedCustomer: parsedData.customer,
      confidenceScore: parsedData.confidence === "high" ? 0.9 : parsedData.confidence === "medium" ? 0.7 : 0.5,
      shipper: parsedData.shipper,
      consignee: parsedData.consignee,
      carrier: parsedData.carrier,
      grossWeight: parsedData.grossWeight,
      chargeableWeight: parsedData.chargeableWeight,
      mrn: parsedData.mrn,
      routingLegs: parsedData.routingLegs,
      flightNumbers: parsedData.flightNumbers,
      hsCodes: parsedData.hsCodes,
      dimensions: parsedData.dimensions,
      incoterms: parsedData.incoterms,
      references: parsedData.references,
    });
    if (!data?.success) throw new Error(data?.error || "Erro ao salvar validação");
  };

  const normalizeCnpj = (val: any): string => {
    if (val === null || val === undefined) return "";
    let str = String(val).trim();
    // Se contiver .0 ao final (padrão float do Excel), remove
    str = str.replace(/\.0+$/, "");
    // Remove tudo que não for dígito
    str = str.replace(/\D/g, "");
    // Se tiver menos de 14 caracteres, preenche com zeros à esquerda
    if (str.length > 0 && str.length < 14) {
      str = str.padStart(14, "0");
    }
    return str;
  };

  const validateAgainstMatrix = async (parsedData: any) => {
    const missingFields = [];
    if (!parsedData.cnpj) missingFields.push("CNPJ");
    if (!parsedData.origin) missingFields.push("Origem");
    if (!parsedData.destination) missingFields.push("Destino");
    if (missingFields.length > 0) throw new Error(`Campos não encontrados: ${missingFields.join(", ")}`);

    const normalizedCnpj = normalizeCnpj(parsedData.cnpj);
    if (normalizedCnpj.length !== 14) throw new Error("CNPJ inválido detectado");

    const extractedCustomer = parsedData.customer?.toUpperCase() as "KLABIN" | "ZF" | null;
    if (!extractedCustomer) {
      console.log("[AwbValidation] Incompatibility: Customer (Klabin/ZF) not identified in document", {
        extractedCnpj: parsedData.cnpj,
        normalizedCnpj,
        customer: parsedData.customer
      });
      return { result: "INCOMPATIVEL" as const, reason: "Cliente (Klabin/ZF) não identificado", customer: "KLABIN" as const, matchedRuleId: null };
    }

    console.log("[AwbValidation] Starting validation process:", {
      extractedCnpj: parsedData.cnpj,
      normalizedCnpj,
      identifiedCustomer: extractedCustomer,
      documentOrigin: parsedData.origin,
      documentDestination: parsedData.destination
    });

    let matricesData;
    try {
      matricesData = await fetchActiveMatrices();
    } catch (e: any) {
      console.error("[AwbValidation] Error fetching active matrices:", e.message);
      return { result: "INCOMPATIVEL" as const, reason: "Não foi possível carregar a matriz de regras", customer: extractedCustomer, matchedRuleId: null };
    }

    if (!matricesData?.success || !matricesData?.matrices) {
      console.error("[AwbValidation] Active matrices load failure:", matricesData);
      return { result: "INCOMPATIVEL" as const, reason: "Não foi possível carregar a matriz de regras", customer: extractedCustomer, matchedRuleId: null };
    }

    if (matricesData.matrices.length === 0) {
      console.log("[AwbValidation] Incompatibility: Empty active matrices list");
      return { result: "INCOMPATIVEL" as const, reason: "Nenhuma regra encontrada na matriz ativa", customer: extractedCustomer, matchedRuleId: null };
    }

    const matrices = matricesData.matrices;
    const customerMatrix = matrices.find((m: any) => m.customer?.toUpperCase() === extractedCustomer);
    if (!customerMatrix) {
      console.log(`[AwbValidation] Incompatibility: Active matrix not found for customer ${extractedCustomer}`);
      return { result: "INCOMPATIVEL" as const, reason: `Matriz ${extractedCustomer} não encontrada`, customer: extractedCustomer, matchedRuleId: null };
    }

    // Verify matrix customer mapping
    if (customerMatrix.customer?.toUpperCase() !== extractedCustomer) {
      console.log("[AwbValidation] Incompatibility: Selected matrix customer mismatch", {
        matrixId: customerMatrix.id,
        matrixCustomer: customerMatrix.customer,
        extractedCustomer
      });
      return { result: "INCOMPATIVEL" as const, reason: "A versão da matriz selecionada não pertence ao cliente", customer: extractedCustomer, matchedRuleId: null };
    }

    // Verify matrix validity (effective_date). Date is YYYY-MM-DD.
    // The current analysis date is 2026-07-10.
    const todayStr = "2026-07-10"; // As per system instructions and validation timestamp
    const matrixEffectiveDate = customerMatrix.effective_date ? customerMatrix.effective_date.split('T')[0] : '';
    if (matrixEffectiveDate && matrixEffectiveDate > todayStr) {
      console.log("[AwbValidation] Incompatibility: Matrix effective date in the future", {
        matrixId: customerMatrix.id,
        effectiveDate: matrixEffectiveDate,
        analysisDate: todayStr
      });
      return { result: "INCOMPATIVEL" as const, reason: "A versão da matriz não está vigente", customer: extractedCustomer, matchedRuleId: null };
    }

    let rulesData;
    try {
      rulesData = await fetchRules(customerMatrix.id, normalizedCnpj);
    } catch (e: any) {
      console.error("[AwbValidation] Error fetching rules:", e.message);
      return { result: "INCOMPATIVEL" as const, reason: "Não foi possível carregar a matriz de regras", customer: extractedCustomer, matchedRuleId: null };
    }

    let allRulesData;
    try {
      allRulesData = await fetchRules(customerMatrix.id);
    } catch (e) {
      allRulesData = null;
    }
    const hasAnyRulesInMatrix = allRulesData?.success && allRulesData?.rules?.length > 0;
    if (!hasAnyRulesInMatrix) {
      console.log("[AwbValidation] Incompatibility: Active matrix contains 0 rules in t_awb_rule_row", {
        matrixId: customerMatrix.id
      });
      return { result: "INCOMPATIVEL" as const, reason: "Nenhuma regra encontrada na matriz ativa", customer: extractedCustomer, matchedRuleId: null };
    }

    const rules = rulesData?.rules || [];
    if (rules.length === 0) {
      console.log("[AwbValidation] Incompatibility: CNPJ not found in rules table for active matrix", {
        matrixId: customerMatrix.id,
        normalizedCnpj
      });
      return { result: "INCOMPATIVEL" as const, reason: "CNPJ não encontrado na versão selecionada", customer: extractedCustomer, matchedRuleId: null };
    }

    console.log("[AwbValidation] CNPJ found in rules. Evaluating rules constraints:", {
      matrixId: customerMatrix.id,
      rulesCount: rules.length,
      rulesFilters: { matrixId: customerMatrix.id, cnpj: normalizedCnpj }
    });

    const consigneeAddress = parsedData.consignee || parsedData.deliveryAddress || "";
    const airportMatch = rules.find((r: any) =>
      r.airport_code && r.airport_code !== "N/A" &&
      (r.airport_code.toUpperCase() === parsedData.origin?.toUpperCase() ||
       r.airport_code.toUpperCase() === parsedData.destination?.toUpperCase())
    );
    const addressMatch = rules.find((r: any) => r.address_pattern && addressMatches(consigneeAddress, r.address_pattern));

    let result: "COMPATIVEL" | "INCOMPATIVEL";
    let reason: string;
    let matchedRuleId: number | null = null;

    if (airportMatch) {
      result = "COMPATIVEL"; 
      reason = "CNPJ e aeroporto compatíveis"; 
      matchedRuleId = airportMatch.id;
      console.log("[AwbValidation] Success: Airport match found", { ruleId: airportMatch.id, airportCode: airportMatch.airport_code });
    } else if (addressMatch) {
      result = "COMPATIVEL"; 
      reason = "CNPJ e endereço compatíveis"; 
      matchedRuleId = addressMatch.id;
      console.log("[AwbValidation] Success: Address pattern match found", { ruleId: addressMatch.id, addressPattern: addressMatch.address_pattern });
    } else {
      const hasValidAirport = rules.some((r: any) => r.airport_code && r.airport_code !== "N/A");
      const hasValidAddress = rules.some((r: any) => r.address_pattern?.trim());
      if (!hasValidAirport && !hasValidAddress) {
        result = "COMPATIVEL"; 
        reason = "CNPJ compatível"; 
        matchedRuleId = rules[0]?.id || null;
        console.log("[AwbValidation] Success: Generic CNPJ compatibilty (no airport/address rules configured)", { ruleId: matchedRuleId });
      } else {
        result = "INCOMPATIVEL"; 
        reason = "Aeroporto não compatível";
        console.log("[AwbValidation] Incompatibility: Airport mismatch", {
          expectedAirports: rules.map((r: any) => r.airport_code).filter(Boolean),
          extractedOrigin: parsedData.origin,
          extractedDestination: parsedData.destination,
          extractedConsignee: consigneeAddress
        });
      }
    }

    return { result, reason, customer: extractedCustomer, matchedRuleId };
  };

  // Função auxiliar para normalização de endereço
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
    if (!docAddress || !matrixAddress) return false;
    const normalizedDoc = normalizeAddress(docAddress);
    const normalizedMatrix = normalizeAddress(matrixAddress);

    const matrixWords = normalizedMatrix.split(" ").filter(w => w.length > 2);
    if (matrixWords.length === 0) return false;

    let matchCount = 0;
    for (const matrixWord of matrixWords) {
      if (normalizedDoc.includes(matrixWord)) {
        matchCount++;
      }
    }

    const matchRatio = matchCount / matrixWords.length;
    return matchRatio >= 0.6;
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
      (check.awb_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (check.cnpj || "").includes(searchTerm) ||
      (check.customer || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || check.validation_status === statusFilter;
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

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
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

        {/* Right - User */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
            @{user?.username || user?.email}
          </div>
          {userRole === "ADMIN" && (
            <>
              <button
                type="button"
                onClick={handleReextractAll}
                disabled={isReextracting || checks.length === 0}
                className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50"
                title={isReextracting ? `Reextraindo ${reextractProgress.current}/${reextractProgress.total}` : "Reextrair todos os documentos"}
              >
                {isReextracting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCw className="w-4 h-4" />
                )}
              </button>
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
          <button
            onClick={() => navigate("/air/check/manual")}
            className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
            title="Manual do usuário"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <div
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]"
            title="Check AWB x CNPJ"
          >
            <FileCheck className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">
        {/* CARD DE BUSCA + FILTROS */}
        <section 
          className="rounded-2xl p-4"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)',
          }}
        >
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#aaaaaa]" />
                <input
                  type="text"
                  placeholder="Buscar por AWB, CNPJ ou cliente"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-9 w-full pl-10 pr-4 rounded-full border border-[rgba(255,255,255,.14)] bg-[#13141a] text-[#f5f5f5] text-[0.78rem] placeholder:text-[#666] focus:outline-none focus:border-[#ffc800] focus:shadow-[0_0_0_1px_rgba(255,200,0,.8)]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                      <FilterIcon className="h-3 w-3 text-[#ffc800]" />
                      <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Status</span>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 w-[130px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="OK">Compatível</SelectItem>
                        <SelectItem value="BLOQUEIO">Incompatível</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(0,0,0,.5)] border border-[rgba(255,255,255,.22)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800]" />
                      <span className="text-[0.68rem] tracking-[0.1em] uppercase text-[#aaaaaa]">Período</span>
                    </div>
                    <Select value={periodFilter} onValueChange={setPeriodFilter}>
                      <SelectTrigger className="h-8 w-[130px] rounded-full bg-[#13141a] border border-[rgba(255,255,255,.14)] text-[0.78rem]">
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
                    onClick={loadChecks}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[rgba(255,255,255,.05)] border border-[rgba(255,255,255,.25)] text-[#f5f5f5] text-[0.78rem] font-semibold hover:bg-[rgba(255,255,255,.08)] disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                    Atualizar
                  </button>
                </div>

                <Button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="h-8 rounded-full px-4 bg-[#ffc800] text-black font-semibold text-[0.78rem] shadow-[0_0_22px_rgba(255,200,0,.6)] hover:bg-[#f5b843]"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
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
                      <TableCell className="font-mono text-[0.82rem] py-[9px] px-[10px]">{check.awb_number}</TableCell>
                      <TableCell className="font-mono text-[0.82rem] py-[9px] px-[10px]">{check.cnpj}</TableCell>
                      <TableCell className="font-mono text-[0.82rem] py-[9px] px-[10px]">
                        {check.origin} → {check.destination}
                      </TableCell>
                      <TableCell className="text-[0.82rem] py-[9px] px-[10px]">{check.customer}</TableCell>
                      <TableCell className="text-[0.82rem] py-[9px] px-[10px]">{getResultBadge(check.validation_status)}</TableCell>
                      <TableCell className="max-w-xs text-[0.82rem] py-[9px] px-[10px] truncate text-[#aaaaaa]" title={check.validation_message || ""}>
                        {check.validation_message || (check.validation_status === "OK" ? "CNPJ e aeroporto compatíveis" : "CNPJ não compatível")}
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
            <DialogDescription className="sr-only">
              Arraste ou selecione arquivos de AWB para extração e validação das regras correspondentes.
            </DialogDescription>
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
            <DialogDescription className="sr-only">
              Exibição detalhada com os dados extraídos do documento e a matriz de regras do AWB.
            </DialogDescription>
          </DialogHeader>
          {selectedCheck && (
            <div className="space-y-6">
              {/* Seção Principal */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="text-sm text-[#aaaaaa] mb-1">AWB</p>
                  <p className="font-mono text-sm text-[#f5f5f5]">{selectedCheck.awb_number}</p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa] mb-1">CNPJ</p>
                  <p className="font-mono text-sm text-[#f5f5f5]">{selectedCheck.cnpj}</p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa] mb-1">Rota</p>
                  <p className="font-mono text-sm text-[#f5f5f5]">
                    {selectedCheck.origin} → {selectedCheck.destination}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa] mb-1">Cliente</p>
                  <p className="text-sm text-[#f5f5f5]">{selectedCheck.customer}</p>
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa] mb-1">Status</p>
                  {getResultBadge(selectedCheck.validation_status)}
                </div>
                <div>
                  <p className="text-sm text-[#aaaaaa] mb-1">Motivo</p>
                  <p className="text-sm text-[#f5f5f5]">
                    {selectedCheck.validation_message ||
                      (selectedCheck.validation_status === "OK" ? "CNPJ e aeroporto compatíveis" : "CNPJ não compatível")}
                  </p>
                </div>
              </div>

              {/* Dados Adicionais */}
              <div className="border-t border-[rgba(255,255,255,.12)] pt-5">
                <h3 className="font-semibold mb-4 text-[#f5f5f5]">Dados Adicionais</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <p className="text-[#aaaaaa] mb-1">Ref Othello</p>
                    <p className="font-mono text-[#f5f5f5]">{selectedCheck.rule_ref_othello || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[#aaaaaa] mb-1">Transportadora</p>
                    <p className="text-[#f5f5f5]">{selectedCheck.carrier || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[#aaaaaa] mb-1">Remetente</p>
                    <p className="text-[#f5f5f5]">{selectedCheck.shipper || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[#aaaaaa] mb-1">Destinatário</p>
                    <p className="text-[#f5f5f5]">{selectedCheck.consignee || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[#aaaaaa] mb-1">Peso Bruto</p>
                    <p className="text-[#f5f5f5]">{selectedCheck.gross_weight_kg ? `${selectedCheck.gross_weight_kg} kg` : "-"}</p>
                  </div>
                  <div>
                    <p className="text-[#aaaaaa] mb-1">Peso Taxável</p>
                    <p className="text-[#f5f5f5]">{selectedCheck.chargeable_weight_kg ? `${selectedCheck.chargeable_weight_kg} kg` : "-"}</p>
                  </div>
                  {(selectedEmailDespachante || selectedCheck.rule_email) && selectedCheck.customer === "KLABIN" && (
                    <div>
                      <p className="text-[#aaaaaa] mb-1">E-mail Despachante</p>
                      <a 
                        href={`mailto:${selectedEmailDespachante || selectedCheck.rule_email}`}
                        className="text-[#ffc800] hover:underline"
                      >
                        {selectedEmailDespachante || selectedCheck.rule_email}
                      </a>
                    </div>
                  )}
                </div>
              </div>
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
