// Dashboard with expandable CCT submenus
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Plane, Ship, CreditCard, FileText, Building2, UserCog } from "lucide-react";
import { useUsageLog } from "@/hooks/useUsageLog";
import { ScrollArea } from "@/components/ui/scroll-area";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";
interface SubChild {
  label: string;
  href: string;
}
interface ChildItem {
  label: string;
  href?: string;
  expandableId?: string;
  subChildren?: SubChild[];
  adminOnly?: boolean;
}
interface MenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  children?: ChildItem[];
  href?: string;
  adminOnly?: boolean;
}
// Usuários que só podem ver "Métricas de Uso" no menu ADMIN
const ADMIN_METRICS_ONLY_USERS = ["ana.tozzo"];

const menuItems: MenuItem[] = [
  {
    id: "admin",
    icon: <UserCog size={34} />,
    label: "ADMIN",
    subtitle: "Gestão da plataforma",
    adminOnly: true,
    children: [
      {
        label: "Cadastro de Usuário",
        href: "/admin/register",
      },
      {
        label: "Métricas de Uso",
        href: "/admin/metrics",
      },
      {
        label: "Gerenciamento de Usuários",
        href: "/admin/users",
      },
      {
        label: "Gerenciamento de APIs",
        href: "/admin/apis",
      },
      {
        label: "Monitoramento de Dados",
        href: "/admin/database",
      },
    ],
  },
  {
    id: "air",
    icon: <Plane size={34} />,
    label: "AIR",
    subtitle: "Operações Aéreas",
    children: [
      {
        label: "Check AWB x CNPJ",
        href: "/air/check",
      },
      {
        label: "Monitoramento Pré-Embarque",
        href: "/air/tracking",
      },
      {
        label: "Monitoramento Pós-Embarque",
        href: "/air/cct",
      },
    ],
  },
  {
    id: "sea",
    icon: <Ship size={34} />,
    label: "SEA",
    subtitle: "Operações Marítimas",
    children: [
      {
        label: "Análise Documental SEA",
        href: "/sea/analysis",
      },
      {
        label: "Local Charges",
        href: "/sea/local-charges",
      },
      {
        label: "Status Doc Exportação",
        href: "/sea/draft-exportacao",
        adminOnly: true,
      },
      {
        label: "Monitoramento FCL",
        href: "/sea/tracking",
      },
      {
        label: "Demurrage / Detention",
        href: "/sea/demurrage",
      },
    ],
  },
  {
    id: "fin",
    icon: <CreditCard size={34} />,
    label: "FIN",
    subtitle: "Financeiro & Billing",
    children: [
      {
        label: "Régua de Cobrança",
        href: "/fin/regua",
      },
      {
        label: "Voucher/SPO",
        href: "/fin/esteira",
      },
    ],
  },
  {
    id: "chb",
    icon: <FileText size={34} />,
    label: "CHB",
    subtitle: "Customs House Brokerage",
    children: [
      {
        label: "Análise Documental CHB",
        href: "/chb/conferences",
      },
    ],
  },
  {
    id: "olimpo",
    icon: <Building2 size={34} />,
    label: "OLIMPO",
    subtitle: "Visão Estratégica",
    href: "/olimpo",
  },
];
const Dashboard = () => {
  useUsageLog({ endpoint: "/dashboard" });
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [user, setUser] = useState<{
    id: number;
    email: string;
    username: string;
    is_admin: number;
    olimpo_only?: number;
    metrics_only?: number;
  } | null>(null);
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      // Usuários olimpo_only não podem acessar o Dashboard
      if (parsed.olimpo_only === 1) {
        navigate("/olimpo");
        return;
      }
      // Usuários metrics_only não podem acessar o Dashboard
      if (parsed.metrics_only === 1) {
        navigate("/admin/metrics");
        return;
      }
      setUser(parsed);
    } else {
      navigate("/");
    }
  }, [navigate]);
  const isAdmin = user?.is_admin === 1;
  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };
  const toggleMenu = (menuId: string) => {
    if (activeMenu !== menuId) {
      setExpandedChild(null);
    }
    setActiveMenu(activeMenu === menuId ? null : menuId);
  };
  const filteredMenuItems = menuItems.filter((item) => !item.adminOnly || isAdmin);
  
  // Função para filtrar children baseado em restrições de usuário
  const getVisibleChildren = (item: MenuItem) => {
    if (!item.children) return [];
    
    // Se for menu ADMIN e usuário está na lista de restritos, só mostrar "Métricas de Uso"
    if (item.id === "admin" && user?.username && ADMIN_METRICS_ONLY_USERS.includes(user.username)) {
      return item.children.filter(child => child.href === "/admin/metrics");
    }
    
    // Caso contrário, aplicar filtro padrão de adminOnly
    return item.children.filter(child => !child.adminOnly || isAdmin);
  };
  return (
    <ScrollArea className="h-screen w-full">
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background with image and gradient overlay */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(120deg, rgba(4, 17, 45, 0.92), rgba(26, 93, 173, 0.55))",
          }}
        />

        {/* Radial gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(245, 184, 67, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 80%, rgba(245, 184, 67, 0.08) 0%, transparent 50%)
            `,
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

      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-6 py-3 bg-background/30 backdrop-blur-sm border-b border-border/30">
        <div className="flex items-center gap-3">
          <img src={logoZ3us} alt="Z3US.AI" className="h-8 drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]" />
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-full bg-background/65 border border-border/30 text-muted-foreground text-sm max-w-[200px] truncate">
            @{user?.username || "usuario"}
          </div>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-full border border-border/50 flex items-center justify-center bg-background/70 text-primary hover:bg-background hover:shadow-[0_0_12px_hsl(var(--primary)/0.6)] transition-all duration-200"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-20 pb-16 px-4">
        {/* Brand Area */}
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-[0.16em] text-foreground mb-1">DACHSER</h1>
          <p className="text-foreground/90 text-base font-medium">Intelligent Logistics</p>
          <div className="flex justify-center gap-2.5 mt-3">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
          </div>
        </div>

        {/* Decorative Lines */}
        <div className="relative w-full max-w-4xl mx-auto h-20 mb-6 hidden md:block">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 left-1/2 w-0.5 h-full rounded-full opacity-70"
              style={{
                background: `linear-gradient(to bottom, hsl(var(--primary) / 0.7), hsl(var(--primary) / 0.08))`,
                transform: `translateX(${-280 + i * 112}px) skewX(${-20 + i * 8}deg)`,
                transformOrigin: "top",
              }}
            />
          ))}
        </div>

        {/* Menu Cards Row */}
        <div className="flex justify-center items-start gap-2.5 px-3">
          {filteredMenuItems.map((item) => (
            <div
              key={item.id}
              className="relative flex flex-col items-center"
              style={{ width: "162px" }}
            >
              {/* Card */}
              <div
                onClick={() => (item.href ? navigate(item.href) : toggleMenu(item.id))}
                className={`
                  w-[162px] h-[174px] rounded-[22px] flex flex-col items-center justify-center gap-3.5 cursor-pointer
                  transition-all duration-200 
                  ${activeMenu === item.id ? "text-primary-foreground -translate-y-1" : "text-foreground hover:-translate-y-1"}
                `}
                style={{
                  background:
                    activeMenu === item.id ? "linear-gradient(135deg, #ffc800, #ffe680)" : "rgba(4, 10, 30, 0.75)",
                  boxShadow:
                    activeMenu === item.id
                      ? "0 18px 50px rgba(0, 0, 0, 0.85), 0 0 18px rgba(255, 200, 0, 0.65)"
                      : "0 18px 50px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(18px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div
                  className={`
                    w-12 h-12 rounded-xl flex items-center justify-center
                    ${activeMenu === item.id ? "bg-background/12 border border-background/60 text-primary-foreground" : "bg-primary/12 border border-primary/60 text-primary"}
                  `}
                >
                  {item.icon}
                </div>
                <span className="text-[13px] font-semibold tracking-[0.16em] uppercase">{item.label}</span>
                <span
                  className={`text-[11px] text-center px-1 ${activeMenu === item.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                >
                  {item.subtitle}
                </span>
              </div>

              {/* Children Menu - Positioned relative to parent card */}
              {item.children && activeMenu === item.id && (
                <div 
                  className="absolute flex flex-col items-center animate-in fade-in duration-300"
                  style={{
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '18px',
                  }}
                >
                  {/* Vertical Line from parent */}
                  <div className="w-0.5 h-4 bg-primary" />

                  {/* Subcards Container */}
                  <div className="relative flex flex-col items-center">
                    {/* Horizontal connector line */}
                    {(() => {
                      const visibleChildren = getVisibleChildren(item);
                      return visibleChildren.length > 1 && (
                        <div 
                          className="absolute h-0.5 bg-primary"
                          style={{ 
                            top: 0,
                            width: `calc(${(visibleChildren.length - 1) * 200}px + ${(visibleChildren.length - 1) * 20}px)`,
                            left: '50%',
                            transform: 'translateX(-50%)',
                          }}
                        />
                      );
                    })()}

                    {/* Vertical pins container */}
                    <div className="flex justify-center" style={{ gap: '20px' }}>
                      {getVisibleChildren(item).map((child, idx) => (
                        <div 
                          key={idx} 
                          className="flex flex-col items-center"
                          style={{ width: '200px' }}
                        >
                          {/* Vertical pin connector */}
                          <div className="w-0.5 h-3 bg-primary" />
                          <div className="w-2 h-2 rounded-full bg-primary -mt-0.5 border border-background shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />

                          {child.expandableId ? (
                            <div className="relative mt-2.5 flex flex-col items-center w-full">
                              <button
                                onClick={() =>
                                  setExpandedChild(
                                    expandedChild === child.expandableId ? null : child.expandableId!
                                  )
                                }
                                className={`w-full px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer text-center ${
                                  expandedChild === child.expandableId
                                    ? 'bg-primary text-primary-foreground border border-primary shadow-[0_0_12px_hsl(var(--primary)/0.7)]'
                                    : 'text-foreground hover:-translate-y-0.5'
                                }`}
                                style={{
                                  ...(expandedChild !== child.expandableId && {
                                    background: 'rgba(4, 10, 30, 0.85)',
                                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                                    backdropFilter: 'blur(18px)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)'
                                  })
                                }}
                              >
                                {child.label}
                              </button>

                              {/* Sub Children */}
                              {expandedChild === child.expandableId && child.subChildren && (
                                <div className="flex flex-col items-center mt-4 animate-in fade-in duration-300">
                                  <div className="w-0.5 h-4 bg-primary" />

                                  <div className="relative flex flex-col items-center">
                                    {child.subChildren.length > 1 && (
                                      <div 
                                        className="absolute h-0.5 bg-primary"
                                        style={{ 
                                          top: 0,
                                          width: `calc(${(child.subChildren.length - 1) * 200}px + ${(child.subChildren.length - 1) * 20}px)`,
                                          left: '50%',
                                          transform: 'translateX(-50%)',
                                        }}
                                      />
                                    )}

                                    <div className="flex justify-center" style={{ gap: '20px' }}>
                                      {child.subChildren.map((subChild, subIdx) => (
                                        <div
                                          key={subIdx}
                                          className="flex flex-col items-center"
                                          style={{ width: '200px' }}
                                        >
                                          <div className="w-0.5 h-3 bg-primary" />
                                          <div className="w-2 h-2 rounded-full bg-primary -mt-0.5 border border-background shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />

                                          <button
                                            onClick={() => navigate(subChild.href)}
                                            className="mt-2.5 w-full px-4 py-2 rounded-full text-foreground text-xs font-medium hover:-translate-y-0.5 transition-all duration-200 text-center"
                                            style={{
                                              background: 'rgba(4, 10, 30, 0.85)',
                                              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                                              backdropFilter: 'blur(18px)',
                                              border: '1px solid rgba(255, 255, 255, 0.08)'
                                            }}
                                          >
                                            {subChild.label}
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => child.href && navigate(child.href)}
                              className="mt-2.5 w-full px-4 py-2 rounded-full text-foreground text-xs font-medium hover:-translate-y-0.5 transition-all duration-200 text-center"
                              style={{
                                background: 'rgba(4, 10, 30, 0.85)',
                                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                                backdropFilter: 'blur(18px)',
                                border: '1px solid rgba(255, 255, 255, 0.08)'
                              }}
                            >
                              {child.label}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
    </ScrollArea>
  );
};

export default Dashboard;
