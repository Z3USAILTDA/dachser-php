import { TabType } from '@/types/chb';
import { FileText, Bot, History } from 'lucide-react';

interface ChbTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'documentos', label: 'Documentos', icon: <FileText className="w-3 h-3" /> },
  { id: 'analise', label: 'Análise da IA', icon: <Bot className="w-3 h-3" /> },
  { id: 'historico', label: 'Histórico aprovado', icon: <History className="w-3 h-3" /> },
];

export function ChbTabs({ activeTab, onTabChange }: ChbTabsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 px-3 scrollbar-thin">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.7rem] font-medium
            whitespace-nowrap transition-all duration-200
            ${activeTab === tab.id
              ? 'bg-amber-500 text-black'
              : 'bg-black/40 border border-white/10 text-white/60 hover:text-white hover:border-white/20'
            }
          `}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
