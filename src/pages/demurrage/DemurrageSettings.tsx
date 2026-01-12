import { DemurrageLayout } from "@/components/demurrage/DemurrageLayout";
import { DemurrageSettingsPanel } from "@/components/demurrage/DemurrageSettingsPanel";
import { HealthDashboard } from "@/components/demurrage/HealthDashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Activity, Database, FileText } from "lucide-react";

export default function DemurrageSettings() {
  return (
    <DemurrageLayout>
      <div className="space-y-4">
        <Card className="bg-[rgba(5,6,18,0.85)] border-[rgba(255,255,255,0.1)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Settings className="h-5 w-5 text-[#ffc800]" />
              Configurações e Diagnóstico
            </CardTitle>
            <CardDescription>
              Gerenciar parâmetros do módulo e verificar status das integrações
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList className="bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.1)]">
            <TabsTrigger value="settings" className="data-[state=active]:bg-[#ffc800] data-[state=active]:text-black">
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="health" className="data-[state=active]:bg-[#ffc800] data-[state=active]:text-black">
              <Activity className="h-4 w-4 mr-2" />
              Saúde do Sistema
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <DemurrageSettingsPanel />
          </TabsContent>

          <TabsContent value="health">
            <HealthDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </DemurrageLayout>
  );
}
