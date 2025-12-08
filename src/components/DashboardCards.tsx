import React from "react";
import { Card } from "@/components/ui/card";
import { Plane, AlertTriangle, Loader2, Mail } from "lucide-react";

export type CardFilterType = "all" | "transito" | "alerta" | "criticos";

interface DashboardCardsProps {
  totalMonitorados: number;
  emTransito: number;
  emAlerta: number;
  criticos: number;
  activeFilter: CardFilterType;
  onFilterChange: (filter: CardFilterType) => void;
}

const DashboardCards: React.FC<DashboardCardsProps> = ({
  totalMonitorados,
  emTransito,
  emAlerta,
  criticos,
  activeFilter,
  onFilterChange,
}) => {
  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {/* Total Monitorados */}
      <Card 
        className={`bg-card/90 border-border backdrop-blur-sm shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeFilter === "all" ? "ring-2 ring-primary" : ""}`}
        onClick={() => onFilterChange("all")}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Monitorados
            </span>
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted text-primary">
              <Mail className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-end justify-between mt-auto">
            <span className="text-3xl font-semibold text-foreground">
              {totalMonitorados}
            </span>
            <span className="text-xs text-muted-foreground">AWBs ativos</span>
          </div>
        </div>
      </Card>

      {/* Em Trânsito */}
      <Card 
        className={`bg-gradient-to-br from-blue-900/40 via-blue-900/10 to-card border-blue-700/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeFilter === "transito" ? "ring-2 ring-blue-400" : ""}`}
        onClick={() => onFilterChange("transito")}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-blue-200">
              Em Trânsito
            </span>
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-900/60 text-blue-300">
              <Loader2 className="w-4 h-4 animate-spin" />
            </span>
          </div>
          <div className="flex items-end justify-between mt-auto">
            <span className="text-3xl font-semibold text-blue-300">
              {emTransito}
            </span>
            <span className="text-xs text-blue-200/80">DEP, MAN, RCF, ARR</span>
          </div>
        </div>
      </Card>

      {/* Em Alerta */}
      <Card 
        className={`bg-gradient-to-br from-primary/30 via-primary/10 to-card border-primary/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeFilter === "alerta" ? "ring-2 ring-primary" : ""}`}
        onClick={() => onFilterChange("alerta")}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-primary">
              Em Alerta
            </span>
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/30 text-primary">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-end justify-between mt-auto">
            <span className="text-3xl font-semibold text-primary">
              {emAlerta}
            </span>
            <span className="text-xs text-primary/80">DIS, OFLD – Atrasos</span>
          </div>
        </div>
      </Card>

      {/* Críticos */}
      <Card 
        className={`bg-gradient-to-br from-destructive/40 via-destructive/20 to-card border-destructive/50 shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${activeFilter === "criticos" ? "ring-2 ring-destructive" : ""}`}
        onClick={() => onFilterChange("criticos")}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-destructive">
              Críticos
            </span>
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-destructive/40 text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-end justify-between mt-auto">
            <span className="text-3xl font-semibold text-destructive">
              {criticos}
            </span>
            <span className="text-xs text-destructive/80">NIL, NIF – Ação imediata</span>
          </div>
        </div>
      </Card>
    </section>
  );
};

export default DashboardCards;
