import { PageLayout } from "@/components/cct/PageLayout";
import { Card } from "@/components/ui/card";
import { Bell } from "lucide-react";

export default function RegrasNotificacao() {
  return (
    <PageLayout title="DACHSER" subtitle="Regras de Notificação — Sistema Hermes">
      <Card className="bg-card/50 border-border p-10 text-center">
        <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Configuração de regras de notificação em desenvolvimento</p>
      </Card>
    </PageLayout>
  );
}
