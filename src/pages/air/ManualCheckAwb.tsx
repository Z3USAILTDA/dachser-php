import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  Search as SearchIcon, 
  FileCheck, 
  Upload, 
  AlertTriangle, 
  HelpCircle, 
  BookText,
  ChevronRight,
  CheckCircle2,
  XCircle,
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
  { id: 'validacao', title: 'Validação de AWB', icon: <FileCheck className="h-4 w-4" /> },
  { id: 'upload', title: 'Upload de Documentos', icon: <Upload className="h-4 w-4" /> },
  { id: 'matriz-regras', title: 'Matriz de Regras', icon: <Settings className="h-4 w-4" /> },
  { id: 'resultados', title: 'Resultados', icon: <CheckCircle2 className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como validar um AWB?', 
    a: 'Faça upload do documento AWB (PDF ou imagem) e o sistema extrairá automaticamente os dados para validação contra a matriz de regras.' 
  },
  { 
    q: 'Quais formatos de arquivo são aceitos?', 
    a: 'São aceitos arquivos PDF, PNG, JPG e JPEG. O sistema usa OCR para extrair dados de imagens.' 
  },
  { 
    q: 'Como funciona a matriz de regras?', 
    a: 'A matriz define combinações válidas de CNPJ, origem, destino e consignatário. Administradores podem gerenciar as regras.' 
  },
  { 
    q: 'O que significa "Compatível" vs "Incompatível"?', 
    a: 'Compatível indica que os dados do AWB correspondem a uma regra na matriz. Incompatível significa que não há correspondência.' 
  },
  { 
    q: 'Posso validar múltiplos documentos de uma vez?', 
    a: 'Sim, você pode fazer upload de múltiplos arquivos. O sistema processa cada um e exibe os resultados em lista.' 
  },
  { 
    q: 'Como exportar os resultados?', 
    a: 'Use o botão "Exportar para MariaDB" para salvar os resultados no banco de dados para relatórios futuros.' 
  },
];

const glossaryItems = [
  { term: 'AWB', definition: 'Air Waybill - Conhecimento de transporte aéreo.' },
  { term: 'HAWB', definition: 'House Air Waybill - AWB emitido pelo agente de carga.' },
  { term: 'CNPJ', definition: 'Cadastro Nacional da Pessoa Jurídica - identificador único de empresas no Brasil.' },
  { term: 'Consignatário', definition: 'Destinatário da carga, pessoa ou empresa que recebe a mercadoria.' },
  { term: 'Matriz de Regras', definition: 'Tabela que define combinações válidas para validação de documentos.' },
  { term: 'OCR', definition: 'Optical Character Recognition - tecnologia para extrair texto de imagens.' },
];

export default function ManualCheckAwb() {
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
    <PageLayout title="DACHSER" subtitle="Manual — Check AWB v1.0" backTo="/air/check" pageIcon={BookOpen}>
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
                  A tela <strong className="text-amber-300">Check AWB</strong> permite validar documentos 
                  de conhecimento aéreo (AWB/HAWB) contra uma matriz de regras, verificando se as combinações 
                  de CNPJ, origem, destino e consignatário são válidas.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Upload className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Upload</h4>
                    <p className="text-xs text-white/60">Faça upload de PDFs ou imagens</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <FileCheck className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Validação</h4>
                    <p className="text-xs text-white/60">Extração e validação automática</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Settings className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Regras</h4>
                    <p className="text-xs text-white/60">Gerencie a matriz de regras</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Validação de AWB */}
          <section ref={el => sectionRefs.current['validacao'] = el} id="validacao">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-amber-400" />
                  Validação de AWB
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O processo de validação extrai automaticamente os dados do documento e compara com a matriz de regras:
                </p>

                <div className="space-y-2">
                  {[
                    'Sistema extrai o número do AWB do documento',
                    'Identifica CNPJ do consignatário',
                    'Detecta aeroportos de origem e destino',
                    'Compara com regras ativas na matriz',
                    'Exibe resultado: Compatível ou Incompatível'
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

          {/* Upload de Documentos */}
          <section ref={el => sectionRefs.current['upload'] = el} id="upload">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Upload className="h-5 w-5 text-amber-400" />
                  Upload de Documentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Faça upload de documentos para validação:
                </p>

                <h4 className="text-white font-medium mt-4">Formatos Aceitos</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20 text-center">
                    <Badge className="bg-blue-500">PDF</Badge>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20 text-center">
                    <Badge className="bg-green-500">PNG</Badge>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20 text-center">
                    <Badge className="bg-purple-500">JPG</Badge>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-center">
                    <Badge className="bg-amber-500">JPEG</Badge>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Como Fazer Upload</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Arraste e solte arquivos na área indicada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Ou clique para selecionar do computador</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Múltiplos arquivos são processados em sequência</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Matriz de Regras */}
          <section ref={el => sectionRefs.current['matriz-regras'] = el} id="matriz-regras">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Settings className="h-5 w-5 text-amber-400" />
                  Matriz de Regras
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A matriz de regras define quais combinações de dados são válidas. Apenas administradores 
                  podem gerenciar as regras.
                </p>

                <h4 className="text-white font-medium mt-4">Campos da Regra</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>CNPJ:</strong> CNPJ do importador/consignatário</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Origem:</strong> Código IATA do aeroporto de origem</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Destino:</strong> Código IATA do aeroporto de destino</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Consignatário:</strong> Nome ou padrão do consignatário</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span><strong>Status:</strong> Ativo ou Inativo</span>
                  </li>
                </ul>

                <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    <strong>Dica:</strong> Use wildcards (*) para padrões flexíveis no campo consignatário.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Resultados */}
          <section ref={el => sectionRefs.current['resultados'] = el} id="resultados">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-amber-400" />
                  Resultados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Após a validação, o sistema exibe os resultados na tabela principal:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                      <span className="text-white font-medium">Compatível</span>
                    </div>
                    <p className="text-xs text-white/60">Os dados correspondem a uma regra ativa na matriz</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-5 w-5 text-red-400" />
                      <span className="text-white font-medium">Incompatível</span>
                    </div>
                    <p className="text-xs text-white/60">Não há regra correspondente ou a validação falhou</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Ações Disponíveis</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Visualizar detalhes da validação</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Exportar resultados para MariaDB</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Reprocessar documentos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Excluir registros</span>
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
