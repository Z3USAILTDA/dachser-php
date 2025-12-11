import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";

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
  showBack = true,
  headerActions 
}: PageLayoutProps) {
  const navigate = useNavigate();
  const storedUser = localStorage.getItem("dachserUser");
  const user = storedUser ? JSON.parse(storedUser) : null;

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
            <div className="flex items-center gap-4">
              {showBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(-1)}
                  className="h-9 w-9 rounded-full border border-border/50 hover:bg-primary/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              
              <div className="flex items-center gap-3">
                <img src={logoZ3us} alt="Z3US" className="h-8" />
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-foreground">{title}</span>
                  <span className="text-primary font-bold">•••</span>
                </div>
              </div>

              {subtitle && (
                <span className="text-sm text-muted-foreground hidden md:inline">
                  {subtitle}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {headerActions}
              
              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/50 border border-border/50">
                  <span className="text-sm text-muted-foreground">{user.email || user.username}</span>
                </div>
              )}
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
