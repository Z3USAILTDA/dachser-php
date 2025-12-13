import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, CheckCircle, XCircle, Loader2 } from "lucide-react";

export const DatabaseConnectionIndicator = () => {
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-db-connection", {
          body: {}
        });

        if (error || !data?.success) {
          setStatus("error");
        } else {
          setStatus("connected");
        }
      } catch (e) {
        setStatus("error");
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-lg">
        <Database className="w-4 h-4 text-primary" />
        {status === "loading" && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Verificando...</span>
          </>
        )}
        {status === "connected" && (
          <>
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-green-500">Conectado</span>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-red-500">Desconectado</span>
          </>
        )}
      </div>
    </div>
  );
};
