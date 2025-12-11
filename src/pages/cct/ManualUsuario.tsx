import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/cct/PageLayout";
import { 
  BookOpen, 
  LayoutDashboard, 
  Clock, 
  AlertTriangle, 
  Bell, 
  Terminal, 
  HelpCircle, 
  BookText,
  ChevronRight,
  Search,
  Plane,
  Users,
  BarChart3,
  FileText,
  Settings,
  CheckCircle2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
}

const sections: Section[] = [
  { id: 'visao-geral', title: 'Visão Geral', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'dashboard', title: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'timeline', title: 'Timeline', icon: <Clock className="h-4 w-4" /> },
  { id: 'excecoes', title: 'Exceções', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'notificacoes', title: 'Notificações', icon: <Bell className="h-4 w-4" /> },
  { id: 'console', title: 'Console Técnico', icon: <Terminal className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como identificar processos em alerta?', 
    a: 'Processos em alerta são indicados por um badge laranja no Dashboard. Eles indicam que o SLA está próximo do limite (menos de 24h).' 
  },
  { 
    q: 'O que significa status CRÍTICO?', 
    a: 'Status crítico indica que o SLA foi ultrapassado ou que há uma exceção não resolvida que impede o andamento do processo.' 
  },
  { 
    q: 'Como atribuir um analista a um processo?', 
    a: 'No Dashboard, clique no ícone de usuário na coluna "Analista" e selecione o analista desejado na lista.' 
  },
  { 
    q: 'Como criar uma regra de notificação?', 
    a: 'Acesse Regras de Notificação, clique em "Nova Regra", preencha cliente/aeroportos/eventos e escolha os canais de notificação.' 
  },
  { 
    q: 'Os dados são sincronizados automaticamente?', 
    a: 'Sim, o sistema sincroniza com MariaDB a cada 5 minutos e com LeadComex a cada hora. Você pode forçar sincronização no Console Técnico.' 
  },
  { 
    q: 'Como resolver uma exceção operacional?', 
    a: 'Na página de Exceções, clique na exceção desejada, analise os detalhes e clique em "Resolver" após tomar as ações necessárias.' 
  },
];

const glossaryItems = [
  { term: 'AWB', definition: 'Air Waybill - Conhecimento de transporte aéreo que acompanha a mercadoria.' },
  { term: 'HAWB', definition: 'House Air Waybill - AWB emitido pelo agente de carga para o importador.' },
  { term: 'MAWB', definition: 'Master Air Waybill - AWB principal emitido pela companhia aérea.' },
  { term: 'CCT', definition: 'Central de Controle de Cargas - Sistema de monitoramento de processos.' },
  { term: 'SLA', definition: 'Service Level Agreement - Acordo de nível de serviço com prazos definidos.' },
  { term: 'LeadComex', definition: 'Sistema externo de rastreamento de cargas aéreas integrado ao CCT.' },
  { term: 'RFB', definition: 'Receita Federal do Brasil - Órgão responsável pelo controle aduaneiro.' },
  { term: 'DEP', definition: 'Departed - Status indicando que a carga decolou do aeroporto de origem.' },
  { term: 'ARR', definition: 'Arrived - Status indicando que a carga chegou ao aeroporto de destino.' },
  { term: 'DLV', definition: 'Delivered - Status indicando que a carga foi entregue ao destinatário.' },
];

export default function ManualUsuario() {
  const [activeSection, setActiveSection] = useState('visao-geral');
  const [searchTerm, setSearchTerm] = useState('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredFaq = faqItems.filter(item => 
    item.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.a.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGlossary = glossaryItems.filter(item =>
    item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageLayout title="DACHSER" subtitle="Manual do Usuário — Sistema CCT v2.0">
      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <aside className="w-64 shrink-0">
          <Card className="bg-[rgba(5,6,18,0.9)] border-white/12 sticky top-6">
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
        </aside>

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
                  A <strong className="text-amber-300">Central de Controle de Cargas (CCT)</strong> é uma plataforma 
                  completa para monitoramento em tempo real de processos de importação aérea. O sistema integra 
                  dados de múltiplas fontes para proporcionar visibilidade total do fluxo de cargas.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Plane className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Rastreamento</h4>
                    <p className="text-xs text-white/60">Acompanhe cargas desde a origem até a entrega final</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Bell className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Alertas</h4>
                    <p className="text-xs text-white/60">Receba notificações sobre eventos críticos</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <BarChart3 className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Analytics</h4>
                    <p className="text-xs text-white/60">Métricas e insights para tomada de decisão</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-6">Fontes de Dados Integradas</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><strong>MariaDB:</strong> Base de dados principal com processos e status</li>
                  <li><strong>LeadComex:</strong> API de rastreamento aéreo</li>
                  <li><strong>RFB:</strong> Dados da Receita Federal para desembaraço</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Dashboard */}
          <section ref={el => sectionRefs.current['dashboard'] = el} id="dashboard">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-amber-400" />
                  Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O Dashboard é a tela principal do CCT, oferecendo uma visão consolidada de todos os processos 
                  em andamento com métricas de performance e alertas prioritários.
                </p>

                <h4 className="text-white font-medium mt-4">Métricas Principais</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-white/5">
                    <p className="text-xs text-white/50">Total</p>
                    <p className="text-lg font-bold text-white">Processos ativos</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300">Alerta</p>
                    <p className="text-lg font-bold text-amber-300">SLA próximo</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-300">Crítico</p>
                    <p className="text-lg font-bold text-red-300">SLA excedido</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-blue-300">Eventos 24h</p>
                    <p className="text-lg font-bold text-blue-300">Atualizações</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Filtros por status, analista e período</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Busca por HAWB, MAWB ou cliente</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Atribuição de analistas aos processos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Criação manual de novos shipments</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Timeline */}
          <section ref={el => sectionRefs.current['timeline'] = el} id="timeline">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-400" />
                  Timeline do Processo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A Timeline apresenta o histórico completo de eventos de um processo, desde a manifestação 
                  até a entrega final, permitindo rastrear cada etapa da carga.
                </p>

                <h4 className="text-white font-medium mt-4">Eventos Monitorados</h4>
                <div className="space-y-2">
                  {['MANIFESTADO', 'AREA_TRANSFERENCIA', 'CHEGADA_INFORMADA', 'RECEPCIONADO', 'EM_TRANSITO', 'ENTREGUE'].map((evento, i) => (
                    <div key={evento} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="font-mono text-sm">{evento}</span>
                    </div>
                  ))}
                </div>

                <h4 className="text-white font-medium mt-4">Ações Disponíveis</h4>
                <ul className="space-y-1 text-sm">
                  <li>• Registrar peso constatado e calcular divergência</li>
                  <li>• Atualizar data de decolagem do último trecho</li>
                  <li>• Adicionar tratamentos especiais IATA</li>
                  <li>• Visualizar exceções associadas ao processo</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Exceções */}
          <section ref={el => sectionRefs.current['excecoes'] = el} id="excecoes">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Gestão de Exceções
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Exceções são ocorrências que requerem atenção especial da equipe operacional. O sistema 
                  detecta automaticamente algumas exceções e permite registro manual de outras.
                </p>

                <h4 className="text-white font-medium mt-4">Tipos de Exceção</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/30 mb-2">HOUSE_NAO_ENCONTRADO</Badge>
                    <p className="text-xs text-white/60">HAWB não localizado no sistema de rastreamento</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30 mb-2">API_INDISPONIVEL</Badge>
                    <p className="text-xs text-white/60">Falha na comunicação com API externa</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/30 mb-2">DIVERGENCIA_DADOS</Badge>
                    <p className="text-xs text-white/60">Inconsistência entre peso declarado e constatado</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30 mb-2">ATRASO_EVENTO</Badge>
                    <p className="text-xs text-white/60">Processo sem atualização por período prolongado</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Fluxo de Tratamento</h4>
                <div className="flex items-center gap-2 text-sm">
                  <Badge className="bg-red-500">ABERTA</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-amber-500">EM_ANALISE</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-green-500">RESOLVIDA</Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Notificações */}
          <section ref={el => sectionRefs.current['notificacoes'] = el} id="notificacoes">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Bell className="h-5 w-5 text-amber-400" />
                  Sistema de Notificações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Configure regras de notificação personalizadas para receber alertas automáticos 
                  sobre eventos específicos de clientes ou aeroportos.
                </p>

                <h4 className="text-white font-medium mt-4">Canais Disponíveis</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20 text-center">
                    <Badge className="bg-blue-500 mb-2">EMAIL_CLIENTE</Badge>
                    <p className="text-xs text-white/60">Notifica diretamente o cliente</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20 text-center">
                    <Badge className="bg-purple-500 mb-2">EMAIL_INTERNO</Badge>
                    <p className="text-xs text-white/60">Notifica equipe interna</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20 text-center">
                    <Badge className="bg-green-500 mb-2">WEBHOOK</Badge>
                    <p className="text-xs text-white/60">Integração via API</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Configuração de Regras</h4>
                <ul className="space-y-1 text-sm">
                  <li>• Defina cliente ou CNPJ para filtrar processos</li>
                  <li>• Selecione aeroportos de origem/destino</li>
                  <li>• Escolha eventos que disparam a notificação</li>
                  <li>• Configure template de mensagem personalizada</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Console Técnico */}
          <section ref={el => sectionRefs.current['console'] = el} id="console">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-amber-400" />
                  Console Técnico
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O Console Técnico é destinado a administradores e oferece ferramentas para 
                  monitoramento de sistema, sincronização de dados e gerenciamento de usuários.
                </p>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white/5 flex items-start gap-3">
                    <Settings className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Status de Conexões</p>
                      <p className="text-xs text-white/60">Monitore MariaDB, LeadComex e RFB</p>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-white/5 flex items-start gap-3">
                    <FileText className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Logs do Sistema</p>
                      <p className="text-xs text-white/60">Visualize e filtre logs de operação</p>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-white/5 flex items-start gap-3">
                    <Users className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Gerenciamento de Usuários</p>
                      <p className="text-xs text-white/60">Adicione, edite ou desative analistas</p>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-white/5 flex items-start gap-3">
                    <BarChart3 className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Sync Manual</p>
                      <p className="text-xs text-white/60">Force sincronização de dados</p>
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
              <CardContent className="space-y-3">
                {(searchTerm ? filteredFaq : faqItems).map((item, i) => (
                  <div key={i} className="p-4 rounded bg-white/5 border border-white/10">
                    <p className="text-white font-medium mb-2">{item.q}</p>
                    <p className="text-sm text-white/70">{item.a}</p>
                  </div>
                ))}
                {searchTerm && filteredFaq.length === 0 && (
                  <p className="text-white/50 text-center py-4">Nenhuma pergunta encontrada</p>
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
                      <p className="text-amber-300 font-mono font-bold">{item.term}</p>
                      <p className="text-sm text-white/70">{item.definition}</p>
                    </div>
                  ))}
                </div>
                {searchTerm && filteredGlossary.length === 0 && (
                  <p className="text-white/50 text-center py-4">Nenhum termo encontrado</p>
                )}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </PageLayout>
  );
}
