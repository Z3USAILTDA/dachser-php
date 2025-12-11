import { PageLayout } from "@/components/cct/PageLayout";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function AnalyticsDashboard() {
  return (
    <PageLayout title="DACHSER" subtitle="Analytics CCT — Indicadores e Performance">
      <Card className="bg-card/50 border-border p-10 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Dashboard de analytics em desenvolvimento</p>
      </Card>
    </PageLayout>
  );
}
