import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Ship,
  FileText, 
  Upload, 
  HelpCircle, 
  BookText,
  ChevronRight,
  Search,
  FolderOpen,
  Play,
  Clock,
  CheckCircle2,
  ArrowRightLeft,
  Trash2,
  FileSpreadsheet,
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
  { id: 'manifest-hbl', title: 'Manifest → HBL', icon: <FileText className="h-4 w-4" /> },
  { id: 'hbl-mbl', title: 'HBL → MBL', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { id: 'invoices', title: 'Invoices Draft', icon: <Package className="h-4 w-4" /> },
  { id: 'cadastro', title: 'Cadastro de Arquivos', icon: <Upload className="h-4 w-4" /> },
  { id: 'submissao', title: 'Submissão e Análise', icon: <Play className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como fazer upload de um novo arquivo Manifest?', 
    a: 'Na aba Manifest → HBL, clique em "Cadastro de Manifest". Faça o upload do PDF ou Excel do Manifest e o sistema irá processar automaticamente.' 
  },
  { 
    q: 'O que significa status "Pendente"?', 
    a: 'Status pendente indica que o arquivo foi cadastrado mas ainda não passou pela análise de comparação. Clique em "Submeter" para iniciar a análise.' 
  },
  { 
    q: 'Como visualizar o histórico de análises?', 
    a: 'Clique no ícone de documento (FileText) na coluna de ações para abrir o modal de histórico com todas as análises realizadas.' 
  },
  { 
    q: 'Posso reprocessar um arquivo já analisado?', 
    a: 'Sim, clique novamente em "Submeter" para criar uma nova análise. O histórico anterior é mantido.' 
  },
  { 
    q: 'O que é a função Reextrair Metadados?', 
    a: 'Disponível para admins/devs, força a reextração de metadados (consignee, container) de todos os arquivos base usando IA.' 
  },
  { 
    q: 'Como excluir um item cadastrado?', 
    a: 'Clique no ícone de lixeira (vermelho) na coluna de ações. Uma confirmação será solicitada antes da exclusão permanente.' 
  },
];

const glossaryItems = [
  { term: 'HBL', definition: 'House Bill of Lading - Conhecimento de embarque emitido pelo freight forwarder.' },
  { term: 'MBL', definition: 'Master Bill of Lading - Conhecimento de embarque emitido pela companhia marítima.' },
  { term: 'Manifest', definition: 'Documento que lista todas as cargas embarcadas em um navio.' },
  { term: 'Consignee', definition: 'Destinatário da carga, geralmente o importador.' },
  { term: 'Container', definition: 'Número de identificação do contêiner de transporte.' },
  { term: 'Draft Invoice', definition: 'Rascunho de fatura comercial para conferência antes da emissão final.' },
  { term: 'FCL', definition: 'Full Container Load - Contêiner cheio com carga de um único embarcador.' },
  { term: 'LCL', definition: 'Less than Container Load - Carga consolidada de múltiplos embarcadores.' },
  { term: 'ETD', definition: 'Estimated Time of Departure - Data estimada de partida.' },
  { term: 'ETA', definition: 'Estimated Time of Arrival - Data estimada de chegada.' },
];

export default function ManualSea() {
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
    <PageLayout 
      title="DACHSER" 
      subtitle="Manual do Usuário — Análise Documental SEA v1.0" 
      pageIcon={BookOpen}
      backTo="/sea/analysis"
    >
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
                  O <strong className="text-amber-300">SEA Analysis</strong> é um módulo de análise documental 
                  para operações de importação marítima. O sistema compara automaticamente documentos como 
                  Manifests, HBLs, MBLs e Invoices para identificar divergências e validar informações.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Ship className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Análise Marítima</h4>
                    <p className="text-xs text-white/60">Compare documentos de embarque marítimo</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <FileText className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Extração Automática</h4>
                    <p className="text-xs text-white/60">IA extrai dados de PDFs e planilhas</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <ArrowRightLeft className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Comparação Inteligente</h4>
                    <p className="text-xs text-white/60">Identifica divergências automaticamente</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-6">Tipos de Análise</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><strong>Manifest → HBL:</strong> Compara dados do Manifest com HBL para validação</li>
                  <li><strong>HBL → MBL:</strong> Cruza informações entre House e Master BL</li>
                  <li><strong>Invoices Draft:</strong> Analisa rascunhos de faturas comerciais</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Manifest HBL */}
          <section ref={el => sectionRefs.current['manifest-hbl'] = el} id="manifest-hbl">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-400" />
                  Manifest → HBL
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Esta aba permite comparar dados do Manifest de carga com os House Bills of Lading (HBL) 
                  para garantir consistência nas informações de embarque.
                </p>

                <h4 className="text-white font-medium mt-4">Campos Comparados</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-white/5">
                    <p className="text-xs text-white/50">Consignee</p>
                    <p className="text-sm font-medium text-white">Destinatário</p>
                  </div>
                  <div className="p-3 rounded bg-white/5">
                    <p className="text-xs text-white/50">Container</p>
                    <p className="text-sm font-medium text-white">Nº Contêiner</p>
                  </div>
                  <div className="p-3 rounded bg-white/5">
                    <p className="text-xs text-white/50">Weight</p>
                    <p className="text-sm font-medium text-white">Peso</p>
                  </div>
                  <div className="p-3 rounded bg-white/5">
                    <p className="text-xs text-white/50">Packages</p>
                    <p className="text-sm font-medium text-white">Volumes</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Fluxo de Trabalho</h4>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Badge className="bg-blue-500">Upload Manifest</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-purple-500">Extração IA</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-amber-500">Comparação</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-green-500">Resultado</Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* HBL MBL */}
          <section ref={el => sectionRefs.current['hbl-mbl'] = el} id="hbl-mbl">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-amber-400" />
                  HBL → MBL
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Compara os dados do House Bill of Lading com o Master Bill of Lading para 
                  validar a consolidação de cargas e informações do navio.
                </p>

                <h4 className="text-white font-medium mt-4">Validações Realizadas</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Número do HBL referenciado no MBL</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Consistência de peso e volumes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Dados do navio e viagem</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Porto de origem e destino</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Invoices */}
          <section ref={el => sectionRefs.current['invoices'] = el} id="invoices">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Package className="h-5 w-5 text-amber-400" />
                  Invoices Draft
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Módulo para análise de rascunhos de faturas comerciais (Commercial Invoices), 
                  validando valores, descrições e informações do importador.
                </p>

                <h4 className="text-white font-medium mt-4">Campos Analisados</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-white font-medium text-sm">Dados Comerciais</p>
                    <p className="text-xs text-white/60">Valor, moeda, Incoterm, condições</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-white font-medium text-sm">Descrição de Mercadoria</p>
                    <p className="text-xs text-white/60">NCM, descrição, quantidade, unidade</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-white font-medium text-sm">Partes Envolvidas</p>
                    <p className="text-xs text-white/60">Exportador, importador, notify</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <p className="text-white font-medium text-sm">Dados de Embarque</p>
                    <p className="text-xs text-white/60">Origem, destino, container</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Cadastro */}
          <section ref={el => sectionRefs.current['cadastro'] = el} id="cadastro">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Upload className="h-5 w-5 text-amber-400" />
                  Cadastro de Arquivos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O cadastro de arquivos é o primeiro passo do fluxo. Faça upload dos documentos 
                  base que serão utilizados nas análises de comparação.
                </p>

                <h4 className="text-white font-medium mt-4">Formatos Suportados</h4>
                <div className="flex gap-3">
                  <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">PDF</Badge>
                  <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">XLSX</Badge>
                  <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/30">XLS</Badge>
                  <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30">CSV</Badge>
                </div>

                <h4 className="text-white font-medium mt-4">Passo a Passo</h4>
                <ol className="space-y-2 text-sm list-decimal list-inside">
                  <li>Selecione a aba correspondente ao tipo de análise</li>
                  <li>Clique em "Cadastro de Manifest" ou "Cadastro de HBL"</li>
                  <li>Arraste o arquivo ou clique para selecionar</li>
                  <li>Aguarde o processamento e extração de metadados</li>
                  <li>O item aparecerá na lista com status "Pendente"</li>
                </ol>
              </CardContent>
            </Card>
          </section>

          {/* Submissão */}
          <section ref={el => sectionRefs.current['submissao'] = el} id="submissao">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Play className="h-5 w-5 text-amber-400" />
                  Submissão e Análise
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Após cadastrar o arquivo base, você pode submetê-lo para análise de comparação 
                  com outros documentos relacionados.
                </p>

                <h4 className="text-white font-medium mt-4">Ações Disponíveis</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                    <Play className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Submeter</p>
                      <p className="text-xs text-white/60">Inicia nova análise de comparação</p>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
                    <FileText className="h-5 w-5 text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Histórico</p>
                      <p className="text-xs text-white/60">Visualiza análises anteriores</p>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
                    <FolderOpen className="h-5 w-5 text-purple-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Ver Arquivos</p>
                      <p className="text-xs text-white/60">Lista arquivos anexados (admin)</p>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                    <Trash2 className="h-5 w-5 text-rose-400 mt-0.5" />
                    <div>
                      <p className="text-white font-medium text-sm">Excluir</p>
                      <p className="text-xs text-white/60">Remove o item permanentemente</p>
                    </div>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Status das Análises</h4>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Badge className="bg-amber-500">Pendente</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-blue-500">Processando</Badge>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                  <Badge className="bg-green-500">Concluído</Badge>
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
