import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Clock, ArrowLeft } from "lucide-react";

const CronManager = () => {
  const navigate = useNavigate();

  return (
    <PageLayout title="ADMIN" subtitle="Gerenciador de Crons">
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center">
          <Clock className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Funcionalidade desativada</h2>
          <p className="text-sm text-muted-foreground mt-1">
            O gerenciador de crons está temporariamente indisponível.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    </PageLayout>
  );
};

export default CronManager;
