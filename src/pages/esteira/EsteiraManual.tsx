import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  BookOpen, 
  LayoutDashboard, 
  Clock, 
  AlertTriangle, 
  Bell, 
  HelpCircle, 
  BookText,
  FileText,
  Send,
  CheckCircle,
  DollarSign,
  Bot,
  Users,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import dachserBg from "@/assets/dachser-background.jpg";

type Section = 
  | "visao-geral" 
  | "dashboard" 
  | "fluxo-voucher" 
  | "urgencias" 
  | "notificacoes" 
  | "perfis" 
  | "faq" 
  | "glossario";

const navItems: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "visao-geral", label: "Visão Geral", icon: BookOpen },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "fluxo-voucher", label: "Fluxo do Voucher", icon: Clock },
  { id: "urgencias", label: "Urgências e SLA", icon: AlertTriangle },
  { id: "notificacoes", label: "Notificações", icon: Bell },
  { id: "perfis", label: "Perfis e Permissões", icon: Users },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "glossario", label: "Glossário", icon: BookText },
];

const FlowStep = ({ 
  number, 
  title, 
  icon: Icon 
}: { 
  number: number; 
  title: string; 
  icon: React.ElementType 
}) => (
  <div className="flex flex-col items-center text-center">
    <div className="relative">
      <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
        {number}
      </span>
    </div>
    <span className="mt-2 text-sm text-muted-foreground">{title}</span>
  </div>
);

const FeatureCard = ({ 
  title, 
  description, 
  icon: Icon 
}: { 
  title: string; 
  description: string; 
  icon: React.ElementType 
}) => (
  <div className="flex items-start gap-3 p-4 bg-card/40 rounded-lg border border-border/30">
    <div className="p-2 rounded-lg bg-primary/20">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div>
      <h4 className="font-semibold text-foreground">{title}</h4>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </div>
);

export default function EsteiraManual() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>("visao-geral");
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<Section, HTMLDivElement | null>>({
    "visao-geral": null,
    "dashboard": null,
    "fluxo-voucher": null,
    "urgencias": null,
    "notificacoes": null,
    "perfis": null,
    "faq": null,
    "glossario": null,
  });

  const scrollToSection = (sectionId: Section) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const container = contentRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const offset = 150;

      for (const item of navItems) {
        const element = sectionRefs.current[item.id];
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollTop >= offsetTop - offset && scrollTop < offsetTop + offsetHeight - offset) {
            setActiveSection(item.id);
            break;
          }
        }
      }
    };

    const container = contentRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${dachserBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(4, 17, 45, 0.95), rgba(26, 93, 173, 0.65))',
          }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate("/fin/esteira")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Sistema
            </button>
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">Manual do Usuário</h1>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-md border border-primary/50 bg-primary/10 text-primary text-xs font-medium">
            VOUCHER DACHSER v1.0
          </div>
        </div>
      </header>

      <div className="relative z-10 flex">
        {/* Sidebar */}
        <aside className="w-64 h-[calc(100vh-65px)] sticky top-[65px] border-r border-border/50 bg-card/30 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Navegação
            </span>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  activeSection === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main 
          ref={contentRef}
          className="flex-1 h-[calc(100vh-65px)] overflow-y-auto"
        >
          <div className="max-w-4xl mx-auto p-8 space-y-16">
            <div ref={(el) => (sectionRefs.current["visao-geral"] = el)}>
              <VisaoGeralSection />
            </div>
            <div ref={(el) => (sectionRefs.current["dashboard"] = el)}>
              <DashboardSection />
            </div>
            <div ref={(el) => (sectionRefs.current["fluxo-voucher"] = el)}>
              <FluxoVoucherSection />
            </div>
            <div ref={(el) => (sectionRefs.current["urgencias"] = el)}>
              <UrgenciasSection />
            </div>
            <div ref={(el) => (sectionRefs.current["notificacoes"] = el)}>
              <NotificacoesSection />
            </div>
            <div ref={(el) => (sectionRefs.current["perfis"] = el)}>
              <PerfisSection />
            </div>
            <div ref={(el) => (sectionRefs.current["faq"] = el)}>
              <FAQSection />
            </div>
            <div ref={(el) => (sectionRefs.current["glossario"] = el)}>
              <GlossarioSection />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function VisaoGeralSection() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Visão Geral do Sistema</h2>
      </div>

      <div className="bg-card/60 border border-border/30 rounded-xl p-6 space-y-4 backdrop-blur-sm">
        <h3 className="text-lg font-semibold">O que é o Sistema de Vouchers?</h3>
        <p className="text-muted-foreground">
          O <span className="text-primary font-semibold">Sistema de Vouchers Dachser</span> é uma plataforma desenvolvida pela Z3US para a DACHSER, 
          responsável pelo gerenciamento completo do ciclo de vida de vouchers financeiros.
        </p>
      </div>

      <div className="bg-card/60 border border-border/30 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
          Fluxo Operacional
        </h3>
        <div className="flex items-center justify-between gap-4">
          <FlowStep number={1} title="Operação" icon={FileText} />
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
          <FlowStep number={2} title="Fiscal" icon={CheckCircle} />
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
          <FlowStep number={3} title="Financeiro" icon={DollarSign} />
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
          <FlowStep number={4} title="Robô/RM" icon={Bot} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Principais Funcionalidades
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeatureCard icon={LayoutDashboard} title="Dashboard Operacional" description="Visão consolidada de todos os vouchers ativos" />
          <FeatureCard icon={Clock} title="Timeline em Tempo Real" description="Acompanhamento detalhado de cada evento" />
          <FeatureCard icon={AlertTriangle} title="Gestão de Urgências" description="3 níveis de urgência com aprovação de supervisor" />
          <FeatureCard icon={Bell} title="Notificações Inteligentes" description="Comunicação automática com gestores e equipe" />
        </div>
      </div>
    </div>
  );
}

function DashboardSection() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
      </div>

      <div className="bg-card/60 border border-border/30 rounded-xl p-6 space-y-4 backdrop-blur-sm">
        <h3 className="text-lg font-semibold">Visão Geral do Dashboard</h3>
        <p className="text-muted-foreground">
          O dashboard é a página inicial do sistema, oferecendo uma visão consolidada de todos os vouchers 
          e métricas importantes para acompanhamento.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Cards de Métricas
        </h3>
        <div className="bg-card/60 border border-border/30 rounded-xl p-6 space-y-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="font-medium">Total Monitorados:</span>
            <span className="text-muted-foreground">Vouchers ativos no sistema</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-warning" />
            <span className="font-medium">Em Alerta:</span>
            <span className="text-muted-foreground">Vencimento nas próximas 24h</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span className="font-medium">Críticos:</span>
            <span className="text-muted-foreground">Vouchers vencidos não concluídos</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FluxoVoucherSection() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Fluxo do Voucher</h2>
      </div>

      <div className="space-y-6">
        <div className="bg-card/60 border border-border/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/20">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">1. Operação</h3>
          </div>
          <ul className="space-y-2 text-muted-foreground ml-12">
            <li>• Criar voucher com informações básicas</li>
            <li>• Anexar documentos</li>
            <li>• Definir nível de urgência</li>
            <li>• Enviar para etapa Fiscal</li>
          </ul>
        </div>

        <div className="bg-card/60 border border-border/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-info/20">
              <CheckCircle className="h-5 w-5 text-info" />
            </div>
            <h3 className="text-lg font-semibold">2. Fiscal</h3>
          </div>
          <ul className="space-y-2 text-muted-foreground ml-12">
            <li>• Revisar documentação fiscal</li>
            <li>• Validar informações</li>
            <li>• Aprovar e enviar para Financeiro</li>
          </ul>
        </div>

        <div className="bg-card/60 border border-border/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-success/20">
              <DollarSign className="h-5 w-5 text-success" />
            </div>
            <h3 className="text-lg font-semibold">3. Financeiro</h3>
          </div>
          <ul className="space-y-2 text-muted-foreground ml-12">
            <li>• Processar pagamento</li>
            <li>• Anexar boleto</li>
            <li>• Enviar para Robô</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function UrgenciasSection() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Urgências e SLA</h2>
      </div>

      <div className="space-y-4">
        <div className="bg-card/60 border border-border/30 rounded-xl p-6 border-l-4 border-l-success backdrop-blur-sm">
          <h4 className="font-semibold text-success mb-2">Normal</h4>
          <p className="text-muted-foreground">Fluxo padrão do voucher.</p>
        </div>

        <div className="bg-card/60 border border-border/30 rounded-xl p-6 border-l-4 border-l-destructive backdrop-blur-sm">
          <h4 className="font-semibold text-destructive mb-2">Urgente Real</h4>
          <p className="text-muted-foreground">Requer autorização e aprovação do supervisor.</p>
        </div>

        <div className="bg-card/60 border border-border/30 rounded-xl p-6 border-l-4 border-l-warning backdrop-blur-sm">
          <h4 className="font-semibold text-warning mb-2">Urgente Automático</h4>
          <p className="text-muted-foreground">Atribuído automaticamente para ICMS e ARMAZENAGEM.</p>
        </div>
      </div>
    </div>
  );
}

function NotificacoesSection() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Notificações</h2>
      </div>

      <div className="bg-card/60 border border-border/30 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold mb-4">Sistema de Notificações por E-mail</h3>
        <p className="text-muted-foreground">
          O sistema envia notificações automáticas para os gestores responsáveis.
        </p>
      </div>

      <div className="grid gap-4">
        <FeatureCard icon={AlertTriangle} title="Alertas SLA" description="Enviados quando vouchers ficam parados" />
        <FeatureCard icon={Clock} title="Alertas de Vencimento" description="Enviados 24h antes do vencimento" />
        <FeatureCard icon={Send} title="Relatórios Diários" description="Enviados às 8:30h e 13:30h" />
      </div>
    </div>
  );
}

function PerfisSection() {
  const perfis = [
    { nome: "Operação", descricao: "Cria vouchers e envia para Fiscal", permissoes: ["Criar vouchers", "Anexar documentos"] },
    { nome: "Fiscal", descricao: "Valida documentação", permissoes: ["Revisar documentação", "Aprovar/Rejeitar"] },
    { nome: "Financeiro", descricao: "Processa pagamentos", permissoes: ["Processar pagamentos", "Baixa manual"] },
    { nome: "Admin", descricao: "Acesso total", permissoes: ["Todas as permissões"] },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Perfis e Permissões</h2>
      </div>

      <div className="grid gap-4">
        {perfis.map((perfil) => (
          <div key={perfil.nome} className="bg-card/60 border border-border/30 rounded-xl p-5 backdrop-blur-sm">
            <h4 className="font-semibold text-foreground mb-1">{perfil.nome}</h4>
            <p className="text-sm text-muted-foreground mb-3">{perfil.descricao}</p>
            <div className="flex flex-wrap gap-2">
              {perfil.permissoes.map((perm) => (
                <span key={perm} className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground">
                  {perm}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQSection() {
  const faqs = [
    { pergunta: "Como criar um voucher urgente?", resposta: "Selecione 'Urgente Real' ao criar e anexe a autorização." },
    { pergunta: "Como sei se um voucher está atrasado?", resposta: "Vouchers atrasados aparecem em vermelho no dashboard." },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <HelpCircle className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">FAQ</h2>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-card/60 border border-border/30 rounded-xl p-5 backdrop-blur-sm">
            <h4 className="font-semibold text-foreground mb-2">{faq.pergunta}</h4>
            <p className="text-sm text-muted-foreground">{faq.resposta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlossarioSection() {
  const termos = [
    { termo: "SPO", definicao: "Número de identificação único do voucher." },
    { termo: "Voucher", definicao: "Documento de solicitação de pagamento." },
    { termo: "SLA", definicao: "Service Level Agreement - tempo máximo por etapa." },
    { termo: "RM", definicao: "Sistema de gestão financeira integrado." },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <BookText className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Glossário</h2>
      </div>

      <div className="bg-card/60 border border-border/30 rounded-xl overflow-hidden backdrop-blur-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left p-4 font-semibold text-foreground">Termo</th>
              <th className="text-left p-4 font-semibold text-foreground">Definição</th>
            </tr>
          </thead>
          <tbody>
            {termos.map((item, index) => (
              <tr key={index} className="border-b border-border/30 last:border-0">
                <td className="p-4 font-medium text-primary">{item.termo}</td>
                <td className="p-4 text-muted-foreground">{item.definicao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
