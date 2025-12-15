// Dashboard with expandable CCT submenus
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Plane, Ship, CreditCard, FileText, Building2, UserCog } from "lucide-react";
import { useUsageLog } from "@/hooks/useUsageLog";
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
const menuItems: MenuItem[] = [
  {
    id: "admin",
    icon: <UserCog size={28} />,
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
    ],
  },
  {
    id: "air",
    icon: <Plane size={28} />,
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
    icon: <Ship size={28} />,
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
    ],
  },
  {
    id: "fin",
    icon: <CreditCard size={28} />,
    label: "FIN",
    subtitle: "Financeiro & Billing",
    children: [
      {
        label: "Régua de Cobrança",
        href: "/fin/regua",
      },
      {
        label: "Voucher",
        expandableId: "voucher",
        subChildren: [
          {
            label: "Análise Documental",
            href: "/fin/analise-documental",
          },
          {
            label: "Esteira",
            href: "/fin/esteira",
          },
        ],
      },
    ],
  },
  {
    id: "chb",
    icon: <FileText size={28} />,
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
    icon: <Building2 size={28} />,
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
  return (
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
      <main className="relative z-10 pt-24 pb-20 px-4">
        {/* Brand Area */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-[0.16em] text-foreground mb-2">DACHSER</h1>
          <p className="text-foreground/90 text-lg font-medium">Intelligent Logistics</p>
          <div className="flex justify-center gap-3 mt-4">
            <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
            <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
            <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
          </div>
        </div>

        {/* Decorative Lines */}
        <div className="relative w-full max-w-5xl mx-auto h-28 mb-8 hidden md:block">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 left-1/2 w-0.5 h-full rounded-full opacity-70"
              style={{
                background: `linear-gradient(to bottom, hsl(var(--primary) / 0.7), hsl(var(--primary) / 0.08))`,
                transform: `translateX(${-320 + i * 128}px) skewX(${-20 + i * 8}deg)`,
                transformOrigin: "top",
              }}
            />
          ))}
        </div>

        {/* Menu Cards Row */}
        <div className="flex justify-center items-start gap-2 px-4">
          {filteredMenuItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-center"
              style={{
                width: "170px",
              }}
            >
              {/* Card */}
              <div
                onClick={() => (item.href ? navigate(item.href) : toggleMenu(item.id))}
                className={`
                  w-[170px] h-[180px] rounded-[22px] flex flex-col items-center justify-center gap-3 cursor-pointer
                  transition-all duration-200 
                  ${activeMenu === item.id ? "text-primary-foreground -translate-y-1" : "text-foreground hover:-translate-y-1"}
                `}
                style={{
                  background:
                    activeMenu === item.id ? "linear-gradient(135deg, #ffc800, #ffe680)" : "rgba(4, 10, 30, 0.75)",
                  boxShadow:
                    activeMenu === item.id
                      ? "0 22px 60px rgba(0, 0, 0, 0.85), 0 0 22px rgba(255, 200, 0, 0.65)"
                      : "0 22px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(18px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div
                  className={`
                    w-12 h-12 rounded-2xl flex items-center justify-center
                    ${activeMenu === item.id ? "bg-background/12 border border-background/60 text-primary-foreground" : "bg-primary/12 border border-primary/60 text-primary"}
                  `}
                >
                  {item.icon}
                </div>
                <span className="text-xs font-semibold tracking-[0.18em] uppercase">{item.label}</span>
                <span
                  className={`text-[10px] text-center ${activeMenu === item.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                >
                  {item.subtitle}
                </span>
              </div>

              {/* Children Menu - Below Parent */}
{item.children && activeMenu === item.id && (
  <div className="flex flex-col items-center mt-6 animate-in fade-in duration-300">
    {/* Vertical Line */}
    <div className="w-0.5 h-5 bg-primary" />

    {/* Children Row */}
    <div className="relative flex gap-8 justify-center">
      {/* Linha horizontal – conecta centro do primeiro ao centro do último filho */}
      {item.children.length > 1 && (
        <div
          className="absolute top-0 h-0.5 bg-primary"
          style={{ left: '72px', right: '118px' }}
        />
      )}

      {item.children.map((child, idx) => (
        <div key={idx} className="relative flex flex-col items-center">
          {/* Vertical connector */}
          <div className="w-0.5 h-3 bg-primary" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary -mt-0.5" />

          {child.expandableId ? (
            <div className="relative mt-2 flex flex-col items-center">
              <button
                onClick={() =>
                  setExpandedChild(
                    expandedChild === child.expandableId ? null : child.expandableId!
                  )
                }
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap text-center ${
                  expandedChild === child.expandableId
                    ? 'bg-primary text-primary-foreground border border-primary shadow-[0_0_14px_hsl(var(--primary)/0.7)]'
                    : 'text-foreground hover:-translate-y-0.5'
                }`}
                style={{
                  // aumenta largura do card "Voucher"
                  ...(child.label === 'Voucher' && { minWidth: '220px' }),
                  ...(expandedChild !== child.expandableId && {
                    background: 'rgba(4, 10, 30, 0.75)',
                    boxShadow:
                      '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(18px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  })
                }}
              >
                {child.label}
              </button>

              {/* Sub Children */}
              <div
                className={`absolute top-full left-1/2 -translate-x-1/2 z-20 flex flex-col items-center mt-8 transition-all duration-300 ${
                  expandedChild === child.expandableId && child.subChildren
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 -translate-y-2 pointer-events-none'
                }`}
              >
                {child.subChildren && (
                  <>
                    {/* Vertical Line */}
                    <div className="w-0.5 h-5 bg-primary" />

                    {/* Sub-children Row */}
                    <div className="relative flex gap-8 justify-center">
                      {child.subChildren.length > 1 && (
                        <div
                          className="absolute top-0 h-0.5 bg-primary"
                          style={{ left: '90px', right: '90px' }}
                        />
                      )}

                      {child.subChildren.map((subChild, subIdx) => (
                        <div
                          key={subIdx}
                          className="relative flex flex-col items-center"
                        >
                          <div className="w-0.5 h-3 bg-primary" />
                          <div className="w-1.5 h-1.5 rounded-full bg-primary -mt-0.5" />

                          <button
                            onClick={() => navigate(subChild.href)}
                            className="mt-2 px-5 py-2.5 rounded-full text-foreground text-sm font-medium hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap text-center"
                            style={{
                              // aumenta largura do card "Esteira"
                              ...(subChild.label === 'Esteira' && {
                                minWidth: '220px'
                              }),
                              background: 'rgba(4, 10, 30, 0.75)',
                              boxShadow:
                                '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                              backdropFilter: 'blur(18px)',
                              border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}
                          >
                            {subChild.label}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => child.href && navigate(child.href)}
              className="mt-2 px-5 py-2.5 rounded-full text-foreground text-sm font-medium hover:-translate-y-0.5 transition-all duration-200 text-center whitespace-nowrap"
              style={{
                background: 'rgba(4, 10, 30, 0.75)',
                boxShadow:
                  '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
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
)}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
