import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Ship,
  Clock, 
  Bell, 
  HelpCircle, 
  BookText,
  ChevronRight,
  Search,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Users,
  FileText,
  Settings,
  TrendingUp
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
  { id: 'monitor', title: 'Monitor', icon: <Ship className="h-4 w-4" /> },
  { id: 'clientes', title: 'Clientes', icon: <Users className="h-4 w-4" /> },
  { id: 'tarifas', title: 'Tarifas', icon: <DollarSign className="h-4 w-4" /> },
  { id: 'disputas', title: 'Disputas', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'custos-armador', title: 'Custos por Armador', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'pre-faturamento', title: 'Pré-Faturamento', icon: <FileText className="h-4 w-4" /> },
  { id: 'analytics', title: 'Analytics', icon: <Settings className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'O que é demurrage?', 
    a: 'Demurrage é a cobrança aplicada quando um container permanece no porto além do período de free time acordado com o armador.' 
  },
  { 
    q: 'Como funciona o free time?', 
    a: 'Free time é o período gratuito (geralmente 7-14 dias) que o importador tem para retirar o container do terminal sem custos adicionais.' 
  },
  { 
    q: 'Como são calculados os custos de demurrage?', 
    a: 'Os custos são calculados multiplicando os dias excedentes pela tarifa diária do armador, que varia conforme o tipo de container.' 
  },
  { 
    q: 'O que significa risco alto/médio/baixo?', 
    a: 'O sistema classifica containers por risco de incorrer em demurrage: Alto (free time vence em até 3 dias), Médio (4-7 dias), Baixo (mais de 7 dias).' 
  },
  { 
    q: 'Como abrir uma disputa?', 
    a: 'Na tabela de disputas, clique em "Abrir Disputa" ao lado do container e preencha a justificativa e documentos de suporte.' 
  },
  { 
    q: 'Os dados são atualizados automaticamente?', 
    a: 'Sim, o sistema sincroniza periodicamente com o banco de dados para trazer as informações mais recentes dos containers.' 
  },
];

const glossaryItems = [
  { term: 'Demurrage', definition: 'Taxa cobrada pelo uso do container além do free time permitido.' },
  { term: 'Free Time', definition: 'Período gratuito para uso do container no porto, geralmente 7-14 dias.' },
  { term: 'Armador', definition: 'Companhia de navegação proprietária dos containers (ex: MSC, Hapag-Lloyd).' },
  { term: 'MBL', definition: 'Master Bill of Lading - Conhecimento de embarque principal.' },
  { term: 'Container 20\'', definition: 'Container padrão de 20 pés (TEU).' },
  { term: 'Container 40\'', definition: 'Container de 40 pés, equivalente a 2 TEUs.' },
  { term: 'Container 40\' HC', definition: 'Container de 40 pés High Cube, com altura extra.' },
  { term: 'Dias Excedentes', definition: 'Quantidade de dias além do free time que geraram cobrança.' },
  { term: 'ETA', definition: 'Estimated Time of Arrival - Data estimada de chegada do navio.' },
  { term: 'Atracação', definition: 'Data em que o navio atracou no porto de destino.' },
  { term: 'Pré-Fatura', definition: 'Documento preparatório para cobrança do cliente referente a demurrage.' },
  { term: 'Disputa', definition: 'Contestação formal de cobrança de demurrage junto ao armador.' },
];

export default function ManualDemurrage() {
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
    <PageLayout title="DACHSER" subtitle="Manual — Demurrage v1.0" backTo="/sea/demurrage" pageIcon={BookOpen}>
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
                  O módulo <strong className="text-amber-300">Demurrage</strong> permite gerenciar e monitorar 
                  os custos de demurrage de containers marítimos, controlando free time, tarifas e disputas.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Clock className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Free Time</h4>
                    <p className="text-xs text-white/60">Controle de prazos</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <DollarSign className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Custos</h4>
                    <p className="text-xs text-white/60">Cálculo automático</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Alertas</h4>
                    <p className="text-xs text-white/60">Notificações de risco</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Monitor */}
          <section ref={el => sectionRefs.current['monitor'] = el} id="monitor">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Ship className="h-5 w-5 text-amber-400" />
                  Monitor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tela principal do Monitor exibe todos os containers ativos com informações de demurrage:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Container/MBL:</strong> Identificação do container e conhecimento</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Armador:</strong> Companhia de navegação responsável</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Free Time:</strong> Dias restantes do período gratuito</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Risco:</strong> Classificação de urgência (Alto/Médio/Baixo)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Custo Estimado:</strong> Projeção de demurrage em USD</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    <strong>Dica:</strong> Use os filtros por armador, cliente ou status para encontrar containers específicos.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Clientes */}
          <section ref={el => sectionRefs.current['clientes'] = el} id="clientes">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-amber-400" />
                  Clientes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Gerencie configurações de demurrage por cliente:
                </p>

                <div className="space-y-2">
                  {[
                    'Visualize todos os clientes com containers ativos',
                    'Configure free time personalizado por cliente',
                    'Defina regras de alerta antecipado',
                    'Ative notificações automáticas por email',
                    'Defina frequência de relatórios'
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tarifas */}
          <section ref={el => sectionRefs.current['tarifas'] = el} id="tarifas">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                  Tarifas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Cadastre e gerencie as tarifas de demurrage por armador:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Armador:</strong> Companhia de navegação</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Tipo Container:</strong> 20', 40', 40' HC</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Free Time Padrão:</strong> Dias gratuitos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Tarifa USD/dia:</strong> Valor cobrado por dia excedente</span>
                  </li>
                </ul>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm font-medium text-white">Período 1</p>
                    <p className="text-xs text-white/60">Dias 1-7: tarifa básica</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-sm font-medium text-white">Período 2</p>
                    <p className="text-xs text-white/60">Dias 8+: tarifa aumentada</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Disputas */}
          <section ref={el => sectionRefs.current['disputas'] = el} id="disputas">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Disputas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Gerencie contestações de cobranças de demurrage:
                </p>

                <div className="space-y-2">
                  {[
                    'Identifique discrepâncias entre cobrança do armador e cálculo interno',
                    'Abra disputas com justificativa e documentos',
                    'Acompanhe o status: Aberta, Em Análise, Aprovada, Rejeitada',
                    'Registre valores recuperados',
                    'Exporte relatórios de disputas'
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Custos por Armador */}
          <section ref={el => sectionRefs.current['custos-armador'] = el} id="custos-armador">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-amber-400" />
                  Custos por Armador
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Visualize os custos reais cobrados pelos armadores:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Número da Fatura:</strong> Referência do armador</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Dias Cobrados:</strong> Quantidade de dias na fatura</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Custo USD:</strong> Valor total cobrado</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Discrepância:</strong> Diferença vs. cálculo esperado</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Pré-Faturamento */}
          <section ref={el => sectionRefs.current['pre-faturamento'] = el} id="pre-faturamento">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-400" />
                  Pré-Faturamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Gerencie o faturamento de demurrage para clientes:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Pré-Fatura:</strong> Número da pré-fatura gerada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Status:</strong> Pendente, Aprovada, Faturada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Total USD:</strong> Valor a ser faturado</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-green-300">
                    <strong>Fluxo:</strong> Container com demurrage → Gerar pré-fatura → Aprovar → Faturar cliente
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Analytics */}
          <section ref={el => sectionRefs.current['analytics'] = el} id="analytics">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Settings className="h-5 w-5 text-amber-400" />
                  Analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Dashboard analítico com métricas e indicadores de demurrage:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-sm font-medium text-white">Custo Total</p>
                    <p className="text-xs text-white/60">Soma de demurrage no período</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-sm font-medium text-white">Containers em Risco</p>
                    <p className="text-xs text-white/60">Qtde com free time expirando</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-sm font-medium text-white">Valor Recuperado</p>
                    <p className="text-xs text-white/60">Total de disputas ganhas</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-sm font-medium text-white">Média por Container</p>
                    <p className="text-xs text-white/60">Custo médio de demurrage</p>
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
