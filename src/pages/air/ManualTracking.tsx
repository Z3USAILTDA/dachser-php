import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Plane, 
  Search as SearchIcon, 
  RefreshCw, 
  AlertTriangle, 
  HelpCircle, 
  BookText,
  ChevronRight,
  CheckCircle2,
  Filter,
  ExternalLink
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
}

const sections: Section[] = [
  { id: 'visao-geral', title: 'Visão Geral', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'cards-resumo', title: 'Cards de Resumo', icon: <Filter className="h-4 w-4" /> },
  { id: 'tabela-awbs', title: 'Tabela de AWBs', icon: <Plane className="h-4 w-4" /> },
  { id: 'filtros-busca', title: 'Filtros e Busca', icon: <SearchIcon className="h-4 w-4" /> },
  { id: 'atualizacao', title: 'Atualização', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como os dados são atualizados?', 
    a: 'O sistema sincroniza automaticamente com as APIs de rastreamento a cada 30 segundos. Você pode forçar uma atualização clicando no botão "Atualizar".' 
  },
  { 
    q: 'O que significam os cards coloridos?', 
    a: 'Cada card representa um status: Total de AWBs, Em trânsito (azul), Em alerta (vermelho), e Entregues (verde). Clique em um card para filtrar a tabela.' 
  },
  { 
    q: 'Como filtrar por companhia aérea?', 
    a: 'Use o seletor de companhia aérea acima da tabela para filtrar AWBs de uma companhia específica.' 
  },
  { 
    q: 'O que fazer quando o status está como "Aguardando Consulta"?', 
    a: 'Isso significa que o AWB ainda não foi processado. Clique em "Atualizar" para iniciar o rastreamento.' 
  },
  { 
    q: 'Como ver detalhes no site da companhia?', 
    a: 'Clique no ícone de link externo ao lado do AWB para abrir o rastreamento no site oficial da companhia aérea.' 
  },
  { 
    q: 'O que é a timeline na tabela?', 
    a: 'A timeline visual mostra o progresso do transporte: BKD (reserva) → RCF (recebimento) → MAN (manifestado) → DEP (partida) → ARR (chegada).' 
  },
];

const glossaryItems = [
  { term: 'AWB', definition: 'Air Waybill - Conhecimento de transporte aéreo que acompanha a mercadoria.' },
  { term: 'HAWB', definition: 'House Air Waybill - AWB emitido pelo agente de carga para o importador.' },
  { term: 'MAWB', definition: 'Master Air Waybill - AWB principal emitido pela companhia aérea.' },
  { term: 'BKD', definition: 'Booked - Reserva confirmada para embarque.' },
  { term: 'RCF', definition: 'Received from Flight - Carga recebida do voo no terminal.' },
  { term: 'MAN', definition: 'Manifested - Carga manifestada para o voo.' },
  { term: 'DEP', definition: 'Departed - Status indicando que a carga decolou do aeroporto.' },
  { term: 'ARR', definition: 'Arrived - Status indicando que a carga chegou ao aeroporto.' },
  { term: 'NFD', definition: 'Notified - Consignatário notificado sobre chegada da carga.' },
  { term: 'DLV', definition: 'Delivered - Carga entregue ao destinatário final.' },
  { term: 'FOH', definition: 'Freight on Hand - Carga disponível no terminal para retirada.' },
];

export default function ManualTracking() {
  const [activeSection, setActiveSection] = useState('visao-geral');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSticky, setIsSticky] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarPlaceholderRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const handleScroll = () => {
      if (sidebarPlaceholderRef.current) {
        const rect = sidebarPlaceholderRef.current.getBoundingClientRect();
        setIsSticky(rect.top < 24);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredFaq = faqItems.filter(item => 
    item.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.a.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGlossary = glossaryItems.filter(item =>
    item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageLayout title="DACHSER" subtitle="Manual — Tracking Aéreo v1.0" backTo="/air/tracking" pageIcon={BookOpen}>
      <div className="flex gap-6 items-start">
        {/* Sidebar Navigation */}
        <div ref={sidebarPlaceholderRef} className="w-64 shrink-0">
          <div 
            ref={sidebarRef}
            className={cn(
              "w-64 transition-all duration-200",
              isSticky ? "fixed top-6 z-40" : "relative"
            )}
          >
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12 max-h-[calc(100vh-4rem)] overflow-y-auto">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-400" />
                  Conteúdo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <nav className="space-y-1 pb-4">
                  {sections.map(section => (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors",
                        activeSection === section.id 
                          ? "bg-amber-500/20 text-amber-300 border-l-2 border-amber-400" 
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {section.icon}
                      {section.title}
                      {activeSection === section.id && <ChevronRight className="h-3 w-3 ml-auto" />}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 space-y-8">
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar no manual..."
              className="pl-9 bg-white/5 border-white/12 text-white"
            />
          </div>

          {/* Visão Geral */}
          <section ref={el => sectionRefs.current['visao-geral'] = el} id="visao-geral">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-amber-400" />
                  Visão Geral
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tela de <strong className="text-amber-300">Tracking Aéreo</strong> é a central de 
                  monitoramento de cargas aéreas, exibindo em tempo real o status de todos os AWBs 
                  cadastrados no sistema.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Plane className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Visualização</h4>
                    <p className="text-xs text-white/60">Acompanhe AWBs em tempo real</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Filter className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Filtros</h4>
                    <p className="text-xs text-white/60">Filtre por status e companhia</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <ExternalLink className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Links Externos</h4>
                    <p className="text-xs text-white/60">Acesso direto às companhias</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Cards de Resumo */}
          <section ref={el => sectionRefs.current['cards-resumo'] = el} id="cards-resumo">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Filter className="h-5 w-5 text-amber-400" />
                  Cards de Resumo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  No topo da tela, quatro cards apresentam um resumo rápido do status de todas as cargas:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <Badge className="bg-gray-500 mb-2">TOTAL</Badge>
                    <p className="text-xs text-white/60">Quantidade total de AWBs em monitoramento</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">EM TRÂNSITO</Badge>
                    <p className="text-xs text-white/60">AWBs que estão em movimento (DEP, ARR)</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge className="bg-red-500 mb-2">EM ALERTA</Badge>
                    <p className="text-xs text-white/60">AWBs com atrasos ou problemas</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge className="bg-green-500 mb-2">ENTREGUES</Badge>
                    <p className="text-xs text-white/60">AWBs já entregues ao destinatário</p>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-300">
                    <strong>Dica:</strong> Clique em qualquer card para filtrar a tabela e ver apenas 
                    os AWBs daquela categoria.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tabela de AWBs */}
          <section ref={el => sectionRefs.current['tabela-awbs'] = el} id="tabela-awbs">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Plane className="h-5 w-5 text-amber-400" />
                  Tabela de AWBs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tabela principal exibe todos os AWBs com as seguintes informações:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>AWB/HAWB:</strong> Número do conhecimento aéreo (master e house)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Cliente:</strong> Nome do destinatário da carga</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Analista:</strong> Responsável pelo processo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Origem/Destino:</strong> Aeroportos de partida e chegada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Status:</strong> Último status reportado pela companhia</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Timeline:</strong> Visualização gráfica do progresso (BKD → RCF → MAN → DEP → ARR)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Última Atualização:</strong> Data/hora da última verificação</span>
                  </li>
                </ul>

                <h4 className="text-white font-medium mt-4">Ações Disponíveis</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <span>Clique no ícone de link para abrir o rastreamento no site da companhia aérea</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Filtros e Busca */}
          <section ref={el => sectionRefs.current['filtros-busca'] = el} id="filtros-busca">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <SearchIcon className="h-5 w-5 text-amber-400" />
                  Filtros e Busca
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Utilize os filtros disponíveis para encontrar AWBs específicos:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Campo de Busca:</strong> Digite AWB, HAWB, cliente ou analista</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Filtro por Companhia:</strong> Selecione uma companhia aérea específica</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Filtro por Analista:</strong> Filtre por responsável do processo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Cards de Status:</strong> Clique nos cards para filtrar por status</span>
                  </li>
                </ul>

                <h4 className="text-white font-medium mt-4">Ordenação</h4>
                <p className="text-sm">
                  Clique no cabeçalho de qualquer coluna para ordenar a tabela por aquele campo. 
                  Clique novamente para inverter a ordem.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Atualização */}
          <section ref={el => sectionRefs.current['atualizacao'] = el} id="atualizacao">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-amber-400" />
                  Atualização
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Os dados são atualizados de duas formas:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Automática:</strong> O sistema sincroniza a cada 30 segundos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Manual:</strong> Clique no botão "Atualizar" para forçar uma sincronização imediata</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    <strong>Importante:</strong> O botão "Atualizar" processa todos os AWBs pendentes 
                    e consulta as APIs das companhias aéreas para obter os status mais recentes.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* FAQ */}
          <section ref={el => sectionRefs.current['faq'] = el} id="faq">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-amber-400" />
                  Perguntas Frequentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredFaq.length === 0 ? (
                  <p className="text-white/60 text-sm">Nenhuma pergunta encontrada para "{searchTerm}"</p>
                ) : (
                  <div className="space-y-3">
                    {filteredFaq.map((item, i) => (
                      <div key={i} className="p-4 rounded-lg bg-white/5 border border-white/10">
                        <h4 className="text-white font-medium mb-2 flex items-start gap-2">
                          <span className="text-amber-400">Q:</span>
                          {item.q}
                        </h4>
                        <p className="text-white/70 text-sm pl-5">{item.a}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Glossário */}
          <section ref={el => sectionRefs.current['glossario'] = el} id="glossario">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BookText className="h-5 w-5 text-amber-400" />
                  Glossário
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredGlossary.length === 0 ? (
                  <p className="text-white/60 text-sm">Nenhum termo encontrado para "{searchTerm}"</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredGlossary.map((item, i) => (
                      <div key={i} className="p-3 rounded bg-white/5 border border-white/10">
                        <Badge className="bg-amber-500/80 mb-2">{item.term}</Badge>
                        <p className="text-xs text-white/70">{item.definition}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </PageLayout>
  );
}
