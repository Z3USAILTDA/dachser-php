import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Users, 
  BarChart3, 
  FileText, 
  Settings, 
  HelpCircle, 
  BookText,
  ChevronRight,
  Search,
  CheckCircle2,
  Shield,
  Activity,
  Database
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
  { id: 'usuarios', title: 'Gestão de Usuários', icon: <Users className="h-4 w-4" /> },
  { id: 'registro', title: 'Registro de Usuários', icon: <Shield className="h-4 w-4" /> },
  { id: 'metricas', title: 'Métricas de Uso', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'logs', title: 'Logs do Sistema', icon: <FileText className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como criar um novo usuário?', 
    a: 'Na tela de Gestão de Usuários, clique em "Novo Usuário", preencha os dados e atribua os perfis de acesso desejados.' 
  },
  { 
    q: 'Como alterar permissões de um usuário?', 
    a: 'Localize o usuário na lista, clique em "Editar" e modifique os perfis de acesso. As alterações são aplicadas imediatamente.' 
  },
  { 
    q: 'O que significam as métricas de uso?', 
    a: 'As métricas mostram a quantidade de acessos por módulo, tempo médio de sessão e funcionalidades mais utilizadas.' 
  },
  { 
    q: 'Como consultar logs de erro?', 
    a: 'Na tela de Logs, filtre por "Nível: Erro" para visualizar apenas logs de erro. Use a busca para encontrar eventos específicos.' 
  },
  { 
    q: 'Posso desativar um usuário sem excluí-lo?', 
    a: 'Sim, na edição do usuário, desmarque a opção "Ativo". O usuário não poderá mais acessar o sistema mas seu histórico é mantido.' 
  },
];

const glossaryItems = [
  { term: 'Admin', definition: 'Administrador com acesso total ao sistema.' },
  { term: 'Perfil', definition: 'Conjunto de permissões que define o que o usuário pode fazer.' },
  { term: 'Log', definition: 'Registro de eventos e ações realizadas no sistema.' },
  { term: 'Sessão', definition: 'Período de tempo em que um usuário está logado.' },
  { term: 'Métrica', definition: 'Dado quantitativo sobre uso e performance do sistema.' },
  { term: 'Auditoria', definition: 'Registro de todas as ações para fins de controle.' },
  { term: 'RLS', definition: 'Row Level Security - Controle de acesso por linha de dados.' },
  { term: 'Edge Function', definition: 'Função serverless executada na borda da rede.' },
];

export default function ManualAdmin() {
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
    <PageLayout title="DACHSER" subtitle="Manual do Administrador v1.0" backTo="/admin/users" pageIcon={BookOpen}>
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
                  O módulo <strong className="text-amber-300">Administração</strong> fornece ferramentas 
                  para gestão de usuários, monitoramento de métricas e análise de logs do sistema, 
                  garantindo controle total sobre a plataforma.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Users className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Usuários</h4>
                    <p className="text-xs text-white/60">Gestão de contas e permissões</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <BarChart3 className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Métricas</h4>
                    <p className="text-xs text-white/60">Análise de uso e performance</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <FileText className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Logs</h4>
                    <p className="text-xs text-white/60">Auditoria e diagnóstico</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Gestão de Usuários */}
          <section ref={el => sectionRefs.current['usuarios'] = el} id="usuarios">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-amber-400" />
                  Gestão de Usuários
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Gerencie todos os usuários do sistema, atribuindo perfis de acesso 
                  e controlando permissões por módulo.
                </p>

                <h4 className="text-white font-medium mt-4">Perfis de Acesso</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge className="bg-red-500 mb-2">ADMIN</Badge>
                    <p className="text-xs text-white/60">Acesso total</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">GESTOR</Badge>
                    <p className="text-xs text-white/60">Gestão de equipe</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">OPERAÇÃO</Badge>
                    <p className="text-xs text-white/60">Execução operacional</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <Badge className="bg-purple-500 mb-2">FISCAL</Badge>
                    <p className="text-xs text-white/60">Conferência fiscal</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge className="bg-green-500 mb-2">FINANCEIRO</Badge>
                    <p className="text-xs text-white/60">Gestão financeira</p>
                  </div>
                  <div className="p-3 rounded bg-cyan-500/10 border border-cyan-500/20">
                    <Badge className="bg-cyan-500 mb-2">SUPERVISOR</Badge>
                    <p className="text-xs text-white/60">Supervisão geral</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Ações Disponíveis</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Criar novos usuários</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Editar perfis e permissões</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Ativar/desativar contas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Resetar senhas</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Registro de Usuários */}
          <section ref={el => sectionRefs.current['registro'] = el} id="registro">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-amber-400" />
                  Registro de Usuários
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Tela dedicada ao registro de novos usuários no sistema. 
                  Permite criar contas com perfis e permissões pré-definidas.
                </p>

                <h4 className="text-white font-medium mt-4">Dados Necessários</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-sm font-medium text-white">Nome Completo</p>
                    <p className="text-xs text-white/60">Identificação do usuário</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-sm font-medium text-white">Email</p>
                    <p className="text-xs text-white/60">Login e notificações</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-sm font-medium text-white">Perfil</p>
                    <p className="text-xs text-white/60">Nível de acesso</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Fluxo de Registro</h4>
                <div className="space-y-2">
                  {['1. Preencher formulário com dados do usuário', '2. Selecionar perfil de acesso', '3. Enviar convite por email', '4. Usuário define senha no primeiro acesso'].map((etapa, i) => (
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

          {/* Métricas de Uso */}
          <section ref={el => sectionRefs.current['metricas'] = el} id="metricas">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-amber-400" />
                  Métricas de Uso
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Monitore o uso da plataforma com dashboards e gráficos que mostram 
                  acessos, funcionalidades mais usadas e performance do sistema.
                </p>

                <h4 className="text-white font-medium mt-4">Indicadores Principais</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-white/5">
                    <Activity className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-xs text-white/50">Usuários Ativos</p>
                    <p className="text-lg font-bold text-white">Diário/Mensal</p>
                  </div>
                  <div className="p-3 rounded bg-white/5">
                    <Database className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-xs text-white/50">Requisições</p>
                    <p className="text-lg font-bold text-white">Por módulo</p>
                  </div>
                  <div className="p-3 rounded bg-white/5">
                    <Shield className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-xs text-white/50">Erros</p>
                    <p className="text-lg font-bold text-white">Taxa de falha</p>
                  </div>
                  <div className="p-3 rounded bg-white/5">
                    <Settings className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-xs text-white/50">Performance</p>
                    <p className="text-lg font-bold text-white">Tempo resposta</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Logs do Sistema */}
          <section ref={el => sectionRefs.current['logs'] = el} id="logs">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-400" />
                  Logs do Sistema
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Visualize logs de aplicação, banco de dados e edge functions 
                  para diagnóstico e auditoria de ações.
                </p>

                <h4 className="text-white font-medium mt-4">Tipos de Log</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded bg-blue-500/10">
                    <Badge className="bg-blue-500">INFO</Badge>
                    <span className="text-sm">Informações gerais de operação</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-amber-500/10">
                    <Badge className="bg-amber-500">WARN</Badge>
                    <span className="text-sm">Alertas que requerem atenção</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-red-500/10">
                    <Badge className="bg-red-500">ERROR</Badge>
                    <span className="text-sm">Erros que afetam funcionalidade</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-purple-500/10">
                    <Badge className="bg-purple-500">DEBUG</Badge>
                    <span className="text-sm">Detalhes técnicos para diagnóstico</span>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Filtro por nível, data e função</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Busca por texto em mensagens</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Expansão de detalhes JSON</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Atualização em tempo real</span>
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
