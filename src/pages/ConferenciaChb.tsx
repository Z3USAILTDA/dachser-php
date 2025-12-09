import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileCheck } from 'lucide-react';
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

import dachserBg from '@/assets/dachser-background.jpg';

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

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <img
          src={dachserBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'saturate(0.8)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(circle at 10% 10%, rgba(255,200,0,0.18) 0%, transparent 50%),
              radial-gradient(circle at 90% 90%, rgba(255,200,0,0.12) 0%, transparent 50%),
              linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.82) 100%)
            `,
          }}
        />
        
        {/* Animated lines */}
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"
            style={{
              top: `${20 + i * 15}%`,
              left: 0,
              right: 0,
              animation: `scan ${8 + i * 2}s linear infinite`,
              animationDelay: `${i * 0.5}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="relative z-20 w-full max-w-[95%] mx-auto flex items-center justify-between pt-5 pb-4 px-2">
        {/* Left: Back button + Branding */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/chb/conferences')}
            className="w-8 h-8 flex items-center justify-center rounded-full 
              border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 
              hover:text-white hover:border-amber-500/50 transition-all backdrop-blur-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div>
            <h1 className="text-lg font-bold tracking-[0.2em] uppercase text-white">
              DACHSER
            </h1>
            <p className="text-white/50 text-sm mt-0.5">
              Desembaraço — Conferência (CHB)
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(255,200,0,0.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(255,200,0,0.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(255,200,0,0.9)]" />
            </div>
          </div>
        </div>

        {/* Right: Process ID + User */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full 
            bg-[rgba(5,6,18,0.9)] border border-white/12 text-white/80 text-sm backdrop-blur-sm">
            <FileCheck className="w-4 h-4 text-amber-500" />
            <span>{id ? `#${id}` : 'Processo'}</span>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-[rgba(5,6,18,0.9)] 
            border border-white/12 text-white/80 text-sm backdrop-blur-sm">
            {currentUser}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pb-10">
        {/* Main card */}
        <div
          className="rounded-2xl border border-white/12 overflow-hidden"
          style={{
            background: 'rgba(5, 6, 18, 0.9)',
            boxShadow: '0 18px 40px rgba(0, 0, 0, 0.85)',
          }}
        >
          {/* Stepper */}
          <div className="border-b border-white/10">
            <ChbStepper
              steps={steps}
              activeStep={activeStep}
              onStepClick={handleStepClick}
            />
          </div>

          {/* Tabs */}
          <div className="py-4 border-b border-white/10">
            <ChbTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* Content panel */}
          <div className="p-6 min-h-[400px]">
            {renderPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}
