import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileCheck } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { PageCard } from '@/components/layout/PageCard';
import { ChbStep, TabType, ChbAnalysisResult, ChbApprovedHistory } from '@/types/chb';
import { 
  initialSteps, 
  documentsByStep
} from '@/data/chbMocks';
import { ChbStepper } from '@/components/chb/ChbStepper';
import { ChbTabs } from '@/components/chb/ChbTabs';
import { ChbDocumentsPanel } from '@/components/chb/ChbDocumentsPanel';
import { ChbAnalysisPanel } from '@/components/chb/ChbAnalysisPanel';
import { ChbHistoryPanel } from '@/components/chb/ChbHistoryPanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function ConferenciaChb() {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const [steps, setSteps] = useState<ChbStep[]>(initialSteps);
  const [activeStep, setActiveStep] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>('documentos');
  const [documents, setDocuments] = useState<Record<number, typeof documentsByStep[1]>>({
    1: documentsByStep[1] || [],
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

  // Get documents for current step (inherited from previous steps + current)
  const getDocumentsForStep = (stepId: number) => {
    const allDocs: typeof documentsByStep[1] = [];
    // Inherit documents from all previous steps
    for (let i = 1; i <= stepId; i++) {
      allDocs.push(...(documents[i] || []));
    }
    return allDocs;
  };

  // Get uploaded files for current step (inherited from previous steps + current)
  const getUploadedFilesForStep = (stepId: number) => {
    const allFiles: File[] = [];
    for (let i = 1; i <= stepId; i++) {
      allFiles.push(...(uploadedFiles[i] || []));
    }
    return allFiles;
  };
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const currentUser = localStorage.getItem('user_email') || '@usuario.chb';

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

  const handleStartAnalysis = async () => {
    // Use all files available for this step (inherited + current)
    const allFiles = getUploadedFilesForStep(activeStep);
    
    if (allFiles.length === 0) {
      toast.error('Nenhum arquivo para analisar');
      return;
    }

    setIsAnalyzing(true);
    setActiveTab('analise');

    try {
      // Convert files to base64
      const filesContent = await Promise.all(
        allFiles.map(async (file) => ({
          name: file.name,
          content: await fileToBase64(file),
          mimeType: file.type || 'application/octet-stream',
        }))
      );

      console.log(`Sending ${filesContent.length} files for analysis...`);

      const { data, error } = await supabase.functions.invoke('analyze-chb-documents', {
        body: {
          stepId: activeStep,
          files: filesContent,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // After successful analysis, convert uploaded files to documents
      const newDocs = allFiles.map((file, idx) => ({
        id: `doc-${activeStep}-${Date.now()}-${idx}`,
        name: file.name,
        type: detectDocumentType(file.name),
        uploadedAt: new Date().toLocaleString('pt-BR'),
        size: formatFileSize(file.size),
        stepId: activeStep,
        file: file, // Keep reference for download
      }));

      // Add new documents to current step
      setDocuments(prev => ({
        ...prev,
        [activeStep]: [...(prev[activeStep] || []), ...newDocs],
      }));

      // Clear uploaded files since they are now documents
      setUploadedFiles({
        1: [],
        2: [],
        3: [],
      });

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

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleApproveAndAdvance = () => {
    const currentAnalysis = analysisResults[activeStep];
    
    if (!currentAnalysis) {
      toast.error('Nenhuma análise para aprovar');
      return;
    }

    // Create history entry
    const historyEntry: ChbApprovedHistory = {
      id: `h${Date.now()}`,
      stepId: activeStep,
      date: new Date().toLocaleString('pt-BR'),
      user: currentUser,
      summary: currentAnalysis.summary,
      tags: currentAnalysis.tags,
    };

    // Add to history
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
        return (
          <ChbAnalysisPanel
            stepId={activeStep}
            analysisResult={analysisResults[activeStep]}
            onRunAnalysis={handleStartAnalysis}
            onApproveAndAdvance={handleApproveAndAdvance}
            isAnalyzing={isAnalyzing}
            hasFiles={(uploadedFiles[activeStep] || []).length > 0}
          />
        );
      case 'historico':
        return (
          <ChbHistoryPanel
            stepId={activeStep}
            approvedHistory={approvedHistory[activeStep] || []}
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
          <ChbTabs activeTab={activeTab} onTabChange={setActiveTab} />
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
