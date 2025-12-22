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
  Upload
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
  { id: 'dashboard', title: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'fluxo-voucher', title: 'Fluxo do Voucher', icon: <Clock className="h-4 w-4" /> },
  { id: 'urgencias', title: 'Urgências e SLA', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'notificacoes', title: 'Notificações', icon: <Bell className="h-4 w-4" /> },
  { id: 'perfis', title: 'Perfis e Permissões', icon: <Users className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
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
    a: 'Número SPO, fornecedor, valor, vencimento, cobrança em nome de e forma de pagamento.' 
  },
  { 
    q: 'Como funcionam os alertas de SLA?', 
    a: 'Os gestores recebem notificações automáticas quando vouchers permanecem parados por mais de 24h.' 
  },
  { 
    q: 'Posso editar um voucher após criado?', 
    a: 'Sim, desde que esteja na etapa de Operação e você tenha permissão de edição.' 
  },
];

const glossaryItems = [
  { term: 'SPO', definition: 'Número de identificação único do voucher no sistema' },
  { term: 'Voucher', definition: 'Documento financeiro que autoriza um pagamento a fornecedor' },
  { term: 'SLA', definition: 'Service Level Agreement - Tempo máximo para conclusão de cada etapa' },
  { term: 'Accrual', definition: 'Provisão financeira para despesas previstas mas não faturadas' },
  { term: 'RM', definition: 'Sistema de gestão financeira integrado (ERP)' },
  { term: 'Remessa', definition: 'Agrupamento de pagamentos para envio ao banco' },
  { term: 'Boleto', definition: 'Documento para pagamento bancário' },
  { term: 'NF', definition: 'Nota Fiscal - documento fiscal que comprova a transação' },
  { term: 'ICMS', definition: 'Imposto sobre Circulação de Mercadorias e Serviços' },
  { term: 'Baixa', definition: 'Confirmação de que o pagamento foi realizado' },
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

  // Detect scroll to toggle sticky behavior
  useEffect(() => {
    const handleScroll = () => {
      if (sidebarPlaceholderRef.current) {
        const rect = sidebarPlaceholderRef.current.getBoundingClientRect();
        // When the placeholder top goes above 24px from viewport top, make sidebar fixed
        setIsSticky(rect.top < 24);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state
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
    <PageLayout title="DACHSER" subtitle="Manual do Usuário — Esteira de Vouchers v1.0" pageIcon={BookOpen} backTo="/fin/esteira">
      <div className="flex gap-6 items-start">
        {/* Sidebar Navigation - Dynamic sticky */}
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
                  operação, fiscal, financeiro e automação para um fluxo eficiente.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <FileText className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Workflow</h4>
                    <p className="text-xs text-white/60">Fluxo completo de aprovação em 4 etapas</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Bell className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Alertas</h4>
                    <p className="text-xs text-white/60">Notificações automáticas de SLA e vencimento</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Bot className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Automação</h4>
                    <p className="text-xs text-white/60">Integração automática com sistema RM</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-6">Fluxo Operacional</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-blue-500">1. OPERAÇÃO</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-purple-500">2. FISCAL</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-amber-500">3. FINANCEIRO</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-cyan-500">4. ROBÔ/RM</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-green-500">CONCLUÍDO</Badge>
                </div>
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
                  O Dashboard é a tela principal do sistema, oferecendo uma visão consolidada de todos os vouchers 
                  em andamento com métricas de performance e alertas prioritários.
                </p>

                <h4 className="text-white font-medium mt-4">Métricas Principais</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-white/5">
                    <p className="text-xs text-white/50">Total</p>
                    <p className="text-lg font-bold text-white">Vouchers ativos</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300">Alerta</p>
                    <p className="text-lg font-bold text-amber-300">Vence em 24h</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-300">Crítico</p>
                    <p className="text-lg font-bold text-red-300">Vencidos</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <p className="text-xs text-green-300">Concluídos</p>
                    <p className="text-lg font-bold text-green-300">Baixados</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Filtros por etapa, status e urgência</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Busca por SPO, fornecedor ou cliente</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Criação e edição de vouchers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Exportação para Excel e PDF</span>
                  </li>
                </ul>
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
                  O voucher passa por 4 etapas principais, cada uma com responsáveis e ações específicas.
                </p>

                <h4 className="text-white font-medium mt-4">Etapas do Workflow</h4>
                <div className="space-y-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-500">1. OPERAÇÃO</Badge>
                    </div>
                    <ul className="text-xs text-white/70 space-y-1 ml-2">
                      <li>• Criar voucher com informações básicas</li>
                      <li>• Anexar documentos (NF, boleto)</li>
                      <li>• Definir nível de urgência</li>
                      <li>• Enviar para etapa Fiscal</li>
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
                  O sistema possui 3 níveis de urgência que determinam a prioridade de tratamento e os SLAs aplicáveis.
                </p>

                <h4 className="text-white font-medium mt-4">Tipos de Urgência</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30 mb-2">NORMAL</Badge>
                    <p className="text-xs text-white/60">Fluxo padrão do voucher sem priorização especial</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/30 mb-2">URGENTE REAL</Badge>
                    <p className="text-xs text-white/60">Requer aprovação do supervisor e justificativa</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30 mb-2">URGENTE AUTO</Badge>
                    <p className="text-xs text-white/60">Atribuído automaticamente para ICMS e Armazenagem</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">SLA por Etapa</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-sm">Operação</span>
                    <Badge variant="outline" className="text-white/70">24 horas</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-sm">Fiscal</span>
                    <Badge variant="outline" className="text-white/70">48 horas</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-sm">Financeiro</span>
                    <Badge variant="outline" className="text-white/70">24 horas</Badge>
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
                  Sistema de Notificações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O sistema envia notificações automáticas por e-mail para gestores e responsáveis 
                  em situações críticas do fluxo de vouchers.
                </p>

                <h4 className="text-white font-medium mt-4">Tipos de Notificação</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge className="bg-red-500 mb-2">ALERTA SLA</Badge>
                    <p className="text-xs text-white/60">Enviado quando voucher fica parado por mais de 24h</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">VENCIMENTO</Badge>
                    <p className="text-xs text-white/60">Enviado 24h antes do vencimento do voucher</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">RELATÓRIO DIÁRIO</Badge>
                    <p className="text-xs text-white/60">Enviado às 8:30h e 13:30h com resumo</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <Badge className="bg-purple-500 mb-2">AJUSTE SOLICITADO</Badge>
                    <p className="text-xs text-white/60">Enviado quando voucher retorna para correção</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Destinatários</h4>
                <ul className="space-y-1 text-sm">
                  <li>• <strong>Gestores de etapa:</strong> Recebem alertas de SLA da sua área</li>
                  <li>• <strong>Responsável pelo voucher:</strong> Recebe notificações de ajuste</li>
                  <li>• <strong>Cliente:</strong> Pode receber cópia de comprovantes (opcional)</li>
                </ul>
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
                  O sistema possui diferentes perfis com permissões específicas para cada etapa do workflow.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-blue-400" />
                      <span className="text-white font-medium text-sm">Operação</span>
                    </div>
                    <p className="text-xs text-white/60">Criar vouchers, anexar documentos, definir urgência</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-purple-400" />
                      <span className="text-white font-medium text-sm">Fiscal</span>
                    </div>
                    <p className="text-xs text-white/60">Revisar documentação, aprovar ou solicitar ajustes</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-amber-400" />
                      <span className="text-white font-medium text-sm">Financeiro</span>
                    </div>
                    <p className="text-xs text-white/60">Processar pagamentos, anexar comprovantes</p>
                  </div>
                  <div className="p-3 rounded bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-orange-400" />
                      <span className="text-white font-medium text-sm">Supervisor</span>
                    </div>
                    <p className="text-xs text-white/60">Aprovar urgentes reais, visão de todas as etapas</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20 md:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="h-4 w-4 text-red-400" />
                      <span className="text-white font-medium text-sm">Administrador</span>
                    </div>
                    <p className="text-xs text-white/60">Acesso total: gestão de usuários, configuração de SLAs, relatórios completos</p>
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
