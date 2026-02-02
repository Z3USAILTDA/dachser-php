
# Plano: Exportação Excel e PDF do Monitoramento de Dados

## Objetivo
Criar funcionalidade de exportação em Excel e PDF do painel de monitoramento de dados, com foco em apresentação executiva para gestores não-técnicos.

---

## Estrutura do Relatório (Linguagem Executiva)

### Terminologia Amigável
| Termo Técnico | Descrição Executiva |
|---------------|---------------------|
| t_master_dados | **Dados Operacionais** - Processos de importação e exportação |
| t_dados_financeiro_nfs | **Notas Fiscais** - Régua de cobrança |
| t_dados_financeiro_voucher | **Vouchers/SPO** - Esteira de pagamentos |
| tbaixas | **Baixas Financeiras** - Comprovantes processados |
| AIR IMPORT/EXPORT | Operações Aéreas |
| SEA IMPORT/EXPORT | Operações Marítimas |
| Saudável (verde) | Atualizado - Funcionando normalmente |
| Atenção (amarelo) | Verificar - Sem atualização recente |
| Crítico (vermelho) | Ação Necessária - Possível problema |

---

## Arquivos a Criar

### 1. `src/utils/dbMonitorExport.ts`
Utilitário de exportação com funções para Excel e PDF.

**Funções principais:**
- `exportDbMonitorPDF(stats, timestamp)` - Gera PDF executivo
- `exportDbMonitorExcel(stats, timestamp)` - Gera Excel com resumo

### 2. Modificar `src/pages/admin/DatabaseMonitor.tsx`
Adicionar botões de exportação no header da página.

---

## Conteúdo do PDF

### Página 1 - Resumo Executivo
- Cabeçalho com logo/branding DACHSER
- Data/hora do relatório
- **Painel de Indicadores:**
  - Total de Registros no Sistema
  - Tabelas Saudáveis / Com Atenção / Críticas
  - Registros Processados nas últimas 24h

### Página 2 - Situação por Área
Cards visuais para cada área:

```
┌─────────────────────────────────────────────────┐
│ 🟢 DADOS OPERACIONAIS                           │
│ Status: Atualizado                              │
│ Última atualização: há 3 minutos                │
│ Total de registros: 245.832                     │
│ Processados hoje: +1.234                        │
│                                                 │
│   Operações Aéreas: 123.456 registros           │
│   Operações Marítimas: 122.376 registros        │
└─────────────────────────────────────────────────┘
```

### Página 3 - Legenda e Observações
- Explicação dos status (verde/amarelo/vermelho)
- Critérios de classificação em linguagem simples
- Contato para suporte técnico

---

## Conteúdo do Excel

### Aba 1: "Resumo Executivo"
| Indicador | Valor |
|-----------|-------|
| Data do Relatório | 02/02/2026 15:30 |
| Total de Registros | 1.234.567 |
| Áreas Monitoradas | 4 |
| Áreas Saudáveis | 2 |
| Áreas em Atenção | 1 |
| Áreas Críticas | 1 |
| Processados (24h) | 5.678 |

### Aba 2: "Situação por Área"
| Área | Status | Última Atualização | Total Registros | Processados (24h) |
|------|--------|-------------------|-----------------|-------------------|
| Dados Operacionais | Saudável | 02/02 15:28 | 245.832 | +1.234 |
| Notas Fiscais | Atenção | 02/02 14:15 | 89.123 | +456 |
| ... | ... | ... | ... | ... |

### Aba 3: "Operações Detalhadas"
Breakdown das operações aéreas e marítimas

---

## Alterações na Interface

Adicionar botões no header do `DatabaseMonitor.tsx`:

```
┌──────────────────────────────────────────────────────┐
│ [📄 PDF] [📊 Excel] [🔄 Atualizar] [❓]              │
└──────────────────────────────────────────────────────┘
```

---

## Seção Técnica

### Dependências Utilizadas (já instaladas)
- `jspdf` + `jspdf-autotable` - Geração de PDF
- `xlsx-js-style` - Excel com formatação

### Estrutura do Código

```typescript
// src/utils/dbMonitorExport.ts

interface ExportableStats {
  areas: {
    name: string;           // "Dados Operacionais"
    technicalName: string;  // "t_master_dados"
    status: string;         // "Saudável" | "Atenção" | "Crítico"
    statusColor: string;    // "green" | "yellow" | "red"
    lastUpdate: string;
    lastUpdateFormatted: string;
    totalRecords: number;
    recentInserts: number;
    applications: string[];
    details?: {
      air?: { total: number; inserts: number };
      sea?: { total: number; inserts: number };
    };
  }[];
  summary: {
    totalRecords: number;
    healthyCount: number;
    warningCount: number;
    criticalCount: number;
    totalInserts24h: number;
  };
  generatedAt: string;
}

export function exportDbMonitorPDF(stats: DatabaseStats): string;
export function exportDbMonitorExcel(stats: DatabaseStats): string;
```

### Fluxo de Implementação
1. Criar arquivo `src/utils/dbMonitorExport.ts` com funções de transformação e exportação
2. Adicionar imports no `DatabaseMonitor.tsx`
3. Adicionar estados para loading de exportação
4. Adicionar botões de exportação no `rightContent`
5. Conectar funções de exportação aos botões

### Design Visual do PDF
- Fundo branco para impressão
- Cabeçalho amarelo DACHSER (#FFC800)
- Cards com bordas arredondadas
- Indicadores coloridos por status
- Rodapé com "Sistema Z3US.AI" e paginação
