import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ship, Activity, DollarSign, BarChart3, Scale, Users, FileText, Settings, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const modules = [
  { 
    id: "monitor", 
    label: "Monitor", 
    icon: Activity, 
    description: "Monitoramento de containers em tempo real",
    href: "/sea/demurrage/monitor"
  },
  { 
    id: "free-times", 
    label: "Free Times", 
    icon: Clock, 
    description: "Gestão de free times por cliente e processo",
    href: "/sea/demurrage/free-times"
  },
  { 
    id: "rates", 
    label: "Tarifas", 
    icon: DollarSign, 
    description: "Gestão de tarifas de demurrage por armador",
    href: "/sea/demurrage/rates"
  },
  { 
    id: "pre-invoicing", 
    label: "Pré-Faturamento", 
    icon: FileText, 
    description: "Geração e gestão de pré-faturas",
    href: "/sea/demurrage/pre-invoicing"
  },
  { 
    id: "carrier-costs", 
    label: "Custos Armadores", 
    icon: Ship, 
    description: "Faturas recebidas dos armadores",
    href: "/sea/demurrage/carrier-costs"
  },
  { 
    id: "disputes", 
    label: "Disputas", 
    icon: Scale, 
    description: "Gestão de disputas de demurrage",
    href: "/sea/demurrage/disputes"
  },
  { 
    id: "clients", 
    label: "Clientes", 
    icon: Users, 
    description: "Perfis e configurações por cliente",
    href: "/sea/demurrage/clients"
  },
  { 
    id: "analytics", 
    label: "Analytics", 
    icon: BarChart3, 
    description: "Visão gerencial e dashboards",
    href: "/sea/demurrage/analytics"
  },
  { 
    id: "settings", 
    label: "Configurações", 
    icon: Settings, 
    description: "Parâmetros e diagnóstico do sistema",
    href: "/sea/demurrage/settings"
  },
];

export default function DemurrageIndex() {
  const navigate = useNavigate();

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Demurrage / Detention"
      pageIcon={Ship}
    >
      <div className="space-y-6">
        {/* Header */}
        <Card className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Ship className="h-5 w-5 text-primary" />
              Gestão de Demurrage & Detention
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Controle completo de custos de sobrestadia e detenção de containers
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Module Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card 
                key={module.id}
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.1)] hover:border-primary/50 hover:-translate-y-1 transition-all duration-200 cursor-pointer"
                onClick={() => navigate(module.href)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-foreground">{module.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{module.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
}
