import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe, DollarSign, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const modules = [
  {
    id: "mapa",
    label: "Movimentação Global",
    icon: Globe,
    description: "Mapa global de cargas em trânsito — aéreo e marítimo",
    href: "/olimpo/mapa",
  },
  {
    id: "cobranca",
    label: "Cobrança",
    icon: DollarSign,
    description: "Aging de recebíveis por produto — visão analítica",
    href: "/olimpo/cobranca",
  },
];

export default function OlimpoIndex() {
  const navigate = useNavigate();

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Olimpo — Visão Estratégica"
      pageIcon={Building2}
    >
      <div className="space-y-6">
        {/* Header */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Building2 className="h-5 w-5 text-primary" />
              Olimpo — Hub Estratégico
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Visão consolidada de operações globais e indicadores financeiros
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Module Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card
                key={mod.id}
                className="bg-card border-border hover:border-primary/50 hover:-translate-y-1 transition-all duration-200 cursor-pointer"
                onClick={() => navigate(mod.href)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">
                        {mod.label}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {mod.description}
                      </p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
}
