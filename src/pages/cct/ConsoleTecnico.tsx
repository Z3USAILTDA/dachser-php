import { PageLayout } from "@/components/cct/PageLayout";
import { Card } from "@/components/ui/card";
import { Server } from "lucide-react";

export default function ConsoleTecnico() {
  return (
    <PageLayout title="DACHSER" subtitle="Console Técnico — Monitoramento de Sistema">
      <Card className="bg-card/50 border-border p-10 text-center">
        <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Console técnico em desenvolvimento</p>
      </Card>
    </PageLayout>
  );
}
