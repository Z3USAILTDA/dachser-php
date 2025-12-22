import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Plane, 
  Search as SearchIcon, 
  RefreshCw, 
  Mail, 
  AlertTriangle, 
  HelpCircle, 
  BookText,
  ChevronRight,
  CheckCircle2,
  Database,
  Clock,
  Package
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
  { id: 'tracking', title: 'Tracking Aéreo', icon: <Plane className="h-4 w-4" /> },
  { id: 'check-awb', title: 'Check AWB', icon: <SearchIcon className="h-4 w-4" /> },
  { id: 'lista-awbs', title: 'Lista de AWBs', icon: <Package className="h-4 w-4" /> },
  { id: 'status', title: 'Status Aéreo', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'notificacoes', title: 'Notificações', icon: <Mail className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como adicionar um novo AWB para rastreamento?', 
    a: 'Na tela de Tracking Aéreo, clique em "+ Novo AWB", preencha o número do AWB e os dados do processo, então clique em "Adicionar".' 
  },
  { 
    q: 'Com que frequência os dados são atualizados?', 
    a: 'O sistema sincroniza automaticamente com as APIs de rastreamento a cada 5 minutos. Você pode forçar uma atualização clicando no botão de refresh.' 
  },
  { 
    q: 'Como configurar notificações por email?', 
    a: 'Na tela de Tracking, clique no ícone de email ao lado do AWB e adicione os endereços que devem receber atualizações de status.' 
  },
  { 
    q: 'O que fazer quando o AWB não é encontrado?', 
    a: 'Verifique se o número está correto (11 dígitos). Se persistir, o AWB pode ainda não estar no sistema da companhia aérea.' 
  },
  { 
    q: 'Como interpretar os status de rastreamento?', 
    a: 'DEP indica decolagem, ARR indica chegada, RCF indica recebimento, DLV indica entrega. Veja o glossário para mais detalhes.' 
  },
  { 
    q: 'Posso rastrear múltiplos AWBs simultaneamente?', 
    a: 'Sim, você pode adicionar quantos AWBs desejar. O sistema processa em lote e atualiza todos automaticamente.' 
  },
];

const glossaryItems = [
  { term: 'AWB', definition: 'Air Waybill - Conhecimento de transporte aéreo que acompanha a mercadoria.' },
  { term: 'HAWB', definition: 'House Air Waybill - AWB emitido pelo agente de carga para o importador.' },
  { term: 'MAWB', definition: 'Master Air Waybill - AWB principal emitido pela companhia aérea.' },
  { term: 'DEP', definition: 'Departed - Status indicando que a carga decolou do aeroporto.' },
  { term: 'ARR', definition: 'Arrived - Status indicando que a carga chegou ao aeroporto.' },
  { term: 'RCF', definition: 'Received from Flight - Carga recebida do voo no terminal.' },
  { term: 'NFD', definition: 'Notified - Consignatário notificado sobre chegada da carga.' },
  { term: 'DLV', definition: 'Delivered - Carga entregue ao destinatário final.' },
  { term: 'BKD', definition: 'Booked - Reserva confirmada para embarque.' },
  { term: 'FOH', definition: 'Freight on Hand - Carga disponível no terminal para retirada.' },
];

export default function ManualAir() {
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
    <PageLayout title="DACHSER" subtitle="Manual do Usuário — Tracking Aéreo v1.0" backTo="/air/tracking" pageIcon={BookOpen}>
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
                  O módulo <strong className="text-amber-300">Tracking Aéreo</strong> permite o rastreamento 
                  em tempo real de cargas aéreas, integrando dados de múltiplas companhias aéreas e sistemas 
                  de rastreamento para fornecer visibilidade completa do transporte.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Plane className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Rastreamento</h4>
                    <p className="text-xs text-white/60">Acompanhe AWBs em tempo real</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Mail className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Notificações</h4>
                    <p className="text-xs text-white/60">Alertas automáticos por email</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Database className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Integração</h4>
                    <p className="text-xs text-white/60">Sincronização com sistemas externos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tracking Aéreo */}
          <section ref={el => sectionRefs.current['tracking'] = el} id="tracking">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Plane className="h-5 w-5 text-amber-400" />
                  Tracking Aéreo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tela principal de tracking exibe todos os AWBs em monitoramento, com status atualizado 
                  e histórico de eventos. Permite adicionar novos AWBs e gerenciar notificações.
                </p>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Adicionar AWBs para monitoramento</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Visualizar histórico de eventos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Configurar emails para notificações</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Forçar atualização manual de status</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Filtrar por status, cliente e período</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Check AWB */}
          <section ref={el => sectionRefs.current['check-awb'] = el} id="check-awb">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <SearchIcon className="h-5 w-5 text-amber-400" />
                  Check AWB
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tela de Check AWB permite consultar rapidamente o status de um AWB específico, 
                  sem necessidade de adicioná-lo ao monitoramento permanente.
                </p>

                <h4 className="text-white font-medium mt-4">Como Usar</h4>
                <div className="space-y-2">
                  {['1. Digite o número do AWB (11 dígitos)', '2. Clique em "Consultar"', '3. Visualize o status e histórico', '4. Opcionalmente, adicione ao monitoramento'].map((etapa, i) => (
                    <div key={etapa} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{etapa.split('. ')[1]}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Lista de AWBs */}
          <section ref={el => sectionRefs.current['lista-awbs'] = el} id="lista-awbs">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Package className="h-5 w-5 text-amber-400" />
                  Lista de AWBs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Visualize todos os AWBs cadastrados no sistema em formato de tabela, 
                  com filtros avançados e opções de exportação.
                </p>

                <h4 className="text-white font-medium mt-4">Diferença do Tracking</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm font-medium text-white">Lista de AWBs</p>
                    <p className="text-xs text-white/60">Visão tabular com dados completos, filtros e exportação</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <p className="text-sm font-medium text-white">Tracking Aéreo</p>
                    <p className="text-xs text-white/60">Foco em monitoramento e timeline de eventos</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Filtros por cliente, status, período</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Ordenação por qualquer coluna</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Exportação para Excel</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Ações em lote</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Status Aéreo */}
          <section ref={el => sectionRefs.current['status'] = el} id="status">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-amber-400" />
                  Status Aéreo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Visualize uma lista consolidada de todos os status de AWBs monitorados, 
                  com indicadores visuais de progresso e alertas de exceção.
                </p>

                <h4 className="text-white font-medium mt-4">Status Principais</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">BKD</Badge>
                    <p className="text-xs text-white/60">Reserva confirmada</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">DEP</Badge>
                    <p className="text-xs text-white/60">Em voo</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <Badge className="bg-purple-500 mb-2">ARR</Badge>
                    <p className="text-xs text-white/60">Chegou ao destino</p>
                  </div>
                  <div className="p-3 rounded bg-cyan-500/10 border border-cyan-500/20">
                    <Badge className="bg-cyan-500 mb-2">RCF</Badge>
                    <p className="text-xs text-white/60">Recebido do voo</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge className="bg-green-500 mb-2">DLV</Badge>
                    <p className="text-xs text-white/60">Entregue</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge className="bg-red-500 mb-2">DIS</Badge>
                    <p className="text-xs text-white/60">Discrepância</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Notificações */}
          <section ref={el => sectionRefs.current['notificacoes'] = el} id="notificacoes">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-amber-400" />
                  Notificações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Configure notificações automáticas por email para receber atualizações de status 
                  dos AWBs monitorados. Cada AWB pode ter seus próprios destinatários.
                </p>

                <h4 className="text-white font-medium mt-4">Eventos Notificados</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Decolagem (DEP) - Carga partiu da origem</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Chegada (ARR) - Carga chegou ao destino</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Entrega (DLV) - Carga entregue</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <span>Exceções - Atrasos e discrepâncias</span>
                  </li>
                </ul>
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
                {(searchTerm ? filteredFaq : faqItems).map((item, i) => (
                  <div key={i} className="p-4 rounded bg-white/5 border border-white/10">
                    <h4 className="text-white font-medium mb-2">{item.q}</h4>
                    <p className="text-sm text-white/70">{item.a}</p>
                  </div>
                ))}
                {searchTerm && filteredFaq.length === 0 && (
                  <p className="text-white/50 text-center py-4">Nenhuma pergunta encontrada para "{searchTerm}"</p>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(searchTerm ? filteredGlossary : glossaryItems).map((item, i) => (
                    <div key={i} className="p-3 rounded bg-white/5 border border-white/10">
                      <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30 mb-2">
                        {item.term}
                      </Badge>
                      <p className="text-sm text-white/70">{item.definition}</p>
                    </div>
                  ))}
                  {searchTerm && filteredGlossary.length === 0 && (
                    <p className="text-white/50 text-center py-4 col-span-2">Nenhum termo encontrado para "{searchTerm}"</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </PageLayout>
  );
}
