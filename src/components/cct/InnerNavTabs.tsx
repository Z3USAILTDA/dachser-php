import { cn } from "@/lib/utils";

interface InnerNavTab {
  id: string;
  label: string;
  icon: React.ElementType;
  count?: number;
}

interface InnerNavTabsProps {
  tabs: InnerNavTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  className?: string;
}

export function InnerNavTabs({ tabs, activeTab, onTabChange, className }: InnerNavTabsProps) {
  return (
    <nav className={cn(
      "flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit",
      className
    )}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200",
              isActive 
                ? "bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]" 
                : "text-[#aaaaaa] hover:text-white hover:bg-white/5"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-xs">({tab.count})</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
