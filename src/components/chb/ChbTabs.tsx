import { TabType } from '@/types/chb';
import { FileText, Bot, ClipboardList } from 'lucide-react';

interface ChbTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isAnalyzing?: boolean;
  hasAnalysisResult?: boolean;
}

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'documentos', label: 'Documentos', icon: <FileText className="w-3 h-3" /> },
  { id: 'analise', label: 'Análise da IA', icon: <Bot className="w-3 h-3" /> },
  { id: 'historico', label: 'Histórico aprovado', icon: <ClipboardList className="w-3 h-3" /> },
];

export function ChbTabs({ activeTab, onTabChange, isAnalyzing, hasAnalysisResult }: ChbTabsProps) {
  const isTabDisabled = (tabId: TabType) => {
    // Análise tab is only accessible when analyzing or has result
    if (tabId === 'analise') {
      return !isAnalyzing && !hasAnalysisResult;
    }
    return false;
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 px-3 scrollbar-thin">
      {tabs.map((tab) => {
        const disabled = isTabDisabled(tab.id);
        return (
          <button
            key={tab.id}
            onClick={() => !disabled && onTabChange(tab.id)}
            disabled={disabled}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.7rem] font-medium
              whitespace-nowrap transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-amber-500 text-black'
                : disabled
                  ? 'bg-black/20 border border-white/5 text-white/30 cursor-not-allowed'
                  : 'bg-black/40 border border-white/10 text-white/60 hover:text-white hover:border-white/20'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
