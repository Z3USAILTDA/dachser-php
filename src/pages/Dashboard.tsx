import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Plane, Ship, CreditCard, FileText, Building2, UserCog } from "lucide-react";
import logoZ3us from "@/assets/logo-z3us.png";
import dachserBg from "@/assets/dachser-background.jpg";

interface VoucherChild {
  label: string;
  href: string;
}

interface ChildItem {
  label: string;
  href?: string;
  isVoucher?: boolean;
  voucherChildren?: VoucherChild[];
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
      { label: "Cadastro de Usuário", href: "/admin/register" },
      { label: "Métricas de Uso", href: "/admin/metrics" },
    ],
  },
  {
    id: "air",
    icon: <Plane size={28} />,
    label: "AIR",
    subtitle: "Operações Aéreas",
    children: [
      { label: "Rastreio Aéreo", href: "/air/tracking" },
      { label: "Check AWB x CNPJ", href: "/air/check" },
    ],
  },
  {
    id: "sea",
    icon: <Ship size={28} />,
    label: "SEA",
    subtitle: "Operações Marítimas",
    children: [
      { label: "Análises Marítimas", href: "/sea/analytics" },
    ],
  },
  {
    id: "fin",
    icon: <CreditCard size={28} />,
    label: "FIN",
    subtitle: "Financeiro & Billing",
    children: [
      { label: "Régua de Cobrança", href: "/fin/billing" },
      { 
        label: "Voucher", 
        isVoucher: true,
        voucherChildren: [
          { label: "Local Charge", href: "/fin/local-charge" },
          { label: "Alterações de Fee", href: "/fin/fee-changes" },
          { label: "Análise Documental", href: "/fin/document-analysis" },
          { label: "Esteira", href: "/fin/workflow" },
        ]
      },
    ],
  },
  {
    id: "chb",
    icon: <FileText size={28} />,
    label: "CHB",
    subtitle: "Customs House Brokerage",
    children: [
      { label: "Conferências CHB", href: "/chb/conferences" },
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
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [voucherExpanded, setVoucherExpanded] = useState(false);
  const [user, setUser] = useState<{ id: number; email: string; username: string; is_admin: number } | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
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
      setVoucherExpanded(false);
    }
    setActiveMenu(activeMenu === menuId ? null : menuId);
  };

  const filteredMenuItems = menuItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background Image */}
      <div className="fixed inset-0">
        <img 
          src={dachserBg} 
          alt="DACHSER Logistics" 
          className="w-full h-full object-cover"
          style={{ filter: 'saturate(0.8)' }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(circle at 10% 0%, rgba(255, 200, 0, 0.22), transparent 55%),
              radial-gradient(circle at 90% 100%, rgba(255, 200, 0, 0.16), transparent 55%),
              linear-gradient(180deg, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.82))
            `
          }}
        />
      </div>

      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-6 py-3 bg-background/30 backdrop-blur-sm border-b border-border/30">
        <div className="flex items-center gap-3">
          <img 
            src={logoZ3us} 
            alt="Z3US.AI" 
            className="h-8 drop-shadow-[0_0_8px_rgba(0,0,0,0.9)]"
          />
          <span className="text-muted-foreground text-xs tracking-[0.2em] uppercase hidden sm:block">
            FOR LOGISTICS
          </span>
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
          <h1 className="text-4xl md:text-5xl font-bold tracking-[0.16em] text-foreground mb-2">
            DACHSER
          </h1>
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
                transformOrigin: 'top',
              }}
            />
          ))}
        </div>

        {/* Menu Cards Row */}
        <div className="flex justify-center items-start gap-2 px-4">
          {filteredMenuItems.map((item) => (
            <div key={item.id} className="flex flex-col items-center" style={{ width: '170px' }}>
              {/* Card */}
              <div
                onClick={() => item.href ? navigate(item.href) : toggleMenu(item.id)}
                className={`
                  w-[170px] h-[180px] rounded-3xl border flex flex-col items-center justify-center gap-3 cursor-pointer
                  transition-all duration-200 
                  ${activeMenu === item.id 
                    ? 'bg-primary text-primary-foreground border-background shadow-[0_22px_36px_rgba(0,0,0,0.95),0_0_22px_hsl(var(--primary)/0.65)] -translate-y-1' 
                    : 'bg-background/90 border-border/30 text-foreground hover:bg-card hover:border-primary hover:-translate-y-1 hover:shadow-[0_22px_36px_rgba(0,0,0,0.95),0_0_22px_hsl(var(--primary)/0.65)]'
                  }
                `}
                style={{ boxShadow: '0 18px 30px rgba(0, 0, 0, 0.9)' }}
              >
                <div 
                  className={`
                    w-12 h-12 rounded-2xl flex items-center justify-center
                    ${activeMenu === item.id 
                      ? 'bg-background/12 border border-background/60 text-primary-foreground' 
                      : 'bg-primary/12 border border-primary/60 text-primary'
                    }
                  `}
                >
                  {item.icon}
                </div>
                <span className="text-xs font-semibold tracking-[0.18em] uppercase">{item.label}</span>
                <span className={`text-[10px] text-center ${activeMenu === item.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {item.subtitle}
                </span>
              </div>

              {/* Children Menu - Below Parent */}
              {item.children && activeMenu === item.id && (
                <div className="flex flex-col items-center mt-6 animate-in fade-in duration-300">
                  {/* Vertical Line */}
                  <div className="w-0.5 h-5 bg-primary" />
                  
                  {/* Children Row */}
                  <div className="relative flex gap-6">
                    {/* Horizontal line spanning from first to last child center */}
                    {item.children.length > 1 && (
                      <div 
                        className="absolute top-0 h-0.5 bg-primary"
                        style={{ 
                          left: '90px',
                          right: '90px',
                        }}
                      />
                    )}
                    
                    {item.children.map((child, idx) => (
                      <div key={idx} className="relative flex flex-col items-center pt-0 w-[180px]">
                        {/* Vertical connector */}
                        <div className="w-0.5 h-3 bg-primary" />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary -mt-0.5" />
                        
                        {child.isVoucher ? (
                          <div className="relative mt-2 flex flex-col items-center">
                            <button
                              onClick={() => setVoucherExpanded(!voucherExpanded)}
                              className={`min-w-[180px] px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                                voucherExpanded 
                                  ? 'bg-primary text-primary-foreground border border-primary shadow-[0_0_14px_hsl(var(--primary)/0.7)]' 
                                  : 'bg-background border border-primary text-foreground shadow-[0_0_10px_hsl(var(--primary)/0.5)] hover:-translate-y-0.5'
                              }`}
                            >
                              {child.label}
                            </button>
                            
                            {/* Voucher Children - Positioned absolutely to not affect parent layout */}
                            <div 
                              className={`absolute top-full left-1/2 -translate-x-1/2 flex flex-col items-center mt-6 transition-all duration-300 ${
                                voucherExpanded && child.voucherChildren 
                                  ? 'opacity-100 translate-y-0' 
                                  : 'opacity-0 -translate-y-2 pointer-events-none'
                              }`}
                            >
                              {child.voucherChildren && (
                                <>
                                  {/* Vertical Line from Voucher */}
                                  <div className="w-0.5 h-5 bg-primary" />
                                  
                                  {/* Children Row */}
                                  <div className="relative flex gap-6">
                                    {/* Horizontal line spanning from first to last child center */}
                                    {child.voucherChildren.length > 1 && (
                                      <div 
                                        className="absolute top-0 h-0.5 bg-primary"
                                        style={{ 
                                          left: '90px',
                                          right: '90px',
                                        }}
                                      />
                                    )}
                                    
                                    {child.voucherChildren.map((vChild, vIdx) => (
                                      <div key={vIdx} className="relative flex flex-col items-center pt-0 min-w-[180px]">
                                        {/* Vertical connector */}
                                        <div className="w-0.5 h-3 bg-primary" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary -mt-0.5" />
                                        
                                        <button
                                          onClick={() => navigate(vChild.href)}
                                          className="mt-2 min-w-[180px] px-5 py-2.5 rounded-full bg-background border border-border/50 text-foreground text-sm font-medium hover:border-primary/60 hover:-translate-y-0.5 transition-all duration-200 shadow-lg"
                                        >
                                          {vChild.label}
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
                            className="mt-2 min-w-[180px] px-5 py-2.5 rounded-full bg-background border border-border/50 text-foreground text-sm font-medium hover:border-primary/60 hover:-translate-y-0.5 transition-all duration-200 shadow-lg"
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
