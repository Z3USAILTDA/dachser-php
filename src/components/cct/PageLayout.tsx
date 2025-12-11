import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutDashboard, BarChart3, AlertTriangle, Bell, Settings, BookOpen, HelpCircle, LogOut } from "lucide-react";
import logoZ3us from "@/assets/logo-z3us.png";
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
}

export function PageLayout({ 
  children, 
  title = "DACHSER", 
  subtitle,
  showBack = false,
  headerActions 
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div 
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 10% 20%, rgba(255, 200, 0, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 90% 80%, rgba(255, 200, 0, 0.08) 0%, transparent 50%),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.85) 100%),
            url(${dachserBg})
          `,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      />

      {/* Animated Lines */}
      <div className="fixed inset-0 -z-5 overflow-hidden pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
            style={{
              top: `${25 + i * 25}%`,
              left: "-100%",
              right: "-100%",
              animation: `slideRight ${8 + i * 2}s linear infinite`,
              animationDelay: `${i * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left side - Logo and subtitle */}
            <div className="flex items-center gap-4">
              {showBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/dashboard")}
                  className="h-9 w-9 rounded-full border border-border/50 hover:bg-primary/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold tracking-[0.15em] text-foreground">{title}</span>
                <span className="text-primary font-bold">•••</span>
              </div>

              {subtitle && (
                <span className="text-sm text-muted-foreground hidden md:inline">
                  {subtitle}
                </span>
              )}
            </div>

            {/* Center - Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-card/50 rounded-full p-1 border border-border/50">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = location.pathname === tab.href;
                return (
                  <button
                    key={tab.href}
                    onClick={() => navigate(tab.href)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                      ${isActive 
                        ? 'bg-card text-foreground border border-primary/50 shadow-[0_0_12px_rgba(255,200,0,0.3)]' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {/* Right side - Actions and user */}
            <div className="flex items-center gap-3">
              {headerActions}
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/air/cct/manual")}
                className="h-9 w-9 rounded-full border border-border/50 hover:bg-primary/10"
                title="Ajuda"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>

              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/50 border border-border/50">
                  <span className="text-sm text-muted-foreground">@{user.username || user.email}</span>
                </div>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-9 w-9 rounded-full border border-border/50 hover:bg-destructive/10 hover:text-destructive"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideRight {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
