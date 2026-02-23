import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { KeyRound, Play, Loader2, CheckCircle2, XCircle, Clock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ApiConfig {
  key: string;
  name: string;
  description: string;
  secretName: string;
}

const APIs: ApiConfig[] = [
  { key: "gemini", name: "Gemini", description: "Google AI – Extração & Análise", secretName: "GEMINI_API_KEY" },
  { key: "anthropic", name: "Anthropic", description: "Claude – Análise Documental", secretName: "ANTHROPIC_API_KEY" },
  { key: "resend", name: "Resend", description: "Envio de E-mails", secretName: "RESEND_API_KEY" },
  { key: "leadcomex", name: "Leadcomex", description: "Consulta DI / Comércio Exterior", secretName: "LEADCOMEX_API_TOKEN" },
  { key: "jsoncargo", name: "JSONCargo", description: "Tracking Marítimo", secretName: "JSONCARGO_API_KEY" },
  { key: "flightradar24", name: "FlightRadar24", description: "Tracking Aéreo", secretName: "FLIGHTRADAR_API_KEY" },
  { key: "hapag", name: "Hapag-Lloyd", description: "Tracking Container", secretName: "HAPAG_CLIENT_ID + HAPAG_API_KEY" },
  { key: "firecrawl", name: "Firecrawl", description: "Web Scraping", secretName: "FIRECRAWL_API_KEY" },
];

interface TestResult {
  success: boolean;
  responseTimeMs: number;
  error?: string;
  details?: string;
}

type Status = "idle" | "testing" | "ok" | "error";

export default function ApiKeyTest() {
  const [results, setResults] = useState<Record<string, { status: Status; result?: TestResult }>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [customKeys, setCustomKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const testApi = async (apiKey: string) => {
    setResults((prev) => ({ ...prev, [apiKey]: { status: "testing" } }));
    try {
      const body: Record<string, string> = { apiName: apiKey };
      const custom = customKeys[apiKey]?.trim();
      if (custom) body.customKey = custom;

      const { data, error } = await supabase.functions.invoke("test-api-key", { body });
      if (error) throw error;
      const result = data as TestResult;
      setResults((prev) => ({
        ...prev,
        [apiKey]: { status: result.success ? "ok" : "error", result },
      }));
    } catch (err: any) {
      setResults((prev) => ({
        ...prev,
        [apiKey]: { status: "error", result: { success: false, responseTimeMs: 0, error: err.message } },
      }));
    }
  };

  const testAll = async () => {
    setTestingAll(true);
    for (const api of APIs) {
      await testApi(api.key);
    }
    setTestingAll(false);
  };

  const getStatusBadge = (apiKey: string) => {
    const state = results[apiKey];
    if (!state || state.status === "idle") {
      return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">Não testado</Badge>;
    }
    if (state.status === "testing") {
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Testando...</Badge>;
    }
    if (state.status === "ok") {
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>;
    }
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Erro</Badge>;
  };

  return (
    <PageLayout title="ADMIN" subtitle="Teste de API Keys" pageIcon={KeyRound}>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          Verifique se as chaves de API do sistema estão válidas e funcionando.
        </p>
        <Button onClick={testAll} disabled={testingAll} className="gap-2">
          {testingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Testar Todas
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {APIs.map((api) => {
          const state = results[api.key];
          const result = state?.result;

          return (
            <Card
              key={api.key}
              className={`transition-all duration-300 ${
                state?.status === "ok"
                  ? "border-emerald-500/40"
                  : state?.status === "error"
                  ? "border-red-500/40"
                  : "border-border/30"
              }`}
            >
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{api.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{api.description}</p>
                  </div>
                  {getStatusBadge(api.key)}
                </div>

                <p className="text-[11px] text-muted-foreground/60 font-mono">{api.secretName}</p>

                <div className="flex items-center gap-1.5">
                  <Input
                    type={showKeys[api.key] ? "text" : "password"}
                    placeholder="Colar chave para teste..."
                    value={customKeys[api.key] || ""}
                    onChange={(e) => setCustomKeys((prev) => ({ ...prev, [api.key]: e.target.value }))}
                    className="h-8 text-xs rounded-md font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setShowKeys((prev) => ({ ...prev, [api.key]: !prev[api.key] }))}
                  >
                    {showKeys[api.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>

                {customKeys[api.key]?.trim() && (
                  <p className="text-[11px] text-amber-400/80">⚡ Usando chave temporária</p>
                )}

                {result && (
                  <div className="space-y-1">
                    {result.responseTimeMs > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {result.responseTimeMs}ms
                      </div>
                    )}
                    {result.error && (
                      <p className="text-xs text-red-400 break-all">{result.error}</p>
                    )}
                    {result.details && (
                      <p className="text-[11px] text-muted-foreground/70 break-all">{result.details}</p>
                    )}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto"
                  onClick={() => testApi(api.key)}
                  disabled={state?.status === "testing"}
                >
                  {state?.status === "testing" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Testar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageLayout>
  );
}
