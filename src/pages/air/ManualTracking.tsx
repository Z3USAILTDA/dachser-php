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
  { id: 'adicionar-awb', title: 'Adicionar AWB', icon: <Plane className="h-4 w-4" /> },
  { id: 'monitoramento', title: 'Monitoramento', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'notificacoes', title: 'Notificações', icon: <Mail className="h-4 w-4" /> },
  { id: 'alertas', title: 'Alertas', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como adicionar um novo AWB para rastreamento?', 
    a: 'Clique em "+ Novo AWB", preencha o número do AWB (11 dígitos) e os dados do processo, então clique em "Adicionar".' 
  },
  { 
    q: 'Com que frequência os dados são atualizados?', 
    a: 'O sistema sincroniza automaticamente com as APIs de rastreamento a cada 5 minutos. Você pode forçar uma atualização clicando no botão de refresh.' 
  },
  { 
    q: 'Como configurar notificações por email?', 
    a: 'Clique no ícone de email ao lado do AWB e adicione os endereços que devem receber atualizações de status.' 
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
                  monitoramento de cargas aéreas, permitindo rastrear AWBs em tempo real com integração 
                  a múltiplas companhias aéreas.
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
                    <p className="text-xs text-white/60">Sincronização com APIs aéreas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Adicionar AWB */}
          <section ref={el => sectionRefs.current['adicionar-awb'] = el} id="adicionar-awb">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Plane className="h-5 w-5 text-amber-400" />
                  Adicionar AWB
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Para adicionar um novo AWB ao monitoramento, siga os passos abaixo:
                </p>

                <div className="space-y-2">
                  {[
                    'Clique no botão "+ Novo AWB" no topo da tela',
                    'Preencha o número do AWB (formato: XXX-XXXXXXXX)',
                    'Informe os dados complementares (cliente, referência)',
                    'Adicione emails para notificações (opcional)',
                    'Clique em "Adicionar" para confirmar'
                  ].map((etapa, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{etapa}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-300">
                    <strong>Dica:</strong> O sistema valida automaticamente o formato do AWB e verifica 
                    se já existe no monitoramento.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Monitoramento */}
          <section ref={el => sectionRefs.current['monitoramento'] = el} id="monitoramento">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-amber-400" />
                  Monitoramento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tabela principal exibe todos os AWBs em monitoramento com as seguintes informações:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>AWB:</strong> Número do conhecimento aéreo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Status:</strong> Último status reportado pela companhia</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Origem/Destino:</strong> Aeroportos de partida e chegada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Última Atualização:</strong> Data/hora do último evento</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Timeline:</strong> Visualização do histórico de eventos</span>
                  </li>
                </ul>

                <h4 className="text-white font-medium mt-4">Atualização Automática</h4>
                <p className="text-sm">
                  O sistema sincroniza automaticamente a cada 5 minutos. Para forçar uma atualização 
                  imediata, clique no botão <RefreshCw className="h-4 w-4 inline text-amber-400" /> ao lado do AWB.
                </p>
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
                  Configure notificações por email para ser alertado sobre mudanças de status:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Clique no ícone <Mail className="h-4 w-4 inline text-amber-400" /> ao lado do AWB</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Adicione um ou mais endereços de email</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Escolha quais eventos devem gerar notificação</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Salve as configurações</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    <strong>Importante:</strong> As notificações são enviadas apenas quando há mudança 
                    de status. Emails inválidos serão ignorados.
                  </p>
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
                  O sistema gera alertas automáticos para situações que requerem atenção:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge className="bg-red-500 mb-2">CRÍTICO</Badge>
                    <p className="text-xs text-white/60">AWB não encontrado, carga retida, exceções</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">ATENÇÃO</Badge>
                    <p className="text-xs text-white/60">Atrasos, conexões perdidas, alterações de voo</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">INFO</Badge>
                    <p className="text-xs text-white/60">Chegadas, entregas, atualizações de status</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge className="bg-green-500 mb-2">OK</Badge>
                    <p className="text-xs text-white/60">Tudo normal, dentro do esperado</p>
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
