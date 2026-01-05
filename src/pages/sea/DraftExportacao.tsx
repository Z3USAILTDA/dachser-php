import { PageLayout } from "@/components/layout/PageLayout";
import { Ship, Database, FileText, LayoutDashboard, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Placeholder - aguardando componentes do projeto original
const DraftExportacao = () => {
  return (
    <PageLayout
      title="Draft Exportação"
      subtitle="Tracking de MBLs e consulta de status Hapag-Lloyd"
      backTo="/dashboard"
      pageIcon={Ship}
    >
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="grid" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="grid" className="gap-2">
              <Database className="h-4 w-4" />
              Grid de Dados
            </TabsTrigger>
            <TabsTrigger value="tracker" className="gap-2">
              <Search className="h-4 w-4" />
              Tracker
            </TabsTrigger>
            <TabsTrigger value="multi" className="gap-2">
              <FileText className="h-4 w-4" />
              Multi-Busca
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="grid">
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Grid MariaDB</h3>
              <p className="text-muted-foreground">
                Aguardando integração dos componentes do projeto original.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="tracker">
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Hapag Tracker</h3>
              <p className="text-muted-foreground">
                Aguardando integração dos componentes do projeto original.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="multi">
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Multi-Busca</h3>
              <p className="text-muted-foreground">
                Aguardando integração dos componentes do projeto original.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="dashboard">
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <LayoutDashboard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Dashboard de Sincronização</h3>
              <p className="text-muted-foreground">
                Aguardando integração dos componentes do projeto original.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
};

export default DraftExportacao;
