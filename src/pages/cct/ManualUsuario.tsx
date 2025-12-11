import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft } from "lucide-react";

export default function ManualUsuario() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] via-[#0d1f3c] to-[#0a1628]">
      <header className="sticky top-0 z-50 bg-[#0a1628]/95 backdrop-blur-sm border-b border-gray-700/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/air/cct">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Sistema
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-white">Manual do Usuário</h1>
            </div>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/30">CCT DACHSER v2.0</Badge>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card className="bg-black/40 border-gray-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">O que é o CCT?</h2>
          <p className="text-gray-300 leading-relaxed">
            A Central de Controle de Cargas (CCT) é uma plataforma para monitoramento em tempo real 
            de processos de importação aérea, integrando dados do MariaDB e API LeadComex.
          </p>
        </Card>
      </main>
    </div>
  );
}
