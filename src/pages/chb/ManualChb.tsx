import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { 
  BookOpen, 
  LayoutDashboard, 
  FileCheck, 
  AlertTriangle, 
  Upload, 
  CheckCircle2, 
  HelpCircle, 
  BookText,
  ChevronRight,
  Search,
  Ship,
  FileText,
  Eye
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
  { id: 'lista-analises', title: 'Lista de Análises', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'sop', title: 'SOP por Cliente', icon: <FileCheck className="h-4 w-4" /> },
  { id: 'conferencia', title: 'Conferência', icon: <FileCheck className="h-4 w-4" /> },
  { id: 'upload-docs', title: 'Upload de Documentos', icon: <Upload className="h-4 w-4" /> },
  { id: 'resultados', title: 'Resultados', icon: <Eye className="h-4 w-4" /> },
  { id: 'faq', title: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'glossario', title: 'Glossário', icon: <BookText className="h-4 w-4" /> },
];

const faqItems = [
  { 
    q: 'Como iniciar uma nova conferência?', 
    a: 'Na lista de análises, clique em "Novo Processo" para criar uma conferência. Informe a referência do processo e será redirecionado para a tela de conferência.' 
  },
  { 
    q: 'Quais documentos são aceitos?', 
    a: 'O sistema aceita arquivos PDF, imagens (PNG, JPG, JPEG, WebP) e planilhas Excel (XLSX, XLS) para documentos de embarque como BL, Invoice e Packing List.' 
  },
  { 
    q: 'Como funciona a análise automática?', 
    a: 'O sistema utiliza IA para extrair informações dos documentos e comparar com os dados esperados, identificando divergências automaticamente. A IA reconhece texto em imagens e extrai dados de planilhas.' 
  },
  { 
    q: 'O que fazer quando há divergência?', 
    a: 'Revise os campos marcados com indicador vermelho (🔴), verifique os documentos originais e considere as observações da IA. Você pode re-analisar após corrigir os documentos.' 
  },
  { 
    q: 'Como exportar os resultados?', 
    a: 'No histórico de análises aprovadas, clique no botão "PDF" para exportar um relatório completo da conferência com todos os campos analisados.' 
  },
  { 
    q: 'O que é o SOP por Cliente?', 
    a: 'SOP (Standard Operating Procedure) permite configurar regras específicas por cliente, como tolerâncias de peso/valor, campos obrigatórios, regras fiscais e instruções personalizadas para a análise.' 
  },
  { 
    q: 'Como a IA identifica o cliente automaticamente?', 
    a: 'Durante a primeira análise, a IA extrai o nome do consignatário/cliente dos documentos. Se houver um SOP configurado para esse cliente, as regras são aplicadas automaticamente nas próximas análises.' 
  },
  { 
    q: 'Posso re-analisar documentos?', 
    a: 'Sim, após aprovar uma análise ou identificar erros, você pode clicar em "Re-analisar" para executar novamente a conferência com os mesmos documentos ou adicionar novos.' 
  },
];

const glossaryItems = [
  { term: 'HBL', definition: 'House Bill of Lading - Conhecimento de embarque emitido pelo agente consolidador.' },
  { term: 'MBL', definition: 'Master Bill of Lading - Conhecimento principal emitido pelo armador.' },
  { term: 'BL', definition: 'Bill of Lading - Documento de transporte marítimo que comprova o embarque.' },
  { term: 'Consignee', definition: 'Consignatário - Destinatário da mercadoria indicado no conhecimento.' },
  { term: 'Shipper', definition: 'Embarcador - Remetente da mercadoria.' },
  { term: 'Container', definition: 'Unidade de carga padronizada para transporte de mercadorias.' },
  { term: 'TEU', definition: 'Twenty-foot Equivalent Unit - Unidade de medida de capacidade de containers.' },
  { term: 'FCL', definition: 'Full Container Load - Container completo de um único embarcador.' },
  { term: 'LCL', definition: 'Less than Container Load - Carga consolidada de múltiplos embarcadores.' },
  { term: 'Invoice', definition: 'Fatura comercial com descrição e valor das mercadorias.' },
  { term: 'SOP', definition: 'Standard Operating Procedure - Procedimento operacional padrão com regras específicas por cliente.' },
  { term: 'DI', definition: 'Declaração de Importação - Documento oficial de registro da importação junto à Receita Federal.' },
  { term: 'Packing List', definition: 'Romaneio de carga - Lista detalhada dos volumes e itens embarcados.' },
  { term: 'CFOP', definition: 'Código Fiscal de Operações e Prestações - Código que identifica a natureza da operação fiscal.' },
  { term: 'ICMS', definition: 'Imposto sobre Circulação de Mercadorias e Serviços - Imposto estadual sobre movimentação de mercadorias.' },
];

export default function ManualChb() {
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
    <PageLayout title="DACHSER" subtitle="Manual do Usuário — Conferência CHB v1.0" backTo="/chb/conferences" pageIcon={BookOpen}>
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
                  O módulo <strong className="text-amber-300">Conferência CHB</strong> automatiza a validação 
                  de documentos de embarque marítimo, utilizando inteligência artificial para extrair e comparar 
                  informações entre HBL, MBL, Invoice e Packing List.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <Ship className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Marítimo</h4>
                    <p className="text-xs text-white/60">Conferência especializada em documentos de importação marítima</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <FileCheck className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Validação</h4>
                    <p className="text-xs text-white/60">Comparação automática entre documentos</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" />
                    <h4 className="text-white font-medium mb-1">Divergências</h4>
                    <p className="text-xs text-white/60">Identificação automática de inconsistências</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Lista de Análises */}
          <section ref={el => sectionRefs.current['lista-analises'] = el} id="lista-analises">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-amber-400" />
                  Lista de Análises
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A lista de análises apresenta todas as conferências realizadas, permitindo filtrar por status 
                  e buscar por referência ou consignatário. Cada análise mostra o progresso das 3 etapas e o status atual.
                </p>

                <h4 className="text-white font-medium mt-4">Status das Análises</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <Badge className="bg-amber-500 mb-2">PRÉ-ALERTA PENDENTE</Badge>
                    <p className="text-xs text-white/60">Etapa 1 aguardando análise</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <Badge className="bg-blue-500 mb-2">INSTRUÇÃO PENDENTE</Badge>
                    <p className="text-xs text-white/60">Etapa 2 aguardando análise</p>
                  </div>
                  <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
                    <Badge className="bg-purple-500 mb-2">DI PENDENTE</Badge>
                    <p className="text-xs text-white/60">Etapa 3 aguardando análise</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <Badge className="bg-green-500 mb-2">CONCLUÍDA</Badge>
                    <p className="text-xs text-white/60">Todas as etapas aprovadas</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Funcionalidades</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Filtro por status (Pendente Pré-Alerta, Instrução, DI ou Concluída)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Busca por referência do processo ou nome do consignatário</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Criação de novo processo com referência personalizada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Visualização do histórico de análises aprovadas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Exportação do histórico em PDF</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Identificação automática do modal (Marítimo 🚢 ou Aéreo ✈️)</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* SOP por Cliente */}
          <section ref={el => sectionRefs.current['sop'] = el} id="sop">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-amber-400" />
                  SOP por Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O <strong className="text-amber-300">SOP (Standard Operating Procedure)</strong> permite configurar 
                  regras específicas de conferência para cada cliente. A IA utilizará essas regras durante a análise 
                  para validar campos de acordo com as particularidades de cada importador.
                </p>

                <h4 className="text-white font-medium mt-4">Como acessar</h4>
                <p className="text-sm">
                  Clique no botão <strong className="text-amber-300">"SOP"</strong> na barra de ações da lista de análises. 
                  Um painel lateral será aberto com todas as configurações cadastradas.
                </p>

                <h4 className="text-white font-medium mt-4">Configurações disponíveis</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <h5 className="text-white text-sm font-medium mb-1">Identificação</h5>
                    <p className="text-xs text-white/60">CNPJ e nome do cliente para associação automática</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <h5 className="text-white text-sm font-medium mb-1">Tolerâncias</h5>
                    <p className="text-xs text-white/60">Peso (kg), valor (%) e taxas acessórias aceitas</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <h5 className="text-white text-sm font-medium mb-1">Dados do Armador</h5>
                    <p className="text-xs text-white/60">Armador, agente de destino, porto e prazo de resposta</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <h5 className="text-white text-sm font-medium mb-1">Regras Fiscais</h5>
                    <p className="text-xs text-white/60">Benefício fiscal, CFOP, UF e ICMS diferido</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <h5 className="text-white text-sm font-medium mb-1">Campos Obrigatórios</h5>
                    <p className="text-xs text-white/60">Lista de campos que devem estar presentes nos documentos</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <h5 className="text-white text-sm font-medium mb-1">Instruções Personalizadas</h5>
                    <p className="text-xs text-white/60">Orientações adicionais em texto livre para a IA</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Associação automática</h4>
                <p className="text-sm">
                  Quando a IA identifica o cliente nos documentos (consignatário), ela busca automaticamente 
                  o SOP correspondente pelo CNPJ ou nome. Se encontrado, as regras são aplicadas e uma notificação 
                  é exibida indicando qual configuração foi carregada.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Conferência */}
          <section ref={el => sectionRefs.current['conferencia'] = el} id="conferencia">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-amber-400" />
                  Conferência
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  A tela de conferência é dividida em etapas para facilitar o processo de validação. 
                  Cada etapa corresponde a um tipo de documento a ser analisado.
                </p>

                <h4 className="text-white font-medium mt-4">Etapas da Conferência</h4>
                <div className="space-y-2">
                  {[
                    '1. Pré-Alerta - Recepção inicial e validação de documentos básicos',
                    '2. Instrução - Conferência de dados e envio de instruções ao despachante',
                    '3. DI/Fechamento - Validação final, registro da DI e conclusão do processo'
                  ].map((etapa, i) => (
                    <div key={etapa} className="flex items-center gap-3 p-2 rounded bg-white/5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300 font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm">{etapa.split('. ').slice(1).join('. ')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Upload de Documentos */}
          <section ref={el => sectionRefs.current['upload-docs'] = el} id="upload-docs">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Upload className="h-5 w-5 text-amber-400" />
                  Upload de Documentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  O upload de documentos é feito através de drag-and-drop ou clicando na área de upload. 
                  O sistema aceita múltiplos formatos e utiliza IA para extrair informações de todos eles.
                </p>

                <h4 className="text-white font-medium mt-4">Formatos Aceitos</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-sm font-medium text-white">PDF</p>
                    <p className="text-xs text-white/60">.pdf</p>
                  </div>
                  <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm font-medium text-white">Imagens</p>
                    <p className="text-xs text-white/60">.png, .jpg, .jpeg, .webp</p>
                  </div>
                  <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                    <p className="text-sm font-medium text-white">Planilhas Excel</p>
                    <p className="text-xs text-white/60">.xlsx, .xls</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Tipos de Documentos</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <FileText className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">House Bill of Lading (HBL)</p>
                    <p className="text-xs text-white/60">Conhecimento de embarque do consolidador</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <FileText className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">Master Bill of Lading (MBL)</p>
                    <p className="text-xs text-white/60">Conhecimento principal do armador</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <FileText className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">Invoice Comercial</p>
                    <p className="text-xs text-white/60">Fatura com valores e descrição das mercadorias</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <FileText className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">Packing List</p>
                    <p className="text-xs text-white/60">Romaneio com detalhes dos volumes</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <FileText className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">Certificados e Laudos</p>
                    <p className="text-xs text-white/60">Certificado de origem, fitossanitário, etc.</p>
                  </div>
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <FileText className="h-5 w-5 text-amber-400 mb-2" />
                    <p className="text-sm font-medium text-white">DI / Extrato DI</p>
                    <p className="text-xs text-white/60">Declaração de Importação e extratos</p>
                  </div>
                </div>

                <h4 className="text-white font-medium mt-4">Dicas de Upload</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Nomeie os arquivos de forma descritiva (ex: HBL_123456.pdf)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Imagens devem estar legíveis e com boa resolução</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Planilhas Excel são úteis para dados tabulares extensos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>Documentos são herdados entre etapas automaticamente</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Resultados */}
          <section ref={el => sectionRefs.current['resultados'] = el} id="resultados">
            <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Eye className="h-5 w-5 text-amber-400" />
                  Resultados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-white/80">
                <p>
                  Os resultados da conferência mostram a comparação campo a campo entre os documentos, 
                  destacando divergências e campos validados com sucesso.
                </p>

                <h4 className="text-white font-medium mt-4">Indicadores de Resultado</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded bg-green-500/10">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    <span className="text-sm">Campo validado - Dados conferem entre documentos</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-red-500/10">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <span className="text-sm">Divergência - Dados não conferem entre documentos</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-amber-500/10">
                    <HelpCircle className="h-5 w-5 text-amber-400" />
                    <span className="text-sm">Atenção - Campo requer revisão manual</span>
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
