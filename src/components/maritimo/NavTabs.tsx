import { cn } from "@/lib/utils";

interface NavTabsProps {
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function NavTabs({ activeTab, onTabChange }: NavTabsProps) {
  const tabs = [
    { value: "manifest", label: "Manifest → HBL" },
    { value: "hbl", label: "HBL → MBL" },
    { value: "invoices", label: "Invoices → HBL" },
  ];

  return (
    <div className="flex gap-1 p-1 rounded-full bg-black/60 border border-white/10">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={cn(
            "px-4 py-2 rounded-full text-xs font-medium transition-all",
            activeTab === tab.value
              ? "bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
