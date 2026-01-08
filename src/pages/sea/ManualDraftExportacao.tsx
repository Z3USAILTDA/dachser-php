import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Ship, 
  Database, 
  Search,
  HelpCircle, 
  BookText,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  MapPin,
  Calendar,
  FileSpreadsheet,
  AlertTriangle,
  Clock
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
  { id: 'grid-dados', title: 'Grid de Dados', icon: <Database className="h-4 w-4" /> },
  { id: 'tracker', title: 'Tracker Hapag', icon: <Search className="h-4 w-4" /> },
  { id: 'status', title: 'Status e Eventos', icon: <Clock className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'O que é o Status Doc Exportação?', 
    a: 'É uma tela para monitorar o status dos documentos de exportação marítima, incluindo tracking de containers e sincronização com armadores.' 
  },
  { 
    q: 'Como atualizar os dados?', 
    a: 'Clique no botão "Atualizar" no topo da página para sincronizar com as fontes de dados.' 
  },
  { 
    q: 'Quem tem acesso a esta tela?', 
    a: 'Apenas usuários com permissão de administrador podem acessar esta funcionalidade.' 
  },
  { 
    q: 'O que é o Tracker Hapag?', 
    a: 'É uma ferramenta que permite consultar o status de containers diretamente na API da Hapag-Lloyd.' 
  },
  { 
    q: 'Como filtrar por status?', 
    a: 'Use os cards de KPI no topo para filtrar rapidamente por status como "Tracking", "Sem Booking" ou "Concluído".' 
  },
];

const glossaryItems = [
  { term: 'BL', definition: 'Bill of Lading - Conhecimento de embarque marítimo.' },
  { term: 'Booking', definition: 'Reserva de espaço no navio para transporte de carga.' },
  { term: 'Container', definition: 'Unidade de carga padronizada para transporte marítimo.' },
  { term: 'ETD', definition: 'Estimated Time of Departure - Data prevista de partida.' },
  { term: 'ETA', definition: 'Estimated Time of Arrival - Data prevista de chegada.' },
  { term: 'POL', definition: 'Port of Loading - Porto de embarque.' },
  { term: 'POD', definition: 'Port of Discharge - Porto de desembarque.' },
  { term: 'Vessel', definition: 'Navio utilizado para o transporte.' },
];

export default function ManualDraftExportacao() {
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
    <PageLayout title="DACHSER" subtitle="Manual — Status Doc Exportação v1.0" backTo="/sea/draft-exportacao" pageIcon={BookOpen}>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
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
                  A tela <strong className="text-amber-300">Status Doc Exportação</strong> é uma central de monitoramento 
                  para documentos de exportação marítima. Ela permite visualizar, rastrear e gerenciar todos os processos 
                  de exportação com integração direta aos sistemas dos armadores.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Database className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Grid de Dados</h4>
                    <p className="text-xs text-white/60">Visualize todos os processos de exportação em uma tabela interativa</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Search className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Tracker</h4>
                    <p className="text-xs text-white/60">Consulte status de containers diretamente nos armadores</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-amber-300 font-medium mb-1">Acesso Restrito</h4>
                      <p className="text-sm text-white/70">
                        Esta funcionalidade está disponível apenas para usuários administradores.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Grid de Dados */}
          <section ref={el => sectionRefs.current['grid-dados'] = el} id="grid-dados">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Database className="h-5 w-5 text-amber-400" />
                  Grid de Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O Grid de Dados apresenta todos os processos de exportação em uma tabela organizada com as seguintes funcionalidades:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong className="text-white">Filtros por Status</strong> - Use os cards de KPI para filtrar rapidamente</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong className="text-white">Busca</strong> - Pesquise por BL, container, cliente ou navio</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong className="text-white">Ordenação</strong> - Clique nas colunas para ordenar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong className="text-white">Paginação</strong> - Navegue entre páginas de resultados</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong className="text-white">Detalhes</strong> - Clique em uma linha para ver eventos e timeline</span>
                  </li>
                </ul>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20 text-center">
                    <Badge className="bg-blue-500">Tracking</Badge>
                    <p className="text-xs text-white/60 mt-1">Em rastreamento</p>
                  </div>
                  <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/20 text-center">
                    <Badge className="bg-yellow-500">Sem Booking</Badge>
                    <p className="text-xs text-white/60 mt-1">Pendente reserva</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20 text-center">
                    <Badge className="bg-green-500">Concluído</Badge>
                    <p className="text-xs text-white/60 mt-1">Processo finalizado</p>
                  </div>
                  <div className="p-3 rounded bg-gray-500/10 border border-gray-500/20 text-center">
                    <Badge className="bg-gray-500">Outros</Badge>
                    <p className="text-xs text-white/60 mt-1">Demais status</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tracker */}
          <section ref={el => sectionRefs.current['tracker'] = el} id="tracker">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Search className="h-5 w-5 text-amber-400" />
                  Tracker Hapag
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O Tracker permite consultar o status de containers diretamente na API da Hapag-Lloyd em tempo real.
                </p>

                <div className="space-y-2">
                  {[
                    'Acesse a aba "Tracker" na navegação',
                    'Informe o número do BL ou Container',
                    'Clique em "Buscar" para consultar',
                    'Visualize os eventos e status atualizados',
                    'Os dados são salvos automaticamente no sistema'
                  ].map((etapa, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{etapa}</span>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-4">
                  <div className="flex items-start gap-3">
                    <Ship className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-blue-300 font-medium mb-1">Integração Hapag-Lloyd</h4>
                      <p className="text-sm text-white/70">
                        A consulta é feita diretamente na API oficial da Hapag-Lloyd, garantindo dados atualizados em tempo real.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Status e Eventos */}
          <section ref={el => sectionRefs.current['status'] = el} id="status">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-400" />
                  Status e Eventos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Cada processo possui uma timeline de eventos que mostra a progressão do transporte:
                </p>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded bg-white/5 border border-white/10">
                    <MapPin className="h-5 w-5 text-green-400" />
                    <div>
                      <h4 className="text-white font-medium">Gate In</h4>
                      <p className="text-xs text-white/60">Container entrou no terminal de origem</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded bg-white/5 border border-white/10">
                    <Ship className="h-5 w-5 text-blue-400" />
                    <div>
                      <h4 className="text-white font-medium">Loaded</h4>
                      <p className="text-xs text-white/60">Container carregado no navio</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded bg-white/5 border border-white/10">
                    <Calendar className="h-5 w-5 text-amber-400" />
                    <div>
                      <h4 className="text-white font-medium">Departed</h4>
                      <p className="text-xs text-white/60">Navio partiu do porto de origem</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded bg-white/5 border border-white/10">
                    <MapPin className="h-5 w-5 text-purple-400" />
                    <div>
                      <h4 className="text-white font-medium">Arrived</h4>
                      <p className="text-xs text-white/60">Navio chegou ao porto de destino</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded bg-white/5 border border-white/10">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    <div>
                      <h4 className="text-white font-medium">Discharged</h4>
                      <p className="text-xs text-white/60">Container descarregado do navio</p>
                    </div>
                  </div>
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
