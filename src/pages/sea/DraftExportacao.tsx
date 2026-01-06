import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { Ship, Database, FileText, LayoutDashboard, Search, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDraftData } from "@/hooks/useDraftData";
import { DraftDataGrid } from "@/components/draft/DraftDataGrid";
import { HapagTrackerPanel } from "@/components/draft/HapagTrackerPanel";
import { DraftMultiSearch } from "@/components/draft/DraftMultiSearch";
import { DraftSyncDashboard } from "@/components/draft/DraftSyncDashboard";

const DraftExportacao = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const { combinedData, stats, isLoading, refetch } = useDraftData();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const adminStatus = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
      setIsAdmin(adminStatus);
      
      if (!adminStatus) {
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  if (isAdmin === null) {
    return (
      <PageLayout
        title="Draft Exportação"
        subtitle="Verificando permissões..."
        backTo="/dashboard"
        pageIcon={Ship}
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageLayout>
    );
  }

  if (!isAdmin) {
    return (
      <PageLayout
        title="Acesso Negado"
        subtitle="Você não tem permissão para acessar esta página"
        backTo="/dashboard"
        pageIcon={ShieldAlert}
      >
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso Restrito</h3>
          <p className="text-muted-foreground">
            Esta funcionalidade está disponível apenas para administradores.
          </p>
        </div>
      </PageLayout>
    );
  }

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
            <DraftDataGrid 
              data={combinedData}
              onRefresh={refetch}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="tracker">
            <HapagTrackerPanel onSave={refetch} />
          </TabsContent>

          <TabsContent value="multi">
            <DraftMultiSearch onComplete={refetch} />
          </TabsContent>

          <TabsContent value="dashboard">
            <DraftSyncDashboard 
              stats={stats}
              combinedData={combinedData}
              onSyncPending={async () => {
                // Trigger processing of pending MBLs through the grid
                await refetch();
              }}
              isLoading={isLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
};

export default DraftExportacao;
