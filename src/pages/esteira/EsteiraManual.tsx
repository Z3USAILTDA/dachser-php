import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  LayoutDashboard, 
  Clock, 
  AlertTriangle, 
  Bell, 
  HelpCircle, 
  BookText,
  ChevronRight,
  Search,
  FileText,
  Users,
  DollarSign,
  Bot,
  CheckCircle2,
  Settings,
  Upload,
  BarChart3,
  ClipboardList,
  ArrowLeftRight,
  RefreshCw,
  Filter
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
  { id: 'navegacao', title: 'Navegação', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'fluxo-voucher', title: 'Fluxo do Voucher', icon: <Clock className="h-4 w-4" /> },
  { id: 'urgencias', title: 'Urgências e SLA', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'notificacoes', title: 'Notificações', icon: <Bell className="h-4 w-4" /> },
  { id: 'perfis', title: 'Perfis e Permissões', icon: <Users className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'O que significa voucher "A Processar"?', 
    a: 'Vouchers "A Processar" são vouchers pendentes de importação do sistema RM. Ao clicar em um voucher neste status, ele é automaticamente importado para a etapa de Operação.' 
  },
  { 
    q: 'Como funciona a importação automática?', 
    a: 'Quando você clica em um voucher com status "A Processar" para visualizar ou editar, o sistema automaticamente o importa para a etapa OPERAÇÃO, permitindo que você trabalhe nele.' 
  },
  { 
    q: 'Como marcar um voucher como urgente?', 
    a: 'Na etapa de Operação, selecione o tipo de urgência no formulário de criação. Vouchers "Urgente Real" requerem aprovação do supervisor.' 
  },
  { 
    q: 'Como funciona o urgente automático?', 
    a: 'Vouchers de ICMS e ARMAZENAGEM são marcados automaticamente como urgentes pelo sistema.' 
  },
  { 
    q: 'Como visualizar documentos anexados?', 
    a: 'Clique no ícone de anexo na linha do voucher para abrir a visualização de documentos.' 
  },
  { 
    q: 'Quais campos são obrigatórios?', 
    a: 'Número SPO, fornecedor, valor, vencimento, cobrança em nome de e forma de pagamento. Além disso, é obrigatório anexar a Nota Fiscal (e Boleto se forma de pagamento for Boleto).' 
  },
  { 
    q: 'Como funcionam os alertas de SLA?', 
    a: 'Os gestores recebem notificações automáticas quando vouchers permanecem parados por mais de 24h em uma etapa. O sistema calcula o "gargalo" para identificar etapas que estão atrasando o fluxo.' 
  },
  { 
    q: 'Posso editar um voucher após criado?', 
    a: 'Sim, desde que esteja na etapa de Operação e você tenha permissão de edição.' 
  },
  { 
    q: 'Como retornar um voucher para etapa anterior?', 
    a: 'Clique no menu de ações (três pontos) e selecione "Retornar etapa". Será necessário informar uma justificativa.' 
  },
  { 
    q: 'Por que só vejo alguns vouchers?', 
    a: 'O sistema filtra automaticamente os vouchers com base no seu perfil. Operação vê vouchers em OPERAÇÃO, Fiscal vê em FISCAL, etc.' 
  },
  { 
    q: 'Como funciona a atualização automática?', 
    a: 'Ao focar na página (clicar na janela ou voltar de outra aba), os dados são atualizados automaticamente. A última atualização é exibida na tabela.' 
  },
];

const glossaryItems = [
  { term: 'SPO', definition: 'Número de identificação único do voucher no sistema' },
  { term: 'Voucher', definition: 'Documento financeiro que autoriza um pagamento a fornecedor' },
  { term: 'A Processar', definition: 'Status de vouchers pendentes de importação do sistema RM' },
  { term: 'Operacional', definition: 'Nome do filtro para a etapa de Operação no grid de processos' },
  { term: 'SLA', definition: 'Service Level Agreement - Tempo máximo para conclusão de cada etapa' },
  { term: 'Gargalo', definition: 'Etapa que está atrasando o fluxo do voucher, calculada pelo tempo parado' },
  { term: 'Accrual', definition: 'Provisão financeira para despesas previstas mas não faturadas' },
  { term: 'RM', definition: 'Sistema de gestão financeira integrado (ERP) que origina vouchers' },
  { term: 'Remessa', definition: 'Agrupamento de pagamentos para envio ao banco' },
  { term: 'Boleto', definition: 'Documento para pagamento bancário' },
  { term: 'NF', definition: 'Nota Fiscal - documento fiscal que comprova a transação' },
  { term: 'ICMS', definition: 'Imposto sobre Circulação de Mercadorias e Serviços' },
  { term: 'Baixa', definition: 'Confirmação de que o pagamento foi realizado' },
  { term: 'Supervisor', definition: 'Perfil responsável por aprovar vouchers urgentes reais' },
];

export default function EsteiraManual() {
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
    <PageLayout title="DACHSER" subtitle="Manual do Usuário — Esteira de Vouchers v2.0" pageIcon={BookOpen} backTo="/fin/esteira">
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
                  O <strong className="text-amber-300">Sistema de Vouchers DACHSER</strong> é uma plataforma 
                  completa para gerenciamento do ciclo de vida de pagamentos a fornecedores. O sistema integra 
                  operação, fiscal, supervisor, financeiro e automação para um fluxo eficiente.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <FileText className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Workflow</h4>
                    <p className="text-xs text-white/60">Fluxo completo de aprovação em 6 etapas</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Bell className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Alertas</h4>
                    <p className="text-xs text-white/60">Notificações automáticas de SLA e vencimento</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Bot className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Automação</h4>
                    <p className="text-xs text-white/60">Importação automática do sistema RM</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-6">Fluxo Operacional Completo</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-slate-600">A PROCESSAR</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-blue-500">OPERAÇÃO</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-purple-500">FISCAL</Badge>
                  <span className="text-white/40 text-xs">ou</span>
                  <Badge className="bg-orange-500">SUPERVISOR</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-amber-500">FINANCEIRO</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-cyan-500">ROBÔ</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-green-500">CONCLUÍDO</Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Navegação */}
          <section ref={el => sectionRefs.current['navegacao'] = el} id="navegacao">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-amber-400" />
                  Navegação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O sistema possui 6 abas principais para diferentes funções:
                </p>

                <div className="space-y-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardList className="h-4 w-4 text-blue-400" />
                      <span className="text-white font-medium">Processos</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Grid principal de vouchers com filtros por etapa (Operacional, Fiscal, Supervisor, Financeiro, Robô), 
                      status, urgência e busca por SPO/fornecedor. Inclui paginação de 20 itens por página.
                    </p>
                  </div>

                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <LayoutDashboard className="h-4 w-4 text-purple-400" />
                      <span className="text-white font-medium">Dashboard</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Métricas consolidadas: total de vouchers por etapa, vouchers urgentes, 
                      vencimentos próximos e vouchers vencidos. Visão rápida do status geral.
                    </p>
                  </div>

                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-4 w-4 text-amber-400" />
                      <span className="text-white font-medium">Analytics</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Gráficos de distribuição por etapa, evolução mensal de vouchers, 
                      valor total por etapa e análise de performance do fluxo.
                    </p>
                  </div>

                  <div className="p-3 rounded bg-cyan-500/10 border border-cyan-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="h-4 w-4 text-cyan-400" />
                      <span className="text-white font-medium">Robô</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Status da integração automática com RM, logs de sincronização, 
                      vouchers processados e possíveis erros de integração.
                    </p>
                  </div>

                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-green-400" />
                      <span className="text-white font-medium">Relatórios</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Exportação de dados para Excel e PDF, relatórios por período, 
                      por etapa e análise detalhada de vouchers.
                    </p>
                  </div>

                  <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-rose-400" />
                      <span className="text-white font-medium">Pagamentos</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Gestão de pagamentos e comprovantes, upload de arquivos de baixa, 
                      conciliação de remessas e status de pagamento.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Fluxo do Voucher */}
          <section ref={el => sectionRefs.current['fluxo-voucher'] = el} id="fluxo-voucher">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-400" />
                  Fluxo do Voucher
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O voucher passa por 6 etapas principais, com importação automática do RM e aprovação de supervisor para urgentes.
                </p>

                <h4 className="text-white font-medium mt-4">Etapas do Workflow</h4>
                <div className="space-y-3">
                  <div className="p-3 rounded bg-slate-500/10 border border-slate-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-slate-600">0. A PROCESSAR</Badge>
                      <Badge variant="outline" className="text-xs border-slate-500/30 text-slate-300">Automático</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Vouchers pendentes vindos do sistema RM</li>
                      <li>• <strong className="text-amber-300">Importação automática:</strong> ao clicar para visualizar/editar, o voucher é importado para OPERAÇÃO</li>
                      <li>• Não requer ação manual de importação</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-500">1. OPERAÇÃO</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Criar/editar voucher com informações básicas</li>
                      <li>• Anexar documentos obrigatórios (NF, boleto se aplicável)</li>
                      <li>• Definir nível de urgência</li>
                      <li>• Enviar para Fiscal ou Supervisor (se urgente real)</li>
                    </ul>
                  </div>
                  
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-purple-500">2. FISCAL</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Revisar documentação fiscal</li>
                      <li>• Validar informações tributárias</li>
                      <li>• Aprovar ou devolver para ajustes</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-orange-500">2b. SUPERVISOR</Badge>
                      <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-300">Urgentes</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Recebe vouchers marcados como "Urgente Real"</li>
                      <li>• Aprova ou rejeita a urgência</li>
                      <li>• Após aprovação, segue para Financeiro</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-amber-500">3. FINANCEIRO</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Processar pagamento</li>
                      <li>• Anexar comprovante de pagamento</li>
                      <li>• Enviar para integração com RM</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-cyan-500/10 border border-cyan-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-cyan-500">4. ROBÔ/RM</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Integração automática com sistema RM</li>
                      <li>• Upload de comprovantes em lote</li>
                      <li>• Baixa automática ou manual</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-green-500">5. CONCLUÍDO</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Voucher finalizado e baixado</li>
                      <li>• Disponível para consulta no histórico</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowLeftRight className="h-4 w-4 text-amber-300" />
                    <span className="text-amber-300 font-medium">Retornar Etapa</span>
                  </div>
                  <p className="text-xs text-white/70">
                    É possível retornar um voucher para a etapa anterior através do menu de ações. 
                    Uma justificativa obrigatória deve ser informada e ficará registrada no histórico.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Urgências e SLA */}
          <section ref={el => sectionRefs.current['urgencias'] = el} id="urgencias">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Urgências e SLA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O sistema possui 3 níveis de urgência e rastreamento de SLA com identificação de gargalos.
                </p>

                <h4 className="text-white font-medium mt-4">Tipos de Urgência</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30 mb-2">NORMAL</Badge>
                    <p className="text-xs text-white/60">Fluxo padrão do voucher sem priorização especial</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/30 mb-2">URGENTE REAL</Badge>
                    <p className="text-xs text-white/60">Requer aprovação do supervisor e justificativa. Passa pela etapa SUPERVISOR.</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30 mb-2">URGENTE AUTO</Badge>
                    <p className="text-xs text-white/60">Marcado automaticamente para ICMS e ARMAZENAGEM</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-6">Controle de SLA e Gargalos</h4>
                <div className="space-y-2">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-amber-400" />
                      <span className="text-white font-medium text-sm">Tempo por Etapa</span>
                    </div>
                    <p className="text-xs text-white/60">
                      O sistema calcula quanto tempo cada voucher permanece em cada etapa, 
                      identificando o "gargalo" (etapa que mais está atrasando).
                    </p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <span className="text-white font-medium text-sm">Alerta de SLA</span>
                    </div>
                    <p className="text-xs text-white/60">
                      Vouchers parados por mais de 24h em uma etapa geram alertas automáticos 
                      para os gestores responsáveis.
                    </p>
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
                  <Bell className="h-5 w-5 text-amber-400" />
                  Notificações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O sistema envia notificações automáticas por email:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Vouchers próximos do vencimento (24h)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Vouchers vencidos não processados</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Vouchers parados (SLA excedido)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Solicitações de urgência real pendentes</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-blue-300" />
                    <span className="text-blue-300 font-medium">Atualização Automática</span>
                  </div>
                  <p className="text-xs text-white/70">
                    A tela de processos atualiza automaticamente quando você foca na janela 
                    (clica na página ou volta de outra aba). O horário da última atualização 
                    é exibido na tabela.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Perfis e Permissões */}
          <section ref={el => sectionRefs.current['perfis'] = el} id="perfis">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-amber-400" />
                  Perfis e Permissões
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O sistema possui perfis com permissões específicas e filtros automáticos por etapa:
                </p>

                <div className="space-y-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">OPERAÇÃO</Badge>
                    <ul className="text-xs text-white/70 space-y-1">
                      <li>• Vê apenas vouchers na etapa OPERAÇÃO (filtro: "Operacional")</li>
                      <li>• Pode criar, editar e anexar documentos</li>
                      <li>• Pode enviar para Fiscal ou Supervisor</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <Badge className="bg-purple-500 mb-2">FISCAL</Badge>
                    <ul className="text-xs text-white/70 space-y-1">
                      <li>• Vê apenas vouchers na etapa FISCAL</li>
                      <li>• Pode aprovar ou devolver vouchers</li>
                      <li>• Pode adicionar ajustes fiscais</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded bg-orange-500/10 border border-orange-500/20">
                    <Badge className="bg-orange-500 mb-2">SUPERVISOR</Badge>
                    <ul className="text-xs text-white/70 space-y-1">
                      <li>• Vê vouchers na etapa SUPERVISOR</li>
                      <li>• Aprova ou rejeita urgências reais</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">FINANCEIRO</Badge>
                    <ul className="text-xs text-white/70 space-y-1">
                      <li>• Vê apenas vouchers na etapa FINANCEIRO</li>
                      <li>• Processa pagamentos</li>
                      <li>• Anexa comprovantes</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded bg-slate-500/10 border border-slate-500/20">
                    <Badge className="bg-slate-600 mb-2">ADMIN / GESTOR</Badge>
                    <ul className="text-xs text-white/70 space-y-1">
                      <li>• Vê todos os vouchers de todas as etapas</li>
                      <li>• Acesso completo a todas as funcionalidades</li>
                      <li>• Pode gerenciar usuários</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Filter className="h-4 w-4 text-amber-300" />
                    <span className="text-amber-300 font-medium">Filtro Automático por Perfil</span>
                  </div>
                  <p className="text-xs text-white/70">
                    Ao acessar a tela de Processos, o sistema aplica automaticamente o filtro 
                    correspondente ao seu perfil, mostrando apenas os vouchers da sua etapa.
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
                        <p className="text-amber-300 font-medium text-sm">{item.term}</p>
                        <p className="text-white/60 text-xs mt-1">{item.definition}</p>
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
