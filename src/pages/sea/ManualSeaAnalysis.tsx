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
  CheckCircle2,
  Trash2,
  Eye,
  Filter,
  Download,
  LayoutGrid,
  RefreshCw,
  Settings
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
  { id: 'tabela-itens', title: 'Tabela de Itens', icon: <FileText className="h-4 w-4" /> },
  { id: 'filtros', title: 'Filtros e Busca', icon: <Filter className="h-4 w-4" /> },
  { id: 'upload', title: 'Upload de Arquivos', icon: <Upload className="h-4 w-4" /> },
  { id: 'tipos-analise', title: 'Tipos de Análise', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'submissao', title: 'Submissão e Análise', icon: <Play className="h-4 w-4" /> },
  { id: 'historico', title: 'Histórico', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'exportacao', title: 'Exportação', icon: <Download className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como fazer upload de um novo arquivo?', 
    a: 'Clique no botão de upload ou arraste o arquivo para a área indicada. São aceitos PDFs e planilhas Excel (XLSX, XLS).' 
  },
  { 
    q: 'O que significa status "Pendente"?', 
    a: 'Status pendente indica que o arquivo foi cadastrado mas ainda não passou pela análise. Clique em "Submeter" para iniciar.' 
  },
  { 
    q: 'Como visualizar o histórico de análises?', 
    a: 'Clique no ícone de documento na coluna de ações para abrir o modal com todas as análises realizadas.' 
  },
  { 
    q: 'Posso reprocessar um arquivo já analisado?', 
    a: 'Sim, clique novamente em "Submeter" para criar uma nova análise. O histórico anterior é mantido.' 
  },
  { 
    q: 'Como excluir um item cadastrado?', 
    a: 'Clique no ícone de lixeira vermelha na coluna de ações. Uma confirmação será solicitada.' 
  },
  { 
    q: 'Como exportar os dados para Excel?', 
    a: 'Clique no botão "Exportar" no cabeçalho da tabela. Será gerado um arquivo Excel com todos os itens visíveis.' 
  },
  { 
    q: 'Qual a diferença entre os tipos de análise?', 
    a: 'Manifest × HBL compara manifesto com HBLs, HBL × MBL compara conhecimentos house com master, e Invoices × HBL compara faturas com HBLs.' 
  },
  { 
    q: 'Como usar os filtros de período?', 
    a: 'Use os filtros de período (7, 30 ou 90 dias) para ver apenas itens cadastrados dentro do intervalo selecionado.' 
  },
  { 
    q: 'O que é "Reextrair metadados"?', 
    a: 'Função administrativa que reprocessa a extração automática de dados (MBL, armador, consignee) dos arquivos cadastrados.' 
  },
];

const glossaryItems = [
  { term: 'HBL', definition: 'House Bill of Lading - Conhecimento de embarque emitido pelo freight forwarder para o importador.' },
  { term: 'MBL', definition: 'Master Bill of Lading - Conhecimento de embarque emitido pela companhia marítima (armador).' },
  { term: 'Manifest', definition: 'Documento que lista todas as cargas embarcadas em um navio, geralmente em formato Excel.' },
  { term: 'Consignee', definition: 'Destinatário da carga, geralmente o importador ou seu representante.' },
  { term: 'Container', definition: 'Número de identificação único do contêiner de transporte marítimo.' },
  { term: 'Armador', definition: 'Companhia marítima responsável pelo transporte do navio (ex: MSC, Maersk, Hapag-Lloyd).' },
  { term: 'Data Atracação', definition: 'Data prevista ou efetiva de chegada do navio ao porto de destino.' },
  { term: 'Invoice', definition: 'Fatura comercial emitida pelo exportador, contendo valores e descrição das mercadorias.' },
  { term: 'Draft HBL', definition: 'Versão preliminar do House Bill of Lading, antes da emissão final.' },
];

export default function ManualSeaAnalysis() {
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
    <PageLayout title="DACHSER" subtitle="Manual — Análise Documental SEA v2.0" backTo="/sea/analysis" pageIcon={BookOpen}>
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
                  A tela <strong className="text-amber-300">Análise Documental SEA</strong> é a central 
                  de gerenciamento de documentos marítimos, permitindo upload, análise e comparação 
                  de documentos como HBL, MBL, Manifests e Invoices.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Upload className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Upload</h4>
                    <p className="text-xs text-white/60">Cadastre novos documentos (PDF, Excel)</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Play className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Análise</h4>
                    <p className="text-xs text-white/60">Compare documentos automaticamente</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Download className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Exportação</h4>
                    <p className="text-xs text-white/60">Exporte resultados para Excel</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-6">Tipos de Análise Disponíveis</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-blue-500">Manifest × HBL</Badge>
                  <Badge className="bg-purple-500">HBL × MBL</Badge>
                  <Badge className="bg-amber-500">Invoices × HBL</Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tabela de Itens */}
          <section ref={el => sectionRefs.current['tabela-itens'] = el} id="tabela-itens">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-400" />
                  Tabela de Itens
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tabela principal exibe todos os documentos cadastrados com as seguintes colunas:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Arquivo:</strong> Nome do arquivo enviado (PDF ou Excel)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>MBL:</strong> Número do Master Bill of Lading extraído automaticamente</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Armador:</strong> Companhia marítima identificada no documento</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Consignee:</strong> Nome do destinatário/importador</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Container:</strong> Número do contêiner de transporte</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Data Atracação:</strong> Data prevista de chegada do navio</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Status:</strong> Estado atual do processamento (Pendente, Analisado, Erro)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Ações:</strong> Submeter, ver arquivos, histórico, excluir</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-300">
                    <strong>Contador de Pendentes:</strong> O cabeçalho da tabela exibe a quantidade de itens 
                    com status "Pendente", facilitando a identificação de documentos que precisam de análise.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Filtros e Busca */}
          <section ref={el => sectionRefs.current['filtros'] = el} id="filtros">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Filter className="h-5 w-5 text-amber-400" />
                  Filtros e Busca
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Utilize os filtros disponíveis para localizar documentos específicos:
                </p>

                <div className="space-y-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Search className="h-4 w-4 text-amber-400" />
                      <span className="text-white font-medium text-sm">Busca por Texto</span>
                    </div>
                    <p className="text-xs text-white/60">
                      Pesquise por nome do arquivo, consignee, container ou MBL. 
                      A busca é realizada em tempo real conforme você digita.
                    </p>
                  </div>

                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Filter className="h-4 w-4 text-amber-400" />
                      <span className="text-white font-medium text-sm">Filtro por Status</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">Todos</Badge>
                      <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Pendente</Badge>
                      <Badge variant="outline" className="text-xs bg-green-500/20 text-green-300 border-green-500/30">Analisado</Badge>
                      <Badge variant="outline" className="text-xs bg-red-500/20 text-red-300 border-red-500/30">Erro</Badge>
                    </div>
                  </div>

                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <FolderOpen className="h-4 w-4 text-amber-400" />
                      <span className="text-white font-medium text-sm">Filtro por Período</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">Últimos 7 dias</Badge>
                      <Badge variant="outline" className="text-xs">Últimos 30 dias</Badge>
                      <Badge variant="outline" className="text-xs">Últimos 90 dias</Badge>
                    </div>
                    <p className="text-xs text-white/60 mt-2">
                      Filtra itens pela data de cadastro dentro do período selecionado.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Upload de Arquivos */}
          <section ref={el => sectionRefs.current['upload'] = el} id="upload">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Upload className="h-5 w-5 text-amber-400" />
                  Upload de Arquivos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Faça upload de documentos para análise:
                </p>

                <h4 className="text-white font-medium mt-4">Formatos Aceitos</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-center">
                    <Badge className="bg-red-500">PDF</Badge>
                    <p className="text-xs text-white/60 mt-1">Documentos escaneados</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20 text-center">
                    <Badge className="bg-green-500">XLSX</Badge>
                    <p className="text-xs text-white/60 mt-1">Planilhas Excel</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20 text-center">
                    <Badge className="bg-purple-500">XLS</Badge>
                    <p className="text-xs text-white/60 mt-1">Excel antigo</p>
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  {[
                    'Clique no botão de upload ou arraste o arquivo',
                    'O sistema extrai automaticamente os metadados (MBL, Armador, Consignee)',
                    'Verifique se os dados foram identificados corretamente',
                    'Submeta para análise quando estiver pronto'
                  ].map((etapa, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{etapa}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Tipos de Análise */}
          <section ref={el => sectionRefs.current['tipos-analise'] = el} id="tipos-analise">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-amber-400" />
                  Tipos de Análise
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O sistema oferece 3 tipos de análise documental, cada um com propósito específico:
                </p>

                <div className="space-y-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-blue-500">Manifest × HBL</Badge>
                    </div>
                    <p className="text-xs text-white/70">
                      Compara o manifesto de carga (Excel) com os HBLs cadastrados. 
                      Identifica divergências em quantidades, pesos e descrições de mercadorias.
                    </p>
                    <ul className="text-xs text-white/60 mt-2 space-y-1">
                      <li>• Upload: Arquivo Excel do manifesto</li>
                      <li>• Comparação: Dados do manifesto vs HBLs</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-purple-500">HBL × MBL</Badge>
                    </div>
                    <p className="text-xs text-white/70">
                      Compara House Bill of Lading com Master Bill of Lading. 
                      Verifica consistência entre conhecimentos emitidos pelo forwarder e armador.
                    </p>
                    <ul className="text-xs text-white/60 mt-2 space-y-1">
                      <li>• Valida dados de embarque</li>
                      <li>• Identifica erros de digitação</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-amber-500">Invoices × HBL</Badge>
                    </div>
                    <p className="text-xs text-white/70">
                      Compara faturas comerciais (Invoices) com os HBLs. 
                      Verifica valores, quantidades e descrições das mercadorias.
                    </p>
                    <ul className="text-xs text-white/60 mt-2 space-y-1">
                      <li>• Validação de valores comerciais</li>
                      <li>• Conferência de descrições</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Submissão e Análise */}
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
                  Após o upload, submeta os documentos para análise:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Clique no botão <Play className="h-4 w-4 inline text-amber-400" /> "Submeter" na coluna de ações</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Selecione o tipo de análise desejado</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Aguarde o processamento (pode levar alguns segundos)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Visualize o resultado na tela de comparação</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    <strong>Dica:</strong> Você pode resubmeter um documento quantas vezes quiser. 
                    Cada análise é salva no histórico para consulta posterior.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Histórico */}
          <section ref={el => sectionRefs.current['historico'] = el} id="historico">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-amber-400" />
                  Histórico
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Acesse o histórico de análises de cada documento:
                </p>

                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <Eye className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <span>Clique no ícone de histórico para ver todas as análises realizadas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Visualize resultados de análises anteriores</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Compare resultados entre análises diferentes</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Exportação */}
          <section ref={el => sectionRefs.current['exportacao'] = el} id="exportacao">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Download className="h-5 w-5 text-amber-400" />
                  Exportação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Exporte os dados da tabela para análise externa:
                </p>

                <div className="space-y-3">
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Download className="h-4 w-4 text-green-400" />
                      <span className="text-white font-medium text-sm">Exportar para Excel</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Clique no botão "Exportar" no cabeçalho da tabela para gerar um arquivo Excel 
                      com todos os itens visíveis (respeitando os filtros aplicados).
                    </p>
                  </div>

                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="h-4 w-4 text-blue-400" />
                      <span className="text-white font-medium text-sm">Ver Arquivos</span>
                    </div>
                    <p className="text-xs text-white/70">
                      Visualize os arquivos originais anexados a cada item diretamente no navegador.
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded bg-slate-500/10 border border-slate-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300 font-medium text-sm">Funções Administrativas</span>
                  </div>
                  <p className="text-xs text-white/60">
                    Usuários com perfil administrativo têm acesso a funções adicionais como 
                    "Reextrair metadados" (reprocessar extração de MBL, armador, etc.) e 
                    visualização detalhada de arquivos.
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
