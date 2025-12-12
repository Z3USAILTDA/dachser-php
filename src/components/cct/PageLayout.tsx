import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, BarChart3, AlertTriangle, Bell, Settings, HelpCircle, LogOut, LucideIcon, Radio } from "lucide-react";
import dachserBg from "@/assets/dachser-background.jpg";

interface NavTab {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navTabs: NavTab[] = [
  { label: "Dashboard", href: "/air/cct", icon: LayoutDashboard },
  { label: "Analytics", href: "/air/cct/analytics", icon: BarChart3 },
  { label: "Exceções", href: "/air/cct/excecoes", icon: AlertTriangle },
  { label: "Regras", href: "/air/cct/notificacoes", icon: Bell },
  { label: "Console", href: "/air/cct/console", icon: Settings },
];

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  headerActions?: ReactNode;
  pageIcon?: LucideIcon;
}

export function PageLayout({ 
  children, 
  title = "DACHSER", 
  subtitle = "CRONOS CCT — Monitoramento de Carga Aérea",
  showBack = true,
  headerActions,
  pageIcon: PageIcon = Radio
}: PageLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
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
          {showBack && (
            <button
              onClick={() => navigate("/dashboard")}
              className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">{title}</h1>
            {subtitle && (
              <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">{subtitle}</p>
            )}
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Center - Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.href;
            return (
              <button
                key={tab.href}
                onClick={() => navigate(tab.href)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200
                  ${isActive 
                    ? 'bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]' 
                    : 'text-[#aaaaaa] hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Right - Actions and user */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          {headerActions}
          
          <button
            onClick={() => navigate("/air/cct/manual")}
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
            title={subtitle || title}
          >
            <PageIcon size={16} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto px-2 pb-8">
        {children}
      </main>
    </div>
  );
}
