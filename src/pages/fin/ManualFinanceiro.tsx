import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  DollarSign, 
  FileText, 
  Calendar, 
  AlertTriangle, 
  HelpCircle, 
  BookText,
  ChevronRight,
  Search,
  CheckCircle2,
  Calculator,
  Receipt,
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
  { id: 'regua', title: 'Régua de Cobrança', icon: <Calendar className="h-4 w-4" /> },
  { id: 'disputa', title: 'Disputa Financeira', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'analise-documental', title: 'Análise Documental', icon: <FileText className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'O que é a régua de cobrança?', 
    a: 'A régua de cobrança é um painel que exibe as faturas por estágio de vencimento (a vencer, vencidas, em atraso), permitindo acompanhar o fluxo de recebimentos.' 
  },
  { 
    q: 'Como abrir uma disputa?', 
    a: 'Na tela de Disputa Financeira, clique em "Nova Disputa", selecione a fatura em questão, descreva o motivo e anexe documentos comprobatórios.' 
  },
  { 
    q: 'Quais documentos podem ser analisados?', 
    a: 'O sistema analisa faturas (PDF), planilhas de cobrança (Excel) e documentos de embarque para comparação automatizada.' 
  },
  { 
    q: 'Como funciona a comparação de documentos?', 
    a: 'O sistema extrai dados dos documentos usando IA e compara valores, datas e informações-chave, destacando divergências automaticamente.' 
  },
  { 
    q: 'Posso exportar relatórios financeiros?', 
    a: 'Sim, todas as telas possuem opção de exportação para Excel e PDF com os dados filtrados.' 
  },
];

const glossaryItems = [
  { term: 'NF', definition: 'Nota Fiscal - Documento que comprova a venda de mercadoria ou serviço.' },
  { term: 'Boleto', definition: 'Documento de cobrança bancária para pagamento de valores.' },
  { term: 'DANFE', definition: 'Documento Auxiliar da Nota Fiscal Eletrônica.' },
  { term: 'Accrual', definition: 'Provisão contábil de despesas ou receitas ainda não realizadas.' },
  { term: 'SPO', definition: 'Número do processo de importação usado como identificador.' },
  { term: 'Remessa', definition: 'Conjunto de documentos enviados para pagamento.' },
  { term: 'Vencimento', definition: 'Data limite para pagamento de um título.' },
  { term: 'Disputa', definition: 'Contestação de valores ou condições de uma cobrança.' },
];

export default function ManualFinanceiro() {
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
    <PageLayout title="DACHSER" subtitle="Manual do Usuário — Financeiro v1.0" backTo="/dashboard" pageIcon={BookOpen}>
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
                  O módulo <strong className="text-amber-300">Financeiro</strong> oferece ferramentas para 
                  gestão de cobranças, análise de documentos fiscais e resolução de disputas, 
                  automatizando processos e garantindo maior controle financeiro.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <DollarSign className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Cobranças</h4>
                    <p className="text-xs text-white/60">Acompanhe vencimentos e pagamentos</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <FileText className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Documentos</h4>
                    <p className="text-xs text-white/60">Análise automatizada de faturas</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Disputas</h4>
                    <p className="text-xs text-white/60">Gestão de contestações</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Régua de Cobrança */}
          <section ref={el => sectionRefs.current['regua'] = el} id="regua">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-amber-400" />
                  Régua de Cobrança
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A régua de cobrança organiza as faturas por estágio de vencimento, 
                  permitindo priorizar ações de cobrança e acompanhar o fluxo de caixa.
                </p>

                <h4 className="text-white font-medium mt-4">Estágios de Vencimento</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge className="bg-green-500 mb-2">A Vencer</Badge>
                    <p className="text-xs text-white/60">Dentro do prazo</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">Vence Hoje</Badge>
                    <p className="text-xs text-white/60">Vencimento no dia</p>
                  </div>
                  <div className="p-3 rounded bg-orange-500/10 border border-orange-500/20">
                    <Badge className="bg-orange-500 mb-2">Vencido</Badge>
                    <p className="text-xs text-white/60">1-30 dias atraso</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <Badge className="bg-red-500 mb-2">Crítico</Badge>
                    <p className="text-xs text-white/60">+30 dias atraso</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Filtros por cliente, período e valor</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Exportação para Excel e PDF</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Totalizadores por estágio</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Disputa Financeira */}
          <section ref={el => sectionRefs.current['disputa'] = el} id="disputa">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Disputa Financeira
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Gerencie contestações de cobranças, acompanhe o status de cada disputa 
                  e mantenha histórico completo das tratativas.
                </p>

                <h4 className="text-white font-medium mt-4">Status de Disputa</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded bg-blue-500/10">
                    <Badge className="bg-blue-500">ABERTA</Badge>
                    <span className="text-sm">Disputa registrada, aguardando análise</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-amber-500/10">
                    <Badge className="bg-amber-500">EM_ANALISE</Badge>
                    <span className="text-sm">Em análise pelo time financeiro</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-purple-500/10">
                    <Badge className="bg-purple-500">AGUARD_CLIENTE</Badge>
                    <span className="text-sm">Aguardando documentos do cliente</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-green-500/10">
                    <Badge className="bg-green-500">RESOLVIDA</Badge>
                    <span className="text-sm">Disputa encerrada com resolução</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Análise Documental */}
          <section ref={el => sectionRefs.current['analise-documental'] = el} id="analise-documental">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-400" />
                  Análise Documental
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Compare automaticamente documentos fiscais e de embarque, 
                  identificando divergências de valores, datas e informações.
                </p>

                <h4 className="text-white font-medium mt-4">Tipos de Análise</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <Receipt className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">Fatura vs Contrato</p>
                    <p className="text-xs text-white/60">Valida valores cobrados</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <Calculator className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">NF vs Planilha</p>
                    <p className="text-xs text-white/60">Confere totais e itens</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Como Usar</h4>
                <div className="space-y-2">
                  {['1. Upload do documento base (PDF)', '2. Upload do documento comparativo', '3. Aguarde processamento da IA', '4. Revise divergências encontradas'].map((etapa, i) => (
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
