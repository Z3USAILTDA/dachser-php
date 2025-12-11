import { PageLayout } from "@/components/cct/PageLayout";
import { BookOpen } from "lucide-react";

export default function ManualUsuario() {
  return (
    <PageLayout title="DACHSER" subtitle="Manual do Usuário — CCT v2.0">
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="h-5 w-5 text-[#ffc800]" />
          <h2 className="text-lg font-semibold text-[#f5f5f5]">O que é o CCT?</h2>
        </div>
        <p className="text-[#aaaaaa] leading-relaxed">
          A Central de Controle de Cargas (CCT) é uma plataforma para monitoramento em tempo real 
          de processos de importação aérea, integrando dados do MariaDB e API LeadComex.
        </p>
      </div>
    </PageLayout>
  );
}
