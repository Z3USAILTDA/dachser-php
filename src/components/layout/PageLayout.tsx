import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, LucideIcon } from "lucide-react";
import dachserBg from "@/assets/dachser-background.jpg";
import { useTheme } from "@/hooks/useTheme";

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showLogout?: boolean;
  rightContent?: ReactNode;
  backTo?: string;
  pageIcon?: LucideIcon;
  exclusiveAccess?: boolean; // For olimpo_only or metrics_only users
}

export function PageLayout({ 
  children, 
  title = "DACHSER", 
  subtitle,
  showLogout = true,
  rightContent,
  backTo = "/dashboard",
  pageIcon: PageIcon,
  exclusiveAccess = false
}: PageLayoutProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  const handleBack = () => {
    if (exclusiveAccess) {
      handleLogout();
    } else {
      navigate(backTo);
    }
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background - Diferente para cada tema */}
      <div className="fixed inset-0 z-0">
        {isLight ? (
          /* ============ TEMA CLARO - Background com Imagem ============ */
          <>
            {/* Imagem de fundo dos caminhões */}
            <div 
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${dachserBg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            
            {/* Overlay claro semi-transparente */}
            <div 
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(120deg, rgba(245, 242, 235, 0.65), rgba(250, 248, 243, 0.60))',
              }}
            />
            
            {/* Overlay suave com tom dourado */}
            <div 
              className="absolute inset-0"
              style={{
                background: `
                  radial-gradient(ellipse at 15% 15%, rgba(201, 160, 0, 0.06) 0%, transparent 40%),
                  radial-gradient(ellipse at 85% 85%, rgba(201, 160, 0, 0.04) 0%, transparent 40%)
                `
              }}
            />
            
            {/* Linhas decorativas sutis */}
            <div className="absolute inset-0 opacity-[0.02]">
              {[...Array(5)].map((_, i) => (
                <div
                  key={`line-light-${i}`}
                  className="absolute h-full w-px bg-gradient-to-b from-[#a08000]/50 to-transparent"
                  style={{
                    left: `${18 + i * 16}%`,
                    transform: `skewX(${-15 + i * 7}deg)`,
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          /* ============ TEMA ESCURO - Background Original ============ */
          <>
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
                  className="absolute h-full w-px bg-gradient-to-b from-[#ffc800]/70 to-[#ffc800]/10"
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
                className="absolute w-1 h-1 rounded-full bg-[#ffc800]/40 animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${4 + Math.random() * 4}s`,
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button
            onClick={handleBack}
            className={`w-8 h-8 rounded-full border flex items-center justify-center backdrop-blur-sm transition-all ${
              isLight 
                ? "border-[rgba(0,0,0,.1)] bg-white/90 text-[#555] hover:bg-white hover:text-[#333] shadow-sm" 
                : "border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] hover:bg-[rgba(5,6,18,1)] hover:text-white"
            }`}
            title={exclusiveAccess ? "Sair" : "Voltar"}
          >
            {exclusiveAccess ? <LogOut size={16} /> : <ArrowLeft size={16} />}
          </button>

          <header>
            <h1 className={`text-[1.6rem] tracking-[0.24em] uppercase font-semibold ${isLight ? "text-[#1a1a1a]" : "text-[#f5f5f5]"}`}>
              {title}
            </h1>
            {subtitle && (
              <p className={`text-[0.9rem] mt-0.5 font-medium ${isLight ? "text-[#333]" : "text-[#aaaaaa]"}`}>
                Intelligent Logistics – {subtitle}
              </p>
            )}
            <div className="flex gap-1.5 mt-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isLight ? "bg-[#9a7800]" : "bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]"}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isLight ? "bg-[#9a7800]" : "bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]"}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isLight ? "bg-[#9a7800]" : "bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]"}`} />
            </div>
          </header>
        </div>

        {/* Right - User + Actions */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          {rightContent}
          <div className={`px-[14px] py-1.5 rounded-full border max-w-[220px] truncate font-medium ${
            isLight 
              ? "bg-white/95 border-[rgba(0,0,0,.12)] text-[#1a1a1a] shadow-sm" 
              : "bg-[rgba(0,0,0,.70)] border-[rgba(255,255,255,.18)] text-[#aaaaaa]"
          }`}>
            @{user?.username || user?.email?.split("@")[0] || "usuario"}
          </div>
          {PageIcon ? (
            <div
              className={`w-8 h-8 rounded-full border flex items-center justify-center ${
                isLight 
                  ? "border-[rgba(0,0,0,.12)] bg-white/90 text-[#d4a800] shadow-sm" 
                  : "border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#ffc800]"
              }`}
              title={subtitle || title}
            >
              <PageIcon className="w-4 h-4" />
            </div>
          ) : showLogout && (
            <button
              type="button"
              onClick={handleLogout}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition ${
                isLight 
                  ? "border-[rgba(0,0,0,.12)] bg-white/90 text-[#d4a800] hover:bg-white shadow-sm" 
                  : "border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#ffc800] hover:bg-[rgba(0,0,0,.9)]"
              }`}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto mb-12 px-2 space-y-[18px]">
        {children}
      </main>
    </div>
  );
}