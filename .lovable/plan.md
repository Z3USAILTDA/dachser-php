# Relatório técnico — Análises Documentais (PDF)

## Escopo
Documentar TODOS os módulos de análise documental do projeto, cobrindo as 12 fases do prompt mestre, com consultas reais ao MariaDB para volumes e exemplos. Entrega: PDF em `/mnt/documents/`.

## Módulos a cobrir
1. **CHB — Conferência de Despacho** (`ConferenciaChb.tsx`) — 3 etapas: Pré-Alerta, Draft DI, DI Registrada
2. **SEA — Análise Marítima** (`SeaAnalysis.tsx`, `maritimo-analyze`) — Manifest × HBL × Invoice
3. **Análise Documental genérica** (`AnaliseDocumental.tsx`, `AnaliseDocumentalComparar.tsx`, `AnaliseDocumentalDetalhes.tsx`)
4. **Aéreo — Check AWB / Manual Tracking** (`CheckAwb.tsx`, `ManualCheckAwb.tsx`) — análise de documentos aéreos
5. **Submissão Manifest/HBL** (`SubmeterManifestHbl.tsx`, `SubmeterHblMbl.tsx`)
6. **Cadastro HBL / Manifest / BL** (`CadastroHbl.tsx`, `CadastroManifest.tsx`, `CadastroBl.tsx`) — extração via LLM
7. **Draft Exportação** (`DraftExportacao.tsx`) — análise de drafts multi-carrier
8. **Invoices Draft HBL** (`InvoicesDraftHbl.tsx`)

## Plano de execução (apenas leitura até gerar PDF)

### Fase A — Mapeamento de código (paralelo)
- Listar e ler edge functions: `extract-chb-file`, `analyze-chb-documents`, `chb-corrections`, `maritimo-analyze`, `sea-submit-analysis`, `analyze-chb-documents`, `extract-bl-data`, etc.
- Ler hooks: `useChbData`, `useChbCorrections`, `useChbClientConfig`, `useMaritimoItems`, `useMaritimoHistory`, `useDraftData`
- Ler páginas das 8 categorias acima
- Mapear tipos: `src/types/chb.ts`, `src/types/sea.ts`, `src/types/air.ts`, `src/types/draft.ts`

### Fase B — Schema MariaDB (via mariadb-proxy)
- `DESCRIBE` em todas as tabelas envolvidas:
  - CHB: `t_chb_runs`, `t_chb_extracted_data`, `t_chb_corrections`, `t_chb_extraction_rules`, `t_chb_client_config`, `t_chb_documentos`, `t_chb_processos`
  - SEA: `t_sea_analysis_runs`, `t_sea_manifest_hbl_*`, `t_maritimo_*`
  - Análise documental: `t_analise_documental_*`
  - Cadastros: `t_cadastro_hbl`, `t_cadastro_manifest`, `t_cadastro_bl`

### Fase C — Métricas reais (produção)
- Volume por mês/ano (últimos 12 meses) por módulo
- Tamanho médio (bytes) de payload extraído
- Distribuição de status / etapas
- Tempo médio de processamento (created_at → completed_at)
- Top 10 clientes/fornecedores por volume
- Taxa de fallback (Flash → Pro), taxa de correções manuais

### Fase D — Geração do PDF
Estrutura por módulo, cobrindo as **12 fases** do prompt:
- A. Identificação · B. Propósito · C. Campos de Entrada · D. Lógica · E. Saída · F. Estados · G. Permissões · H. Documentação · I. Integrações · J. Relatórios
- + Fluxos (Fase 3) · Dados técnicos (Fase 4) · Validações (Fase 5) · Performance (Fase 6) · Exemplos reais (Fase 7) · Histórico (Fase 8) · Integrações externas (Fase 9) · Configurações (Fase 10) · Segurança (Fase 11) · Doc existente (Fase 12)
- Diagramas Mermaid renderizados como imagem dentro do PDF (fluxos por módulo + arquitetura global)
- Tabelas de schema, exemplos de payload de entrada/saída, mensagens de erro reais

Gerado via **reportlab** (Platypus) — TOC, headers por módulo, tabelas com `WidthType.DXA`, code blocks monoespaçados.
QA visual: `pdftoppm -jpeg -r 150` em todas as páginas, revisão de overflow/clipping antes de entregar.

### Fase E — Entrega
- Arquivo: `/mnt/documents/analise_documental_relatorio_completo.pdf`
- Tag `<presentation-artifact>` para preview/download
- Resumo executivo (1 página) + ~8 módulos × ~6 páginas cada = ~50 páginas

## Estimativa
~25-40 chamadas de leitura (código + DB) antes de gerar o PDF. Sem mudanças no código da aplicação. Sem migrations.