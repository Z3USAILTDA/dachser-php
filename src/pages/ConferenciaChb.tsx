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
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0" 
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }} 
        />
        <div 
          className="absolute inset-0" 
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))'
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
                transform: `skewX(${-20 + i * 8}deg)`
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
              animationDuration: `${4 + Math.random() * 4}s`
            }} 
          />
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button 
            onClick={() => navigate("/chb/conferences")} 
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">
              Desembaraço — Conferência (CHB)
            </p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - Process ID + User */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <div className="flex items-center gap-2 px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa]">
            <FileCheck size={14} className="text-[#ffc800]" />
            <span>{id ? `#${id}` : 'Processo'}</span>
          </div>
          <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[220px] truncate">
            @{currentUser.replace('@', '')}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">
        {/* Main card */}
        <section 
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(5,6,18,.9)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 18px 40px rgba(0,0,0,.85)'
          }}
        >
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
        </section>
      </main>
    </div>
  );
}
