import { PageLayout } from "@/components/cct/PageLayout";
import { Server } from "lucide-react";

export default function ConsoleTecnico() {
  return (
    <PageLayout title="DACHSER" subtitle="Console Técnico — Monitoramento de Sistema">
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-10 text-center shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <Server className="h-12 w-12 text-[#aaaaaa] mx-auto mb-4" />
        <p className="text-[#aaaaaa]">Console técnico em desenvolvimento</p>
      </div>
    </PageLayout>
  );
}
