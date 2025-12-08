import React from "react";
import { Mail, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DashboardStats } from "./TrackingTypes";

interface TrackingStatsCardsProps {
  stats: DashboardStats;
}

export const TrackingStatsCards: React.FC<TrackingStatsCardsProps> = ({ stats }) => {
  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {/* Total Monitorados */}
      <Card className="bg-card/90 border-border backdrop-blur-sm shadow-lg">
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
              {stats.total_awbs}
            </span>
            <span className="text-xs text-muted-foreground">AWBs ativos</span>
          </div>
        </div>
      </Card>

      {/* Em Trânsito */}
      <Card className="bg-gradient-to-br from-blue-900/40 via-blue-900/10 to-card border-blue-700/50 shadow-lg">
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
              {stats.active_awbs}
            </span>
            <span className="text-xs text-blue-200/80">DEP, MAN, RCF, ARR</span>
          </div>
        </div>
      </Card>

      {/* Em Alerta */}
      <Card className="bg-gradient-to-br from-primary/30 via-primary/10 to-card border-primary/50 shadow-lg">
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
              {stats.alert_awbs}
            </span>
            <span className="text-xs text-primary/80">DIS, OFLD – Atrasos</span>
          </div>
        </div>
      </Card>

      {/* Críticos */}
      <Card className="bg-gradient-to-br from-destructive/40 via-destructive/20 to-card border-destructive/50 shadow-lg">
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
              {stats.critical_awbs}
            </span>
            <span className="text-xs text-destructive/80">NIL, NIF – Ação imediata</span>
          </div>
        </div>
      </Card>
    </section>
  );
};
