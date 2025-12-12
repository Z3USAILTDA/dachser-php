import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileCheck } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { PageCard } from '@/components/layout/PageCard';
import { ChbStep, TabType, ChbNote } from '@/types/chb';
import { 
  initialSteps, 
  documentsByStep, 
  analysisByStep, 
  historyByStep, 
  notesByStep 
} from '@/data/chbMocks';
import { ChbStepper } from '@/components/chb/ChbStepper';
import { ChbTabs } from '@/components/chb/ChbTabs';
import { ChbDocumentsPanel } from '@/components/chb/ChbDocumentsPanel';
import { ChbAnalysisPanel } from '@/components/chb/ChbAnalysisPanel';
import { ChbHistoryPanel } from '@/components/chb/ChbHistoryPanel';
import { ChbNotesPanel } from '@/components/chb/ChbNotesPanel';

export default function ConferenciaChb() {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const [steps, setSteps] = useState<ChbStep[]>(initialSteps);
  const [activeStep, setActiveStep] = useState(2);
  const [activeTab, setActiveTab] = useState<TabType>('documentos');
  const [notes, setNotes] = useState<Record<number, ChbNote[]>>(notesByStep);

  const currentUser = localStorage.getItem('user_email') || '@usuario.chb';

  const handleStepClick = (stepId: number) => {
    setActiveStep(stepId);
    setActiveTab('documentos');
  };

  const handleApproveAndAdvance = () => {
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
    
    if (activeStep < 3) {
      setActiveStep(activeStep + 1);
      setActiveTab('documentos');
    }
  };

  const handleAddNote = (content: string) => {
    const newNote: ChbNote = {
      id: `n${Date.now()}`,
      stepId: activeStep,
      user: currentUser,
      date: new Date().toLocaleString('pt-BR'),
      content,
    };
    
    setNotes((prev) => ({
      ...prev,
      [activeStep]: [newNote, ...(prev[activeStep] || [])],
    }));
  };

  const renderPanel = () => {
    switch (activeTab) {
      case 'documentos':
        return (
          <ChbDocumentsPanel
            stepId={activeStep}
            documents={documentsByStep[activeStep] || []}
          />
        );
      case 'analise':
        return (
          <ChbAnalysisPanel
            stepId={activeStep}
            analysis={analysisByStep[activeStep]}
            onApproveAndAdvance={handleApproveAndAdvance}
          />
        );
      case 'historico':
        return (
          <ChbHistoryPanel
            stepId={activeStep}
            history={historyByStep[activeStep] || []}
          />
        );
      case 'observacoes':
        return (
          <ChbNotesPanel
            stepId={activeStep}
            notes={notes[activeStep] || []}
            onAddNote={handleAddNote}
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
    </PageLayout>
  );
}
