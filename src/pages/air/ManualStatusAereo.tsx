import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Search as SearchIcon, 
  RefreshCw, 
  Activity, 
  AlertTriangle, 
  HelpCircle, 
  BookText,
  ChevronRight,
  CheckCircle2,
  Clock,
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
  { id: 'tabela-status', title: 'Tabela de Status', icon: <TableIcon className="h-4 w-4" /> },
  { id: 'status-tipos', title: 'Tipos de Status', icon: <Activity className="h-4 w-4" /> },
  { id: 'alertas', title: 'Alertas', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'atualizacao', title: 'Atualização', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'O que é a tabela t_status_aereo?', 
    a: 'É a tabela principal do banco de dados que armazena todos os status de AWBs monitorados pelo sistema.' 
  },
  { 
    q: 'Com que frequência os dados são atualizados?', 
    a: 'A tela atualiza automaticamente a cada 30 segundos. Você também pode buscar manualmente.' 
  },
  { 
    q: 'O que significa cada status?', 
    a: 'Cada status representa uma etapa do transporte aéreo. Veja a seção "Tipos de Status" para detalhes.' 
  },
  { 
    q: 'Como buscar um AWB específico?', 
    a: 'Use o campo de busca no topo da página. Você pode buscar por AWB, destinatário ou status.' 
  },
  { 
    q: 'Posso exportar estes dados?', 
    a: 'Use a tela "Lista de AWBs" para opções de exportação mais completas.' 
  },
];

const glossaryItems = [
  { term: 'PENDING', definition: 'AWB aguardando primeira consulta ou atualização.' },
  { term: 'IN_TRANSIT', definition: 'Carga em trânsito entre origem e destino.' },
  { term: 'ARRIVED', definition: 'Carga chegou ao aeroporto de destino.' },
  { term: 'DELIVERED', definition: 'Carga entregue ao destinatário final.' },
  { term: 'EXCEPTION', definition: 'Ocorreu uma exceção no transporte.' },
  { term: 'NOT_FOUND', definition: 'AWB não encontrado no sistema da companhia.' },
];

export default function ManualStatusAereo() {
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
    <PageLayout title="DACHSER" subtitle="Manual — Status Aéreo v1.0" backTo="/air/status-aereo" pageIcon={BookOpen}>
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
                  A tela <strong className="text-amber-300">Status Aéreo</strong> exibe os dados brutos 
                  da tabela t_status_aereo do banco de dados, mostrando todos os AWBs monitorados e seus 
                  status atuais.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Activity className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Monitoramento</h4>
                    <p className="text-xs text-white/60">Status em tempo real</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Clock className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Atualização</h4>
                    <p className="text-xs text-white/60">Dados a cada 30 segundos</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <SearchIcon className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Busca</h4>
                    <p className="text-xs text-white/60">Filtros avançados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tabela de Status */}
          <section ref={el => sectionRefs.current['tabela-status'] = el} id="tabela-status">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TableIcon className="h-5 w-5 text-amber-400" />
                  Tabela de Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tabela exibe os dados diretamente do banco:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>AWB:</strong> Número do conhecimento aéreo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Origem:</strong> Aeroporto de origem</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Destino:</strong> Aeroporto de destino</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Destinatário:</strong> Nome do consignatário</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Último Status:</strong> Status mais recente</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Última Atualização:</strong> Data/hora do último update</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Tipos de Status */}
          <section ref={el => sectionRefs.current['status-tipos'] = el} id="status-tipos">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-amber-400" />
                  Tipos de Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Os principais status que você encontrará:
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-gray-500/10 border border-gray-500/20">
                    <Badge className="bg-gray-500 mb-2">PENDING</Badge>
                    <p className="text-xs text-white/60">Aguardando consulta</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">IN_TRANSIT</Badge>
                    <p className="text-xs text-white/60">Em trânsito</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <Badge className="bg-purple-500 mb-2">ARRIVED</Badge>
                    <p className="text-xs text-white/60">Chegou ao destino</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge className="bg-green-500 mb-2">DELIVERED</Badge>
                    <p className="text-xs text-white/60">Entregue</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">EXCEPTION</Badge>
                    <p className="text-xs text-white/60">Exceção</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge className="bg-red-500 mb-2">NOT_FOUND</Badge>
                    <p className="text-xs text-white/60">Não encontrado</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Alertas */}
          <section ref={el => sectionRefs.current['alertas'] = el} id="alertas">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Alertas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tela indica visualmente situações que requerem atenção:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <span><strong>NOT_FOUND:</strong> AWB não encontrado - verifique o número</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <span><strong>EXCEPTION:</strong> Ocorreu um problema no transporte</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                    <span><strong>Sem atualização:</strong> AWB sem updates há muito tempo</span>
                  </li>
                </ul>
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
                  Os dados são atualizados de forma automática e manual:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm font-medium text-white">Automático</p>
                    <p className="text-xs text-white/60">A tela atualiza a cada 30 segundos</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <p className="text-sm font-medium text-white">Manual</p>
                    <p className="text-xs text-white/60">Use a busca para forçar atualização</p>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    <strong>Nota:</strong> A sincronização com as APIs das companhias aéreas ocorre 
                    em background, independente desta tela.
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
