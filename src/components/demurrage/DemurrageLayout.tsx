import { useState, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Ship, Activity, DollarSign, FileText, Scale, Users, BarChart3, AlertTriangle, Clock, Package, HelpCircle, RefreshCw, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/cct/MetricCard";
import dachserBg from "@/assets/dachser-background.jpg";

interface DemurrageMetrics {
  totalContainers: number;
  atRisk: number;
  exceeded: number;
  safe: number;
}

type QuickFilter = "all" | "at_risk" | "exceeded" | "safe";

interface DemurrageLayoutProps {
  children: ReactNode;
  metrics?: DemurrageMetrics;
  loading?: boolean;
  onRefresh?: () => void;
  isRefetching?: boolean;
  rightActions?: ReactNode;
  activeFilter?: QuickFilter;
  onFilterChange?: (filter: QuickFilter) => void;
}

const navTabs = [
  { id: "monitor", label: "Monitor", icon: Activity, href: "/sea/demurrage" },
  { id: "pre-invoicing", label: "Pré-Faturamento", icon: FileText, href: "/sea/demurrage/pre-invoicing" },
  { id: "carrier-costs", label: "Custos Armadores", icon: Ship, href: "/sea/demurrage/carrier-costs" },
  { id: "rates", label: "Tarifas", icon: DollarSign, href: "/sea/demurrage/rates" },
  { id: "disputes", label: "Disputas", icon: Scale, href: "/sea/demurrage/disputes" },
  { id: "clients", label: "Clientes", icon: Users, href: "/sea/demurrage/clients" },
  { id: "analytics", label: "Analytics", icon: BarChart3, href: "/sea/demurrage/analytics" },
];

export function DemurrageLayout({
  children,
  metrics = { totalContainers: 0, atRisk: 0, exceeded: 0, safe: 0 },
  loading = false,
  onRefresh,
  isRefetching = false,
  rightActions,
  activeFilter = "all",
  onFilterChange,
}: DemurrageLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const getActiveTab = () => {
    const path = location.pathname;
    if (path === "/sea/demurrage" || path === "/sea/demurrage/monitor") return "monitor";
    if (path.includes("pre-invoicing")) return "pre-invoicing";
    if (path.includes("carrier-costs")) return "carrier-costs";
    if (path.includes("rates")) return "rates";
    if (path.includes("disputes")) return "disputes";
    if (path.includes("clients")) return "clients";
    if (path.includes("analytics")) return "analytics";
    return "monitor";
  };

  const activeTab = getActiveTab();

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
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">Intelligent Logistics — Demurrage / Detention</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - Actions and user */}
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefetching}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)] transition disabled:opacity-50 text-[0.8rem]"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          )}

          {rightActions}

          {user && (
            <div className="px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa] max-w-[180px] truncate">
              @{user.username || user.email}
            </div>
          )}

          {/* Help Button */}
          <button
            onClick={() => navigate("/sea/demurrage/manual")}
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
            title="Ajuda"
          >
            <HelpCircle size={16} />
          </button>

          <div
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#ffc800]"
            title="Demurrage"
          >
            <Ship size={16} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto px-2 pb-8">
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              <>
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
                <div className="h-28 rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] animate-pulse" />
              </>
            ) : (
              <>
                <div
                  onClick={() => onFilterChange?.("all")}
                  className={cn(
                    "cursor-pointer transition-all",
                    activeFilter === "all" && "ring-2 ring-[#ffc800] ring-offset-2 ring-offset-transparent rounded-2xl"
                  )}
                >
                  <MetricCard
                    title="Total Containers"
                    value={metrics.totalContainers}
                    icon={Package}
                    subtitle="Monitorados"
                  />
                </div>
                <div
                  onClick={() => onFilterChange?.("at_risk")}
                  className={cn(
                    "cursor-pointer transition-all",
                    activeFilter === "at_risk" && "ring-2 ring-[#ffc800] ring-offset-2 ring-offset-transparent rounded-2xl"
                  )}
                >
                  <MetricCard
                    title="Em Risco"
                    value={metrics.atRisk}
                    icon={AlertTriangle}
                    variant={metrics.atRisk > 0 ? "warning" : "info"}
                    subtitle="Free time expirando"
                  />
                </div>
                <div
                  onClick={() => onFilterChange?.("exceeded")}
                  className={cn(
                    "cursor-pointer transition-all",
                    activeFilter === "exceeded" && "ring-2 ring-[#ffc800] ring-offset-2 ring-offset-transparent rounded-2xl"
                  )}
                >
                  <MetricCard
                    title="Excedido"
                    value={metrics.exceeded}
                    icon={Clock}
                    variant={metrics.exceeded > 0 ? "critical" : "info"}
                    subtitle="Demurrage acumulando"
                  />
                </div>
                <div
                  onClick={() => onFilterChange?.("safe")}
                  className={cn(
                    "cursor-pointer transition-all",
                    activeFilter === "safe" && "ring-2 ring-[#ffc800] ring-offset-2 ring-offset-transparent rounded-2xl"
                  )}
                >
                  <MetricCard
                    title="No Prazo"
                    value={metrics.safe}
                    icon={Ship}
                    variant="success"
                    subtitle="Dentro do free time"
                  />
                </div>
              </>
            )}
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-[rgba(5,6,18,0.85)] border border-white/10 backdrop-blur-sm w-fit overflow-x-auto">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.href)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-[0.8rem] font-medium transition-all duration-200 whitespace-nowrap",
                    isActive
                      ? "bg-[rgba(255,200,0,0.15)] text-[#ffc800] border border-[#ffc800]/40 shadow-[0_0_12px_rgba(255,200,0,0.3)]"
                      : "text-[#aaaaaa] hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          {children}
        </div>
      </main>
    </div>
  );
}
