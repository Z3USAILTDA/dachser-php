
# Ajustes Visuais - Destaque de Divergências na Análise SEA

## Objetivo

Melhorar a apresentação visual dos resultados de análise documental SEA para:
1. Destacar visualmente as linhas de divergência com cores e ícones
2. Adicionar uma seção de resumo de divergências ao final do resultado para facilitar cópia

## Implementação

### 1. Criar Componente Reutilizável `AnalysisResultDisplay`

Novo componente em `src/components/maritimo/AnalysisResultDisplay.tsx` que:
- Recebe o texto bruto da análise
- Processa linha por linha identificando padrões de divergência
- Aplica estilos visuais diferenciados para cada tipo de linha

### 2. Regras de Highlighting

| Padrão | Estilo Visual |
|--------|--------------|
| `UPDATE REQUIRED`, `Status: DIFFERENT`, `MISMATCH` | Fundo vermelho/laranja, borda lateral, ícone ⚠️ |
| `Delta:` com valor não-zero | Fundo amarelo suave |
| `Missing:`, `Extra:` com valores | Fundo vermelho suave |
| `→ Update:`, `→ Action:` | Fundo azul suave com ícone 📝 |
| `Status: MATCH` | Texto verde sutil (não destacado) |
| Headers como `EXPORTER #N:`, `CONTAINER:` | Fundo escuro, texto bold |

### 3. Estrutura Visual do Resultado

```
┌──────────────────────────────────────────────────────┐
│ Análise concluída ✓                                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│ [Resultado da análise com highlighting]              │
│                                                      │
│ ┌─ DIVERGÊNCIA ─────────────────────────────────────┐│
│ │ ⚠ Packaging Type: CARTON vs WOODEN PALLET        ││
│ │   → Update: Change packaging type...              ││
│ └────────────────────────────────────────────────────┘│
│                                                      │
│ [Linhas normais sem destaque]                        │
│                                                      │
├──────────────────────────────────────────────────────┤
│ 📋 RESUMO DAS DIVERGÊNCIAS (para cópia)             │
│ ──────────────────────────────────────────────────── │
│                                                      │
│ ⚠ Packaging Type: 5 discrepancies found             │
│ EXPORTER #15: MALIK GmbH                            │
│ - Pallet/Package Qty: Manifest: 1 CARTON | HBL: ... │
│   → Update: Change packaging type...                 │
│                                                      │
│ [Botão: Copiar Resumo]                               │
└──────────────────────────────────────────────────────┘
```

### 4. Arquivos a Criar/Modificar

**Novo arquivo:**
- `src/components/maritimo/AnalysisResultDisplay.tsx`

**Arquivos a modificar:**
- `src/pages/SubmeterHblMbl.tsx` - Substituir `<pre>` pelo novo componente
- `src/pages/SubmeterManifestHbl.tsx` - Substituir `<pre>` pelo novo componente
- `src/pages/InvoicesDraftHbl.tsx` - Substituir `<pre>` pelo novo componente

### 5. Detalhes Técnicos

#### Componente AnalysisResultDisplay

```typescript
interface AnalysisResultDisplayProps {
  resultText: string;
  maxHeight?: string;
}

// Função para classificar cada linha
type LineType = 'divergence' | 'action' | 'warning' | 'header' | 'match' | 'normal';

function classifyLine(line: string): LineType {
  if (/UPDATE REQUIRED|Status:\s*DIFFERENT|MISMATCH/i.test(line)) return 'divergence';
  if (/→\s*(Update|Action):/i.test(line)) return 'action';
  if (/Missing:|Extra:|Delta:\s*[+-]?[1-9]/i.test(line)) return 'warning';
  if (/EXPORTER\s*#\d+:|CONTAINER:|^NCM CODES:|^TOTAL/i.test(line)) return 'header';
  if (/Status:\s*MATCH/i.test(line)) return 'match';
  return 'normal';
}

// Estilos por tipo de linha
const lineStyles: Record<LineType, string> = {
  divergence: 'bg-red-500/15 border-l-4 border-red-500 pl-3 text-red-300',
  action: 'bg-blue-500/10 border-l-2 border-blue-400 pl-3 text-blue-300',
  warning: 'bg-amber-500/10 border-l-2 border-amber-400 pl-3 text-amber-300',
  header: 'bg-white/5 font-bold text-white mt-3',
  match: 'text-emerald-400/70',
  normal: 'text-neutral-300',
};
```

#### Seção de Resumo de Divergências

Ao final do resultado, adiciona uma seção separada visualmente que:
1. Extrai automaticamente todas as linhas de divergência
2. Agrupa por contexto (Exporter, Container, etc.)
3. Apresenta em formato copiável
4. Inclui botão de cópia específico para esta seção

### 6. Impacto Visual

**Antes:**
```
texto monocromático em fonte mono
tudo na mesma cor neutra
difícil identificar o que precisa atenção
```

**Depois:**
```
┌─ ⚠ DIVERGÊNCIA ──────────────────────────┐
│ Packaging Type: CARTON vs WOODEN PALLET  │
│ → Update: Change packaging type...        │
└───────────────────────────────────────────┘

Texto normal sem destaque

✓ Invoice Reference: MATCH (texto verde sutil)
```

### 7. Ordem de Implementação

1. Criar `AnalysisResultDisplay.tsx` com lógica de parsing e estilos
2. Implementar função `extractDivergenceSummary()` para seção de resumo
3. Atualizar `SubmeterHblMbl.tsx` para usar novo componente
4. Atualizar `SubmeterManifestHbl.tsx` para usar novo componente
5. Atualizar `InvoicesDraftHbl.tsx` para usar novo componente
6. Testar com resultados de análise reais

### 8. Considerações

- O componente deve manter a estrutura de memória `sea/analysis-visual-consistency-constraint` intacta
- O highlighting é puramente visual - não altera o texto copiado
- A seção de resumo é adicional - o resultado completo continua disponível
- Funciona com ambos os temas (claro e escuro)
