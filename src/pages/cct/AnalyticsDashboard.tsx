import { PageLayout } from "@/components/cct/PageLayout";
import { BarChart3 } from "lucide-react";

export default function AnalyticsDashboard() {
  return (
    <PageLayout title="DACHSER" subtitle="Analytics CCT — Indicadores e Performance">
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-10 text-center shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <BarChart3 className="h-12 w-12 text-[#aaaaaa] mx-auto mb-4" />
        <p className="text-[#aaaaaa]">Dashboard de analytics em desenvolvimento</p>
      </div>
    </PageLayout>
  );
}
