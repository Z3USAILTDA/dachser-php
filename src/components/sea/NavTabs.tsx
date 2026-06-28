import { FileText, ArrowRightLeft, Receipt } from "lucide-react";

interface NavTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const NavTabs = ({ activeTab, onTabChange }: NavTabsProps) => {
  const tabs = [
    { id: "manifest", label: "Manifest/Pack List × Draft HBL", icon: FileText },
    { id: "hbl", label: "HBL × MBL", icon: ArrowRightLeft },
    { id: "invoices", label: "Invoices × Draft HBL", icon: Receipt }
  ];

  return (
    <div className="flex gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`sea-nav-tab flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all text-xs ${
              isActive
                ? "sea-nav-tab-active bg-black/86 text-white border border-amber-400/60 shadow-[0_0_15px_rgba(251,191,36,0.3)]"
                : "sea-nav-tab-inactive bg-transparent text-neutral-400 hover:text-white hover:bg-black/60 border border-white/10"
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
