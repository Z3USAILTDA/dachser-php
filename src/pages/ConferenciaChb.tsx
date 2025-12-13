import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileCheck } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { PageCard } from '@/components/layout/PageCard';
import { ChbStep, TabType, ChbAnalysisResult, ChbApprovedHistory, ChbDocument } from '@/types/chb';
import { initialSteps } from '@/data/chbMocks';
import { ChbStepper } from '@/components/chb/ChbStepper';
import { ChbTabs } from '@/components/chb/ChbTabs';
import { ChbDocumentsPanel } from '@/components/chb/ChbDocumentsPanel';
import { ChbAnalysisPanel } from '@/components/chb/ChbAnalysisPanel';
import { ChbHistoryPanel } from '@/components/chb/ChbHistoryPanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useChbFiles, useChbRuns, ChbFile, ChbRun } from '@/hooks/useChbData';

export default function ConferenciaChb() {
  const navigate = useNavigate();
  const { id } = useParams();
  const itemId = id ? parseInt(id) : null;
  
  const { files: dbFiles, fetchFiles, createFile, deleteFile } = useChbFiles(itemId);
  const { runs: dbRuns, fetchRuns, createRun } = useChbRuns(itemId);
  
  const [steps, setSteps] = useState<ChbStep[]>(initialSteps);
  const [activeStep, setActiveStep] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>('documentos');
  const [documents, setDocuments] = useState<Record<number, ChbDocument[]>>({
    1: [],
    2: [],
    3: [],
  });
  
  // Centralized state for files, analysis results, and history
  const [uploadedFiles, setUploadedFiles] = useState<Record<number, File[]>>({
    1: [],
    2: [],
    3: [],
  });
  const [analysisResults, setAnalysisResults] = useState<Record<number, ChbAnalysisResult | null>>({
    1: null,
    2: null,
    3: null,
  });
  const [approvedHistory, setApprovedHistory] = useState<Record<number, ChbApprovedHistory[]>>({
    1: [],
    2: [],
    3: [],
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const currentUser = localStorage.getItem('user_email') || localStorage.getItem('username') || 'Usuário';

  // Load data from database
  useEffect(() => {
    if (itemId) {
      fetchFiles();
      fetchRuns();
    }
  }, [itemId, fetchFiles, fetchRuns]);

  // Convert DB files to documents
  useEffect(() => {
    const newDocs: Record<number, ChbDocument[]> = { 1: [], 2: [], 3: [] };
    dbFiles.forEach((f: ChbFile) => {
      const stepId = parseInt(f.etapa) as 1 | 2 | 3;
      newDocs[stepId].push({
        id: `db-${f.id}`,
        name: f.filename,
        type: 'Invoice',
        uploadedAt: f.created_at,
        size: f.size_bytes ? formatFileSize(f.size_bytes) : '',
        stepId,
        dbId: f.id,
        url: f.url || undefined,
      });
    });
    setDocuments(newDocs);
  }, [dbFiles]);

  // Convert DB runs to approved history, restore step state, and populate analysis results
  useEffect(() => {
    const newHistory: Record<number, ChbApprovedHistory[]> = { 1: [], 2: [], 3: [] };
    const restoredAnalysis: Record<number, ChbAnalysisResult | null> = { 1: null, 2: null, 3: null };
    let maxApprovedStep = 0;
    
    // Sort runs by created_at to get the most recent per step
    const sortedRuns = [...dbRuns]
      .filter((r: ChbRun) => r.status === 'approved')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    sortedRuns.forEach((r: ChbRun) => {
      const stepId = parseInt(r.etapa) as 1 | 2 | 3;
      if (stepId > maxApprovedStep) maxApprovedStep = stepId;
      
      newHistory[stepId].push({
        id: `run-${r.id}`,
        stepId,
        date: r.created_at,
        user: r.created_by_email || r.created_by_name || 'Usuário',
        summary: r.result_text || '',
        detailedSummary: r.result_html || r.result_text || '',
        tags: [],
      });
      
      // Restore analysis result for completed steps (use the most recent run)
      if (!restoredAnalysis[stepId] && r.result_html) {
        restoredAnalysis[stepId] = {
          id: `restored-${r.id}`,
          stepId,
          html: r.result_html,
          summary: r.result_text || '',
          generatedAt: new Date(r.created_at).toLocaleString('pt-BR'),
          filesAnalyzed: [],
          tags: [],
        };
      }
    });
    
    setApprovedHistory(newHistory);
    setAnalysisResults(prev => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(restoredAnalysis).filter(([_, v]) => v !== null)
      ),
    }));
    
    // Restore step states and active step based on approved runs
    if (maxApprovedStep > 0) {
      setSteps(prev => prev.map(step => {
        if (step.id <= maxApprovedStep) {
          return { ...step, status: 'completed' as const };
        }
        if (step.id === maxApprovedStep + 1) {
          return { ...step, status: 'current' as const };
        }
        return { ...step, status: 'pending' as const };
      }));
      
      // Set active step to next incomplete step (or last if all complete)
      const nextStep = Math.min(maxApprovedStep + 1, 3);
      setActiveStep(nextStep);
    }
  }, [dbRuns]);

  // Get documents for current step (inherited from previous steps + current)
  const getDocumentsForStep = useCallback((stepId: number) => {
    const allDocs: ChbDocument[] = [];
    for (let i = 1; i <= stepId; i++) {
      allDocs.push(...(documents[i] || []));
    }
    return allDocs;
  }, [documents]);

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleStepClick = (stepId: number) => {
    setActiveStep(stepId);
    setActiveTab('documentos');
  };

  const handleFilesChange = (files: File[]) => {
    setUploadedFiles(prev => ({
      ...prev,
      [activeStep]: files,
    }));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:mime;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const handleStartAnalysis = async (isRerun = false) => {
    // Get NEW files uploaded for current step only
    const currentStepFiles = uploadedFiles[activeStep] || [];
    
    // Get documents from current and all previous steps
    const allDocs = Array.from({ length: activeStep }, (_, i) => documents[i + 1] || []).flat();
    
    // For re-run, use existing documents; for new analysis, need new files
    const hasNewFiles = currentStepFiles.length > 0;
    const hasExistingDocs = allDocs.length > 0;
    
    if (!isRerun && !hasNewFiles && activeStep === 1) {
      toast.error('Nenhum arquivo para analisar');
      return;
    }
    
    if (!isRerun && !hasNewFiles && activeStep > 1) {
      toast.error('Adicione os arquivos desta etapa para analisar');
      return;
    }
    
    // For re-run without new files, use existing docs
    if (isRerun && !hasNewFiles && !hasExistingDocs) {
      toast.error('Nenhum arquivo disponível para análise');
      return;
    }

    setIsAnalyzing(true);
    setActiveTab('analise');

    try {
      // Convert new uploaded files to base64
      const newFilesContent = await Promise.all(
        currentStepFiles.map(async (file) => ({
          name: file.name,
          content: await fileToBase64(file),
          mimeType: file.type || 'application/octet-stream',
          stepId: activeStep,
        }))
      );

      // Convert existing documents (all steps) with file reference to base64
      const existingDocsContent = await Promise.all(
        allDocs
          .filter(doc => doc.file) // Only include docs with file reference
          .map(async (doc) => ({
            name: doc.name,
            content: await fileToBase64(doc.file!),
            mimeType: doc.file!.type || 'application/octet-stream',
            stepId: doc.stepId,
          }))
      );

      // Combine: existing docs first, then new files (avoiding duplicates)
      const existingNames = new Set(existingDocsContent.map(d => d.name));
      const uniqueNewFiles = newFilesContent.filter(f => !existingNames.has(f.name));
      const allFilesContent = [...existingDocsContent, ...uniqueNewFiles];

      console.log(`Sending ${allFilesContent.length} files for analysis (${existingDocsContent.length} existing, ${uniqueNewFiles.length} new)`);

      const { data, error } = await supabase.functions.invoke('analyze-chb-documents', {
        body: {
          stepId: activeStep,
          files: allFilesContent,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // Only add new documents if there are new files (not a re-run)
      if (currentStepFiles.length > 0) {
        const newDocs = currentStepFiles.map((file, idx) => ({
          id: `doc-${activeStep}-${Date.now()}-${idx}`,
          name: file.name,
          type: detectDocumentType(file.name),
          uploadedAt: new Date().toLocaleString('pt-BR'),
          size: formatFileSize(file.size),
          stepId: activeStep,
          file: file, // Keep reference for download
        }));

        // Add new documents to current step only
        setDocuments(prev => ({
          ...prev,
          [activeStep]: [...(prev[activeStep] || []), ...newDocs],
        }));

        // Clear only current step uploaded files
        setUploadedFiles(prev => ({
          ...prev,
          [activeStep]: [],
        }));
      }

      setAnalysisResults(prev => ({
        ...prev,
        [activeStep]: data as ChbAnalysisResult,
      }));

      toast.success('Análise concluída com sucesso!');
    } catch (error) {
      console.error('Error analyzing documents:', error);
      toast.error(`Erro na análise: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper to detect document type from filename
  const detectDocumentType = (filename: string): 'HBL' | 'Invoice' | 'Packing List' | 'DI' | 'AWB' | 'Certificado' => {
    const lower = filename.toLowerCase();
    if (lower.includes('hbl') || lower.includes('house')) return 'HBL';
    if (lower.includes('invoice') || lower.includes('fatura')) return 'Invoice';
    if (lower.includes('packing') || lower.includes('romaneio')) return 'Packing List';
    if (lower.includes('di') || lower.includes('declaracao')) return 'DI';
    if (lower.includes('awb') || lower.includes('conhecimento')) return 'AWB';
    if (lower.includes('cert') || lower.includes('certificado')) return 'Certificado';
    return 'Invoice'; // default
  };


  const handleApproveAndAdvance = async () => {
    const currentAnalysis = analysisResults[activeStep];
    
    if (!currentAnalysis) {
      toast.error('Nenhuma análise para aprovar');
      return;
    }

    // Save to database with status 'approved'
    try {
      await createRun(
        activeStep.toString() as '1' | '2' | '3',
        'approved',
        currentAnalysis.summary,
        currentAnalysis.html,
        currentAnalysis
      );
    } catch (error) {
      console.error('Error saving run:', error);
      toast.error('Erro ao salvar aprovação');
      return;
    }

    // Create history entry with HTML content from analysis
    const historyEntry: ChbApprovedHistory = {
      id: `h${Date.now()}`,
      stepId: activeStep,
      date: new Date().toLocaleString('pt-BR'),
      user: currentUser,
      summary: currentAnalysis.summary,
      detailedSummary: currentAnalysis.html, // Use HTML content for proper formatting
      parecer: (currentAnalysis as any).parecer,
      tags: currentAnalysis.tags,
    };

    // Add to history for current step only (no duplicates)
    setApprovedHistory(prev => ({
      ...prev,
      [activeStep]: [historyEntry, ...(prev[activeStep] || [])],
    }));

    // Update step status
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === activeStep) {
          return { ...step, status: 'completed' as const };
        }
        if (step.id === activeStep + 1) {
          return { ...step, status: 'current' as const };
        }
        return step;
      })
    );

    toast.success('Etapa aprovada com sucesso!');
    
    // Advance to next step if not the last one
    if (activeStep < 3) {
      setActiveStep(activeStep + 1);
      setActiveTab('documentos');
    } else {
      toast.success('Processo CHB concluído!');
    }
  };


  const handleDeleteDocument = (docId: string) => {
    setDocuments((prev) => ({
      ...prev,
      [activeStep]: (prev[activeStep] || []).filter((doc) => doc.id !== docId),
    }));
    toast.success('Documento excluído');
  };

  const renderPanel = () => {
    switch (activeTab) {
      case 'documentos':
        return (
          <ChbDocumentsPanel
            stepId={activeStep}
            documents={getDocumentsForStep(activeStep)}
            uploadedFiles={uploadedFiles[activeStep] || []}
            onFilesChange={handleFilesChange}
            onStartAnalysis={handleStartAnalysis}
            onDeleteDocument={handleDeleteDocument}
            isAnalyzing={isAnalyzing}
            hasAnalysisResult={!!analysisResults[activeStep]}
          />
        );
      case 'analise':
        const currentStepData = steps.find(s => s.id === activeStep);
        const isStepCompleted = currentStepData?.status === 'completed';
        return (
          <ChbAnalysisPanel
            stepId={activeStep}
            analysisResult={analysisResults[activeStep]}
            onRunAnalysis={() => handleStartAnalysis(!!analysisResults[activeStep])}
            onApproveAndAdvance={handleApproveAndAdvance}
            isAnalyzing={isAnalyzing}
            hasFiles={(uploadedFiles[activeStep] || []).length > 0 || getDocumentsForStep(activeStep).some(d => d.file || d.url)}
            isStepCompleted={isStepCompleted}
          />
        );
      case 'historico':
        return (
          <ChbHistoryPanel
            stepId={activeStep}
            approvedHistory={approvedHistory}
          />
        );
      default:
        return null;
    }
  };

  const rightContent = (
    <div className="flex items-center gap-2 px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa]">
      <FileCheck size={14} className="text-[#ffc800]" />
      <span>{id ? `#${id}` : 'Processo'}</span>
    </div>
  );

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Desembaraço — Conferência (CHB)"
      rightContent={rightContent}
      pageIcon={FileCheck}
      backTo="/chb/conferences"
    >
      {/* Main card */}
      <PageCard className="overflow-hidden" padding="sm">
        {/* Stepper */}
        <div className="border-b border-[rgba(255,255,255,.10)]">
          <ChbStepper
            steps={steps}
            activeStep={activeStep}
            onStepClick={handleStepClick}
          />
        </div>

        {/* Tabs */}
        <div className="py-4 border-b border-[rgba(255,255,255,.10)]">
          <ChbTabs 
            activeTab={activeTab} 
            onTabChange={setActiveTab}
            isAnalyzing={isAnalyzing}
            hasAnalysisResult={!!analysisResults[activeStep]}
          />
        </div>

        {/* Content panel */}
        <div className="p-6 min-h-[400px]">
          {renderPanel()}
        </div>
      </PageCard>

      {/* CSS for analysis table styling */}
      <style>{`
        .chb-analysis-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.875rem;
        }
        .chb-analysis-content thead {
          background: rgba(255, 255, 255, 0.05);
        }
        .chb-analysis-content th,
        .chb-analysis-content td {
          padding: 0.75rem 1rem;
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .chb-analysis-content th {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }
        .chb-analysis-content td {
          color: rgba(255, 255, 255, 0.7);
        }
        .chb-analysis-content tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }
        .chb-analysis-content p {
          margin: 0.75rem 0;
          color: rgba(255, 255, 255, 0.8);
        }
        .chb-analysis-content ul {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }
        .chb-analysis-content li {
          margin: 0.25rem 0;
          color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </PageLayout>
  );
}
