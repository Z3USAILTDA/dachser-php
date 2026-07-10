import { useState, useEffect } from "react";
import { PageLayout } from "@/components/cct/PageLayout";
import { useProcessosCCT } from "@/hooks/useCCTData";
import { BarChart3, RefreshCw, Loader2 } from "lucide-react";

export default function AnalyticsDashboard() {
  const { data: processos = [], isLoading, refetch, isRefetching } = useProcessosCCT();
  const [periodo, setPeriodo] = useState("30");

  useEffect(() => {
    console.log("[DEBUG] Component mounted, processos:", processos);
  }, [processos]);

  if (isLoading) {
    return (
      <PageLayout 
        title="DACHSER" 
        subtitle="Analytics CCT — Carregando..."
        pageIcon={BarChart3}
      >
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-[#ffc800]" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="DACHSER" 
      subtitle="Analytics CCT — DEBUG"
      pageIcon={BarChart3}
      headerActions={
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-9 w-9 rounded-full border border-[rgba(255,255,255,0.25)] flex items-center justify-center bg-[rgba(0,0,0,0.7)] text-[#aaaaaa] hover:text-[#ffc800] transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <div className="space-y-6">
        {/* STATUS */}
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5">
          <h3 className="text-white font-bold mb-4">📊 Status</h3>
          <div className="bg-[rgba(0,0,0,0.5)] p-4 rounded text-[#aaa] font-mono text-sm overflow-auto max-h-96">
            <div>Total de processos: <span className="text-[#ffc800]">{processos.length}</span></div>
            {processos.length === 0 ? (
              <div className="text-red-400 mt-4">❌ NENHUM PROCESSO CARREGADO!</div>
            ) : (
              <>
                <div className="text-green-400 mt-2">✅ {processos.length} processos carregados</div>
                <div className="mt-4 text-[#888]">Tipo: {typeof processos[0]}</div>
                <div className="mt-2 text-[#888]">Chaves: {Object.keys(processos[0] || {}).join(", ")}</div>
              </>
            )}
          </div>
        </div>

        {/* PRIMEIRA AMOSTRA */}
        {processos.length > 0 && (
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5">
            <h3 className="text-white font-bold mb-4">🔍 Primeira Amostra</h3>
            <div className="bg-[rgba(0,0,0,0.5)] p-4 rounded text-[#aaa] font-mono text-xs overflow-auto max-h-96">
              <pre>{JSON.stringify(processos[0], null, 2)}</pre>
            </div>
          </div>
        )}

        {/* RESUMO DE ROTAS */}
        {processos.length > 0 && (
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5">
            <h3 className="text-white font-bold mb-4">✈️ Rotas Encontradas</h3>
            <div className="bg-[rgba(0,0,0,0.5)] p-4 rounded text-[#aaa] font-mono text-sm overflow-auto max-h-96">
              {Array.from(new Set(processos.map(p => `${p.shipment?.aeroporto_origem || "?"} → ${p.shipment?.aeroporto_destino || "?"}`))).slice(0, 10).map((r, i) => (
                <div key={i}>{r}</div>
              ))}
            </div>
          </div>
        )}

        {/* RESUMO DE CLIENTES */}
        {processos.length > 0 && (
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5">
            <h3 className="text-white font-bold mb-4">👥 Clientes</h3>
            <div className="bg-[rgba(0,0,0,0.5)] p-4 rounded text-[#aaa] font-mono text-sm overflow-auto max-h-96">
              {Array.from(new Set(processos.map(p => p.shipment?.cliente || "N/A"))).slice(0, 10).map((c, i) => (
                <div key={i}>• {c}</div>
              ))}
            </div>
          </div>
        )}

        {/* RESUMO DE STATUS */}
        {processos.length > 0 && (
          <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5">
            <h3 className="text-white font-bold mb-4">📋 Status CCT</h3>
            <div className="bg-[rgba(0,0,0,0.5)] p-4 rounded text-[#aaa] font-mono text-sm overflow-auto max-h-96">
              {Object.entries(
                processos.reduce((acc: any, p) => {
                  const s = p.status_atual?.status_cct_oficial || "DESCONHECIDO";
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {})
              ).map(([status, count], i) => (
                <div key={i}>{status}: <span className="text-[#ffc800]">{count}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
