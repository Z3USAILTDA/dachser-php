import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SupervisorApproveRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token") || "";

  const targetUrl = useMemo(() => {
    const params = new URLSearchParams();

    if (token) {
      params.set("token", token);
    }

    params.set("action", "approve");

    return `/supervisor-confirmacao?${params.toString()}`;
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate(targetUrl, { replace: true });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [navigate, targetUrl]);

  const handleContinueNow = () => {
    navigate(targetUrl, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-lg border-white/10 bg-white/95 shadow-2xl backdrop-blur">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-11 w-11 text-emerald-600" />
            </div>

            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Ambiente seguro Dachser
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
              Aprovação do supervisor
            </h1>

            <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
              Estamos direcionando você para a tela de confirmação da aprovação.
              O token será validado antes da ação ser concluída.
            </p>

            <div className="mt-8 flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                Redirecionando para confirmação...
              </div>
            </div>

            <Button
              type="button"
              className="mt-6 w-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleContinueNow}
            >
              Continuar agora
            </Button>

            {!token && (
              <p className="mt-4 text-xs leading-5 text-amber-700">
                Atenção: nenhum token foi encontrado no link. A tela de
                confirmação irá validar a solicitação.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}