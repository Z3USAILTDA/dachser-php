import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ship, Database, Search, ShieldAlert, ArrowLeft, RefreshCw, HelpCircle } from "lucide-react";
import { useDraftData } from "@/hooks/useDraftData";
import { DraftDataGrid } from "@/components/draft/DraftDataGrid";
import { HapagTrackerPanel } from "@/components/draft/HapagTrackerPanel";
import dachserBg from "@/assets/dachser-background.jpg";

type TabType = "grid" | "tracker";

interface NavTab {
  id: TabType;
  label: string;
  icon: React.ElementType;
}

const navTabs: NavTab[] = [
  { id: "grid", label: "Grid de Dados", icon: Database },
  { id: "tracker", label: "Tracker", icon: Search },
];

const DraftExportacao = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("grid");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const { combinedData, stats, isLoading, refetch } = useDraftData();

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  useEffect(() => {
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const adminStatus = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
      setIsAdmin(adminStatus);
      
      if (!adminStatus) {
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate, storedUser]);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen relative overflow-x-hidden">
        <div className="fixed inset-0 z-0">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${dachserBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div 
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
            }}
          />
        </div>
        <div className="relative z-10 flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc800]"></div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen relative overflow-x-hidden">
        <div className="fixed inset-0 z-0">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${dachserBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div 
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
            }}
          />
        </div>
        <div className="relative z-10 flex items-center justify-center h-screen">
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)] p-8 text-center max-w-md">
            <ShieldAlert className="h-12 w-12 text-rose-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Acesso Restrito</h3>
            <p className="text-[#aaaaaa]">
              Esta funcionalidade está disponível apenas para administradores.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))',
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
                transform: `skewX(${-20 + i * 8}deg)`,
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
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">DACHSER — Status Doc Exportação</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - Actions and user */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <button 
            onClick={() => refetch()} 
            disabled={isLoading} 
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50 text-[0.8rem]"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          
          <button
            onClick={() => navigate("/sea/manual-drafts")}
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
            title="Ajuda"
          >
            <HelpCircle size={16} />
          </button>

          {user && (
            <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[180px] truncate">
              @{user.username || user.email}
            </div>
          )}

          <div
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]"
            title="Status Doc Exportação"
          >
            <Ship size={16} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto px-2 pb-8">
        <div className="space-y-6">
          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit">
          {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200
                    ${isActive 
                      ? 'bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]' 
                      : 'text-[#aaaaaa] hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tab Content */}
          {activeTab === "grid" && (
            <DraftDataGrid 
              data={combinedData}
              onRefresh={refetch}
              isLoading={isLoading}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          )}

          {activeTab === "tracker" && (
            <HapagTrackerPanel onSave={refetch} />
          )}

        </div>
      </main>
    </div>
  );
};

export default DraftExportacao;
