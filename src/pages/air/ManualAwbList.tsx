import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Search as SearchIcon, 
  Package, 
  Filter, 
  Download, 
  Eye, 
  HelpCircle, 
  BookText,
  ChevronRight,
  CheckCircle2,
  Table as TableIcon
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
  { id: 'tabela', title: 'Tabela de AWBs', icon: <TableIcon className="h-4 w-4" /> },
  { id: 'filtros', title: 'Filtros', icon: <Filter className="h-4 w-4" /> },
  { id: 'detalhes', title: 'Visualizar Detalhes', icon: <Eye className="h-4 w-4" /> },
  { id: 'exportacao', title: 'Exportação', icon: <Download className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Qual a diferença entre esta tela e o Tracking Aéreo?', 
    a: 'Esta tela apresenta uma visão tabular completa de todos os AWBs. O Tracking Aéreo foca em monitoramento com timeline de eventos.' 
  },
  { 
    q: 'Como filtrar AWBs por status?', 
    a: 'Use o campo de busca ou o seletor de status para filtrar. Você pode combinar múltiplos filtros.' 
  },
  { 
    q: 'Posso exportar os dados?', 
    a: 'Sim, clique no botão "Exportar" para gerar um arquivo Excel com os dados filtrados.' 
  },
  { 
    q: 'Como ver detalhes de um AWB específico?', 
    a: 'Clique em qualquer linha da tabela para ver os detalhes completos e o histórico de eventos.' 
  },
  { 
    q: 'Os dados são atualizados automaticamente?', 
    a: 'Sim, a lista é atualizada a cada 30 segundos automaticamente.' 
  },
];

const glossaryItems = [
  { term: 'AWB', definition: 'Air Waybill - Conhecimento de transporte aéreo.' },
  { term: 'Consignatário', definition: 'Destinatário da carga, empresa ou pessoa que recebe.' },
  { term: 'Status', definition: 'Estado atual do AWB no processo de transporte.' },
  { term: 'Origem', definition: 'Aeroporto de onde a carga partiu.' },
  { term: 'Destino', definition: 'Aeroporto de chegada da carga.' },
];

export default function ManualAwbList() {
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
    <PageLayout title="DACHSER" subtitle="Manual — Lista de AWBs v1.0" backTo="/air/awb-list" pageIcon={BookOpen}>
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
                  A tela <strong className="text-amber-300">Lista de AWBs</strong> apresenta uma visão 
                  tabular completa de todos os AWBs cadastrados no sistema, com opções avançadas de 
                  filtro e exportação.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Package className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Visualização</h4>
                    <p className="text-xs text-white/60">Tabela com todos os AWBs</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Filter className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Filtros</h4>
                    <p className="text-xs text-white/60">Busca e filtros avançados</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Download className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Exportação</h4>
                    <p className="text-xs text-white/60">Exporte para Excel</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tabela de AWBs */}
          <section ref={el => sectionRefs.current['tabela'] = el} id="tabela">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TableIcon className="h-5 w-5 text-amber-400" />
                  Tabela de AWBs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tabela principal exibe as seguintes colunas:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>AWB:</strong> Número do conhecimento aéreo (clicável)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Cia Aérea:</strong> Código da companhia aérea</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Consignatário:</strong> Nome do destinatário</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Último Evento:</strong> Descrição do último status</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Status:</strong> Estado atual com indicador colorido</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Data:</strong> Data/hora da última atualização</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-300">
                    <strong>Dica:</strong> Clique em qualquer linha para navegar para os detalhes do AWB 
                    na tela de Tracking Aéreo.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Filtros */}
          <section ref={el => sectionRefs.current['filtros'] = el} id="filtros">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Filter className="h-5 w-5 text-amber-400" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Use os filtros para encontrar AWBs específicos:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Busca por texto:</strong> AWB, destinatário ou status</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Filtro por status:</strong> Selecione um ou mais status</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    <strong>Nota:</strong> Os filtros são aplicados em tempo real. Pressione Enter 
                    ou aguarde a busca automática.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Visualizar Detalhes */}
          <section ref={el => sectionRefs.current['detalhes'] = el} id="detalhes">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Eye className="h-5 w-5 text-amber-400" />
                  Visualizar Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Ao clicar em uma linha da tabela, você é redirecionado para a tela de Tracking Aéreo 
                  com o AWB selecionado, onde pode ver:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Histórico completo de eventos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Timeline visual do transporte</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Dados detalhados do AWB</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Configurações de notificação</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Exportação */}
          <section ref={el => sectionRefs.current['exportacao'] = el} id="exportacao">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Download className="h-5 w-5 text-amber-400" />
                  Exportação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Exporte os dados da tabela para análise externa:
                </p>

                <div className="space-y-2">
                  {[
                    'Aplique os filtros desejados',
                    'Clique no botão "Exportar"',
                    'Escolha o formato (Excel)',
                    'O arquivo será baixado automaticamente'
                  ].map((etapa, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{etapa}</span>
                    </div>
                  ))}
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
                  <p className="text-white/60 text-sm">Nenhuma pergunta encontrada.</p>
                ) : (
                  filteredFaq.map((item, i) => (
                    <div key={i} className="p-4 rounded bg-white/5 border border-white/10">
                      <p className="text-white font-medium mb-2">{item.q}</p>
                      <p className="text-white/70 text-sm">{item.a}</p>
                    </div>
                  ))
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
                  <p className="text-white/60 text-sm">Nenhum termo encontrado.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredGlossary.map((item, i) => (
                      <div key={i} className="p-3 rounded bg-white/5 border border-white/10">
                        <Badge className="bg-amber-500/20 text-amber-300 mb-2">{item.term}</Badge>
                        <p className="text-white/70 text-sm">{item.definition}</p>
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
