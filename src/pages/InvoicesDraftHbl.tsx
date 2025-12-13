import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Info, Copy, Check, Upload, Download, X, Link as LinkIcon, FolderOpen, Loader2, FileBox } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { maritimoApi } from "@/services/maritimoApi";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract } from "@fortawesome/free-solid-svg-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Types
type FileClassification = "hbl" | "invoice" | "other";

type ClassifiedFile = {
  key: string;
  file: File;
  classification: FileClassification;
  storageUrl?: string;
};

export default function InvoicesDraftHbl() {
  const navigate = useNavigate();
  const location = useLocation();
  const itemId = (location.state as { itemId?: string })?.itemId;
  
  // File state
  const [files, setFiles] = useState<Map<string, ClassifiedFile>>(new Map());
  const [links, setLinks] = useState<Map<string, Set<string>>>(new Map());
  const [emailText, setEmailText] = useState<string>("");
  
  // Previous files state
  const [isLoadingPreviousFiles, setIsLoadingPreviousFiles] = useState(false);
  const [previousFilesLoaded, setPreviousFilesLoaded] = useState(false);
  const [itemInfo, setItemInfo] = useState<{ base_file_name: string; consignee?: string; container?: string } | null>(null);
  
  // UI state
  const [showHblModal, setShowHblModal] = useState(false);
  const [fileToSend, setFileToSend] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [extractingFiles, setExtractingFiles] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{ key: string; name: string } | null>(null);
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState("");
  const [analysisResult, setAnalysisResult] = useState<{
    html?: string;
    text: string;
    status: string;
  } | null>(null);
  const [copiedResult, setCopiedResult] = useState(false);
  const [inlineStatus, setInlineStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showInlineStatus = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setInlineStatus({ message, type });
  };

  // Load item info when itemId exists
  useEffect(() => {
    if (itemId) {
      maritimoApi.getItem(itemId).then(item => {
        setItemInfo({
          base_file_name: item.base_file_name,
          consignee: item.consignee || undefined,
          container: item.container || undefined
        });
      }).catch(err => {
        console.error('Error loading item info:', err);
      });
    }
  }, [itemId]);

  // Function to load previous files from history
  const handleLoadPreviousFiles = async () => {
    if (!itemId) return;
    
    setIsLoadingPreviousFiles(true);
    try {
      const historyData = await maritimoApi.getHistory(itemId);
      
      if (historyData.runs && historyData.runs.length > 0) {
        const latestRun = historyData.runs[0];
        const previousFiles = latestRun.files || [];
        
        if (previousFiles.length === 0) {
          toast.info("Nenhum arquivo encontrado no histórico");
          return;
        }
        
        const processedFiles = new Map(files);
        let loadedCount = 0;
        
        for (const fileInfo of previousFiles) {
          const key = `prev_${Date.now()}_${Math.random()}_${fileInfo.file_name}`;
          
          let classification: FileClassification = "other";
          if (fileInfo.file_type === 'hbl' || fileInfo.file_type === 'draft') {
            classification = "hbl";
          } else if (fileInfo.file_type === 'invoice') {
            classification = "invoice";
          } else {
            const lowerName = fileInfo.file_name.toLowerCase();
            if (lowerName.includes('hbl') || lowerName.includes('house')) {
              classification = "hbl";
            } else if (lowerName.includes('inv') || lowerName.includes('invoice') || lowerName.includes('nota')) {
              classification = "invoice";
            }
          }
          
          const referenceFile = new File(
            [new Uint8Array(0)], 
            fileInfo.file_name, 
            { type: 'application/pdf' }
          );
          
          processedFiles.set(key, {
            key,
            file: referenceFile,
            classification,
            storageUrl: fileInfo.file_url
          });
          
          loadedCount++;
        }
        
        setFiles(processedFiles);
        setPreviousFilesLoaded(true);
        toast.success(`${loadedCount} arquivo(s) carregado(s) do histórico`);
      } else {
        toast.info("Nenhum histórico de análise encontrado");
      }
    } catch (error: any) {
      console.error('Error loading previous files:', error);
      toast.error("Erro ao carregar arquivos anteriores");
    } finally {
      setIsLoadingPreviousFiles(false);
    }
  };

  // Classification logic
  const classifyFile = (file: File): FileClassification => {
    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    
    if (!isPdf) return "other";
    
    const hblIndicators = ["hbl", "hb/l", "hb-l", "house bill", "house-bill"];
    const draftIndicators = ["draft", "rascunho", "prealert", "pre-alerta", "prealerta"];
    const invoiceIndicators = ["invoice", "fatura", "nota", "proforma", "pro forma"];
    
    const hasHbl = hblIndicators.some(ind => name.includes(ind));
    const hasDraft = draftIndicators.some(ind => name.includes(ind));
    const hasInvoice = invoiceIndicators.some(ind => name.includes(ind));
    
    if (hasInvoice) return "invoice";
    if (hasHbl && (hasDraft || !hasInvoice)) return "hbl";
    
    const invIndicators = ["inv", "invoice", "fatura", "nota", "proforma"];
    if (invIndicators.some(ind => name.includes(ind))) return "invoice";
    
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv") || name.endsWith(".xml")) {
      return "invoice";
    }
    
    return "other";
  };

  // File handlers
  const handleFilesSelected = async (selectedFiles: FileList | File[]) => {
    const processedFiles = new Map(files);
    let pdfCount = 0;
    let emlCount = 0;
    let zipCount = 0;
    let ignoredCount = 0;
    let extractedCount = 0;

    const fileArray = Array.from(selectedFiles);
    
    for (const file of fileArray) {
      const name = file.name.toLowerCase();

      if (name.endsWith(".eml") || name.endsWith(".zip")) {
        const extractKey = `extracting_${Date.now()}_${file.name}`;
        setExtractingFiles(prev => new Set(prev).add(extractKey));
        
        try {
          if (name.endsWith(".eml")) emlCount++;
          if (name.endsWith(".zip")) zipCount++;
          
          const toastId = toast.loading(`Extraindo anexos de ${file.name}...`);
          
          const formData = new FormData();
          formData.append('file', file);
          
          const response = await maritimoApi.extractAttachments(formData);
          
          if (response.success && response.extracted) {
            for (const extracted of response.extracted) {
              const extractedKey = `${Date.now()}_${Math.random()}_${extracted.name}`;
              
              const referenceFile = new File(
                [new Uint8Array(extracted.size)], 
                extracted.name, 
                { type: 'application/pdf' }
              );
              
              processedFiles.set(extractedKey, {
                key: extractedKey,
                file: referenceFile,
                classification: extracted.classification as FileClassification,
                storageUrl: extracted.url
              });
              
              extractedCount++;
            }
            
            toast.success(`${response.extracted.length} anexo(s) extraído(s) de ${file.name}`, { id: toastId });
          } else {
            toast.error(`Falha na extração de ${file.name}`, { id: toastId });
          }
        } catch (error) {
          console.error(`Failed to extract from ${file.name}:`, error);
          toast.error(`Erro ao extrair anexos de ${file.name}`);
        } finally {
          setExtractingFiles(prev => {
            const next = new Set(prev);
            next.delete(extractKey);
            return next;
          });
        }
      } else if (file.type === "application/pdf" || name.endsWith(".pdf")) {
        const key = `${Date.now()}_${Math.random()}_${file.name}`;
        pdfCount++;
        processedFiles.set(key, {
          key,
          file,
          classification: classifyFile(file)
        });
      } else {
        ignoredCount++;
      }
    }

    setFiles(processedFiles);

    if (pdfCount > 0) showInlineStatus(`${pdfCount} PDF(s) cadastrado(s)`, 'success');
    if (extractedCount > 0) showInlineStatus(`${extractedCount} arquivo(s) extraído(s)`, 'success');
    if (ignoredCount > 0) showInlineStatus(`${ignoredCount} arquivo(s) ignorados`, 'info');
  };

  const handleReclassify = (key: string, newClass: FileClassification) => {
    const file = files.get(key);
    if (!file) return;

    const updated = new Map(files);
    updated.set(key, { ...file, classification: newClass });
    setFiles(updated);
    
    showInlineStatus("Arquivo reclassificado", 'success');
  };

  const handleDeleteFile = (key: string, fileName: string) => {
    setFileToDelete({ key, name: fileName });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteFile = () => {
    if (!fileToDelete) return;
    
    const updated = new Map(files);
    updated.delete(fileToDelete.key);
    setFiles(updated);

    const updatedLinks = new Map(links);
    updatedLinks.delete(fileToDelete.key);
    updatedLinks.forEach((set, hblKey) => {
      set.delete(fileToDelete.key);
    });
    setLinks(updatedLinks);

    showInlineStatus("Arquivo removido", 'info');
    setDeleteDialogOpen(false);
    setFileToDelete(null);
  };

  const handleSendToHbl = (invoiceKey: string) => {
    const hblFiles = Array.from(files.values()).filter(f => f.classification === "hbl");
    
    if (hblFiles.length === 0) {
      showInlineStatus("Nenhum HBL disponível. Adicione um HBL primeiro.", 'error');
      return;
    }

    setFileToSend(invoiceKey);
    setShowHblModal(true);
  };

  const handleLinkToHblFromModal = (hblKey: string) => {
    if (!fileToSend) return;

    const updatedLinks = new Map(links);
    const currentLinks = updatedLinks.get(hblKey) || new Set();
    currentLinks.add(fileToSend);
    updatedLinks.set(hblKey, currentLinks);
    setLinks(updatedLinks);

    toast.success("Invoice vinculado ao HBL");
    setShowHblModal(false);
    setFileToSend(null);
  };

  const handleRemovePill = (hblKey: string, invoiceKey: string) => {
    const updatedLinks = new Map(links);
    const currentLinks = updatedLinks.get(hblKey);
    if (currentLinks) {
      currentLinks.delete(invoiceKey);
      updatedLinks.set(hblKey, currentLinks);
      setLinks(updatedLinks);
      toast.info("Arquivo desvinculado e retornado à sua coluna original");
    }
  };

  const handleDownload = (classifiedFile: ClassifiedFile) => {
    if (classifiedFile.storageUrl) {
      const a = document.createElement('a');
      a.href = classifiedFile.storageUrl;
      a.download = classifiedFile.file.name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const url = URL.createObjectURL(classifiedFile.file);
      const a = document.createElement('a');
      a.href = url;
      a.download = classifiedFile.file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    toast.success("Download iniciado");
  };

  // Drag and drop for main dropzone
  const handleMainDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFilesSelected(droppedFiles);
    }
  };

  const handleMainDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleMainDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  // Drag and drop for file reclassification
  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData("fileKey", key);
  };

  const handleDrop = (e: React.DragEvent, targetClass: FileClassification) => {
    e.preventDefault();
    const key = e.dataTransfer.getData("fileKey");
    if (key) {
      handleReclassify(key, targetClass);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // File input click
  const handleFileInputClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.eml,.zip';
    input.multiple = true;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        handleFilesSelected(target.files);
      }
    };
    input.click();
  };

  // Computed values
  const allLinkedFileKeys = new Set<string>();
  links.forEach((fileSet) => {
    fileSet.forEach(key => allLinkedFileKeys.add(key));
  });
  
  const hblFiles = Array.from(files.values()).filter(f => f.classification === "hbl");
  const invoiceFiles = Array.from(files.values()).filter(f => 
    f.classification === "invoice" && !allLinkedFileKeys.has(f.key)
  );
  const otherFiles = Array.from(files.values()).filter(f => 
    f.classification === "other" && !allLinkedFileKeys.has(f.key)
  );
  
  const hasHbl = hblFiles.length > 0;
  const hasInvoiceOrOther = invoiceFiles.length > 0 || otherFiles.length > 0;
  const hasHblWithLinks = hblFiles.some(hbl => {
    const linkedFiles = links.get(hbl.key);
    return linkedFiles && linkedFiles.size > 0;
  });
  const canAnalyze = hasHbl && (hasInvoiceOrOther || hasHblWithLinks);
  const totalFiles = files.size;

  // Analysis
  const handleAnalise = async () => {
    if (hblFiles.length === 0) {
      showInlineStatus("Adicione pelo menos um arquivo Draft HBL", 'error');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisStep("Enviando arquivos...");
    setInlineStatus(null);
    showInlineStatus("Iniciando análise...", 'info');

    try {
      const drafts = hblFiles.map(f => ({
        key: f.key,
        filename: f.file.name,
        invoice_keys: Array.from(links.get(f.key) || [])
      }));

      const invoices = invoiceFiles.map(f => ({
        key: f.key,
        filename: f.file.name
      }));

      const linksArray = Array.from(links.entries()).map(([hblKey, invoiceKeys]) => ({
        draft_key: hblKey,
        invoice_keys: Array.from(invoiceKeys)
      }));

      const allFiles = Array.from(files.values()).map(f => ({
        field: f.classification === "hbl" ? "draft" : f.classification === "invoice" ? "invoice" : "other",
        file: f.storageUrl ? null : f.file,
        filename: f.file.name,
        storageUrl: f.storageUrl
      }));

      const uploadInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 50) {
            clearInterval(uploadInterval);
            return 50;
          }
          return prev + 5;
        });
      }, 100);

      const hasLinks = Array.from(links.values()).some(set => set.size > 0);
      const linkDataToSend = hasLinks ? {
        hbl_id: drafts[0]?.key || "",
        invoice_files: Array.from(links.get(drafts[0]?.key) || [])
          .map(key => files.get(key)?.file.name)
          .filter(Boolean) as string[]
      } : undefined;

      const { analysisId } = await maritimoApi.submitAnalysis({
        itemId: itemId || '',
        analysisType: 'invoices_hbl',
        files: allFiles.filter(f => f.file).map(f => f.file!),
        fileUrls: allFiles.filter(f => f.storageUrl).map(f => ({
          filename: f.filename,
          url: f.storageUrl!,
          mimeType: 'application/pdf'
        })),
        links: linkDataToSend
      });

      clearInterval(uploadInterval);
      setAnalysisStep("Processando análise...");
      showInlineStatus("Processando análise com IA...", 'info');

      const result = await maritimoApi.pollAnalysisUntilComplete(
        analysisId,
        (percent, step) => {
          console.log(`Analysis progress: ${percent}% - ${step}`);
          setAnalysisProgress(Math.min(percent, 95));
          setAnalysisStep(step);
        },
        1200000
      );

      setAnalysisProgress(100);
      await new Promise(resolve => setTimeout(resolve, 300));

      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisStep("");
      setInlineStatus(null);

      if (result.status === 'error') {
        showInlineStatus("Erro na análise. Verifique os arquivos e tente novamente.", 'error');
      } else {
        setTimeout(() => {
          document.getElementById('analysis-results')?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        }, 100);
      }

      setAnalysisResult({
        html: result.result_data?.resposta_html || result.result_data?.html,
        text: result.result_text || result.result_data?.resposta || result.result_data?.report || "",
        status: result.status || 'completed'
      });
    } catch (error: any) {
      console.error('Submit error:', error);
      showInlineStatus(`Erro ao submeter análise: ${error.message || 'Erro desconhecido'}`, 'error');
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisStep("");
    }
  };

  const handleCopyResult = () => {
    if (!analysisResult?.text || analysisResult.text.trim().length === 0) {
      toast.error("Não há conteúdo para copiar");
      return;
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = analysisResult.text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        setCopiedResult(true);
        toast.success("Resultado copiado");
        setTimeout(() => setCopiedResult(false), 2000);
      } else {
        throw new Error("execCommand failed");
      }
    } catch (err) {
      console.error('Copy error:', err);
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const handleComplete = () => {
    toast.success("Análise concluída!");
    setTimeout(() => navigate("/maritimo"), 1000);
  };

  const handleNewAnalysis = async () => {
    setAnalysisResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await handleAnalise();
  };

  // Render HBL with pills
  const renderHblWithPills = (classifiedFile: ClassifiedFile) => {
    const linkedInvoices = links.get(classifiedFile.key) || new Set();
    const sizeInKB = classifiedFile.storageUrl 
      ? "Extraído" 
      : (classifiedFile.file.size / 1024).toFixed(1) + " KB";

    return (
      <div key={classifiedFile.key} className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white break-words">
              {classifiedFile.file.name}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              Draft HBL • {sizeInKB}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownload(classifiedFile)}
              className="h-7 w-7 p-0"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteFile(classifiedFile.key, classifiedFile.file.name)}
              className="h-7 w-7 p-0"
            >
              <X className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleReclassify(classifiedFile.key, "invoice")}
            className="h-7 text-xs rounded-full px-3"
          >
            Marcar como Invoice
          </Button>
        </div>

        {linkedInvoices.size > 0 ? (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-2">Arraste Invoices para este HBL:</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(linkedInvoices).map(invKey => {
                const invFile = files.get(invKey);
                if (!invFile) return null;
                
                return (
                  <div
                    key={invKey}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/30 rounded-full text-xs text-success"
                  >
                    <span className="truncate max-w-[120px]">{invFile.file.name}</span>
                    <button
                      onClick={() => handleRemovePill(classifiedFile.key, invKey)}
                      className="hover:bg-success/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="border-t border-dashed border-border pt-3">
            <p className="text-xs text-muted-foreground text-center">
              Arraste Invoices para este HBL:
            </p>
          </div>
        )}
      </div>
    );
  };

  // Render invoice card
  const renderInvoiceCard = (classifiedFile: ClassifiedFile) => {
    const sizeInKB = classifiedFile.storageUrl 
      ? "Extraído" 
      : (classifiedFile.file.size / 1024).toFixed(1) + " KB";

    return (
      <div
        key={classifiedFile.key}
        draggable
        onDragStart={(e) => handleDragStart(e, classifiedFile.key)}
        className="bg-card border border-border rounded-xl p-4 cursor-move hover:border-success/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white break-words">
              {classifiedFile.file.name}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              Invoice • {sizeInKB}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownload(classifiedFile)}
              className="h-7 w-7 p-0"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteFile(classifiedFile.key, classifiedFile.file.name)}
              className="h-7 w-7 p-0"
            >
              <X className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleReclassify(classifiedFile.key, "hbl")}
            className="h-7 text-xs rounded-full px-3"
          >
            Marcar como HBL
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSendToHbl(classifiedFile.key)}
            className="h-7 text-xs rounded-full px-3"
          >
            Enviar p/ HBL
          </Button>
        </div>
      </div>
    );
  };

  // Render other file card
  const renderOtherCard = (classifiedFile: ClassifiedFile) => {
    const sizeInKB = classifiedFile.storageUrl 
      ? "Extraído" 
      : (classifiedFile.file.size / 1024).toFixed(1) + " KB";

    return (
      <div
        key={classifiedFile.key}
        draggable
        onDragStart={(e) => handleDragStart(e, classifiedFile.key)}
        className="bg-card border border-border rounded-xl p-4 cursor-move hover:border-muted-foreground/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white break-words">
              {classifiedFile.file.name}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              Outros • {sizeInKB}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownload(classifiedFile)}
              className="h-7 w-7 p-0"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteFile(classifiedFile.key, classifiedFile.file.name)}
              className="h-7 w-7 p-0"
            >
              <X className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleReclassify(classifiedFile.key, "invoice")}
            className="h-7 text-xs rounded-full px-3"
          >
            Marcar como Invoice
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleReclassify(classifiedFile.key, "hbl")}
            className="h-7 text-xs rounded-full px-3"
          >
            Marcar como HBL
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSendToHbl(classifiedFile.key)}
            className="h-7 text-xs rounded-full px-3"
          >
            Enviar p/ HBL
          </Button>
        </div>
      </div>
    );
  };

  return (
    <PageLayout title="DACHSER" subtitle="Invoices × Draft HBL" pageIcon={FileBox}>
      <div className="max-w-7xl mx-auto">

          <Card className="bg-black/40 border border-white/10 rounded-2xl shadow-[0_18px_40px_rgba(0,0,0,0.9)] p-8 mb-6">
            {/* Upload and Options Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Upload Zone - Takes 2 columns */}
              <div className="lg:col-span-2">
                <h3 className="text-sm font-medium text-white mb-4">
                  Arquivos de origem (arraste <span className="text-amber-400">.eml</span> / <span className="text-amber-400">.zip</span> e também <span className="text-amber-400">PDFs</span>)
                </h3>
                <div
                  onClick={handleFileInputClick}
                  onDrop={handleMainDrop}
                  onDragOver={handleMainDragOver}
                  onDragLeave={handleMainDragLeave}
                  className={`
                    border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
                    transition-colors
                    ${isDraggingOver ? 'border-amber-400 bg-amber-400/5' : 'border-white/10 hover:border-amber-400/50 bg-black/20'}
                  `}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4 text-neutral-400" />
                  <p className="text-sm font-medium text-white mb-2">
                    📥 Solte aqui (ou clique)
                  </p>
                  <p className="text-xs text-neutral-400">
                    Aceita .eml/.zip e PDFs. Você pode misturar os formatos.
                  </p>
                </div>
                {totalFiles > 0 && (
                  <p className="text-sm text-neutral-400 mt-4">
                    Anexos detectados: {totalFiles}. Vincule invoices aos HBLs (opcional).
                  </p>
                )}
              </div>

              {/* Options - Takes 1 column */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-4">Opções</h3>
                <ul className="text-xs text-neutral-400 space-y-3 leading-relaxed">
                  <li>• PDFs entram direto; o sistema tenta classificar em HBL/Invoice pelo nome.</li>
                  <li>• .eml/.zip passam pelo extrator de anexos; você pode mesclar com PDFs soltos.</li>
                  <li>• Vincule invoices dentro do(s) HBL(s) para melhor resultado.</li>
                  {itemId && (
                    <li className="text-amber-400/80">• Processo existente: você pode carregar os arquivos usados na última análise.</li>
                  )}
                </ul>
                
                {/* Load Previous Files Button - Only show for existing processes */}
                {itemId && !previousFilesLoaded && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <Button
                      onClick={handleLoadPreviousFiles}
                      disabled={isLoadingPreviousFiles}
                      variant="outline"
                      className="w-full rounded-full border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 text-amber-400"
                    >
                      {isLoadingPreviousFiles ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        <>
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Carregar arquivos anteriores
                        </>
                      )}
                    </Button>
                    {itemInfo && (
                      <p className="text-xs text-neutral-500 mt-2 text-center">
                        Processo: {itemInfo.base_file_name}
                      </p>
                    )}
                  </div>
                )}
                
                {previousFilesLoaded && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-success text-center">
                      ✓ Arquivos anteriores carregados
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Three-column grid for classification */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Draft HBL Column */}
              <div
                onDrop={(e) => handleDrop(e, "hbl")}
                onDragOver={handleDragOver}
                className="min-h-[300px] border-2 border-white/5 rounded-xl p-4 bg-black/20"
              >
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-white">Draft HBL</h3>
                  <span className="bg-black/30 text-neutral-400 text-xs font-medium px-2.5 py-0.5 rounded-full border border-white/10">
                    {hblFiles.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {hblFiles.map(f => renderHblWithPills(f))}
                </div>
              </div>

              {/* Invoices Column */}
              <div
                onDrop={(e) => handleDrop(e, "invoice")}
                onDragOver={handleDragOver}
                className="min-h-[300px] border-2 border-white/5 rounded-xl p-4 bg-black/20"
              >
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-white">Invoices</h3>
                  <span className="bg-black/30 text-neutral-400 text-xs font-medium px-2.5 py-0.5 rounded-full border border-white/10">
                    {invoiceFiles.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {invoiceFiles.map(f => renderInvoiceCard(f))}
                </div>
              </div>

              {/* Others Column */}
              <div
                onDrop={(e) => handleDrop(e, "other")}
                onDragOver={handleDragOver}
                className="min-h-[300px] border-2 border-white/5 rounded-xl p-4 bg-black/20"
              >
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-white">Outros</h3>
                  <span className="bg-black/30 text-neutral-400 text-xs font-medium px-2.5 py-0.5 rounded-full border border-white/10">
                    {otherFiles.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {otherFiles.map(f => renderOtherCard(f))}
                </div>
              </div>
            </div>

            {/* Analyze Button */}
            {!analysisResult && (
              <div className="mb-6">
                <Button
                  onClick={handleAnalise}
                  disabled={!canAnalyze || isAnalyzing}
                  className="rounded-full bg-amber-400 text-black font-semibold hover:bg-amber-300 px-8 shadow-[0_0_22px_rgba(251,191,36,0.6)]"
                >
                  <FontAwesomeIcon icon={faFileContract} className="w-4 h-4 mr-2" />
                  {isAnalyzing ? "Fazendo análise..." : "Fazer Análise"}
                </Button>
              </div>
            )}
          </Card>

          {/* Bottom flow hint */}
          <Card className="bg-black/40 border border-white/10 rounded-2xl p-4 mb-6">
            <p className="text-sm text-neutral-400">
              Fluxo: solte .eml/.zip e/ou PDFs → classificar/vincular → <span className="italic">Fazer Análise</span>.
            </p>
          </Card>

          {/* Inline Status Messages - only show when NOT analyzing */}
          {inlineStatus && !isAnalyzing && (
            <div className={`mb-6 rounded-lg p-4 border ${
              inlineStatus.type === 'success' ? 'bg-success/10 border-success/30 text-success' :
              inlineStatus.type === 'error' ? 'bg-destructive/10 border-destructive/30 text-destructive' :
              'bg-primary/10 border-primary/30 text-primary'
            }`}>
              <p className="text-sm font-medium">{inlineStatus.message}</p>
            </div>
          )}

          {/* Progress Bar */}
          {isAnalyzing && (
            <Card className="p-4 border-2 border-primary/20 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-foreground font-medium">{analysisStep}</span>
              </div>
              <div className="flex items-center gap-3">
                <Progress value={analysisProgress} className="h-2 flex-1" />
                <span className="text-xs text-muted-foreground font-mono min-w-[3rem] text-right">
                  {analysisProgress}%
                </span>
              </div>
            </Card>
          )}

          {/* Results Display */}
          {analysisResult && (
            <div id="analysis-results" className="space-y-6">
              <Card className="p-6 bg-black/20 border border-white/5 rounded-2xl">
                <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono max-h-[600px] overflow-y-auto bg-black/30 p-4 rounded-lg">
                  {analysisResult.text}
                </pre>
              </Card>

              <div className="flex items-center gap-4">
                <Button
                  onClick={handleNewAnalysis}
                  disabled={isAnalyzing}
                  className="rounded-full bg-amber-400 text-black font-semibold hover:bg-amber-300 px-8 shadow-[0_0_22px_rgba(251,191,36,0.6)]"
                >
                  <FontAwesomeIcon icon={faFileContract} className="w-4 h-4 mr-2" />
                  {isAnalyzing ? "Processando..." : "Fazer nova análise"}
                </Button>
                <Button
                  onClick={handleComplete}
                  variant="outline"
                  className="rounded-full px-8 border-white/20 bg-black/40 hover:bg-black hover:border-amber-400/80"
                >
                  Concluir análise
                </Button>
                <Button
                  onClick={handleCopyResult}
                  variant="ghost"
                  size="icon"
                  className="rounded-full w-10 h-10"
                  title="Copiar resultado"
                >
                  {copiedResult ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Info message */}
          {!analysisResult && (
            <div className="flex items-center justify-center">
              <div className="flex items-start gap-3 text-xs text-muted-foreground bg-muted/20 p-4 rounded-lg max-w-2xl">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  As análises são geradas por um modelo de IA e podem conter imprecisões. Revise antes de concluir processos.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* HBL Selection Modal */}
        <Dialog open={showHblModal} onOpenChange={setShowHblModal}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-primary" />
                Escolher HBL de destino
              </DialogTitle>
              <DialogDescription>
                {fileToSend && files.get(fileToSend) && (
                  <>
                    Enviar para HBL <span className="font-semibold text-foreground">{files.get(fileToSend)?.file.name}</span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {hblFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum HBL disponível
                </p>
              ) : (
                hblFiles.map(f => (
                  <Button
                    key={f.key}
                    variant="outline"
                    className="w-full justify-start text-left hover:bg-primary/10"
                    onClick={() => handleLinkToHblFromModal(f.key)}
                  >
                    <span className="truncate">{f.file.name}</span>
                  </Button>
                ))
              )}
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="ghost" onClick={() => setShowHblModal(false)} className="rounded-full">
                Fechar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar remoção</AlertDialogTitle>
              <AlertDialogDescription>
                Deseja remover o arquivo <strong>{fileToDelete?.name}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteFile}>
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </PageLayout>
  );
}
