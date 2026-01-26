

# Plano de Ajustes no CHB: Valor Mercadoria e Histórico com Correções

## Problema 1: Valor Mercadoria como Crítico

### Situação Atual
O campo "Valor Mercadoria" está sendo classificado como **🔴 CRÍTICO** quando há divergência entre documentos, seguindo as regras gerais de divergência acima de 20%.

### Localização do Problema
**Arquivo**: `supabase/functions/analyze-chb-documents/index.ts`

O prompt de análise (linhas 672-679) define que valores numéricos com diferença maior que 20% devem ser marcados como críticos:

```text
⚠️ STATUS 🔴 CRÍTICO — USAR OBRIGATORIAMENTE QUANDO:
- Valores numéricos diferem em mais de 20%
- Valores de ordens de magnitude diferentes (ex.: 10.000 vs 100)
```

E nas linhas 710-713, menciona especificamente "Valor Mercadoria" como campo que pode ter status crítico.

### Solução
Adicionar uma **exceção explícita** no prompt para que "Valor Mercadoria" seja sempre tratado como **🟨 ALERTA** quando divergente, nunca como crítico.

---

## Problema 2: Histórico sem Ajustes do Usuário

### Situação Atual
O histórico de análise armazena o `result_html` gerado pelo LLM **no momento da análise**. Se o usuário faz correções **APÓS** a análise (sem re-executar), essas correções:
- São exibidas visualmente no grid (via `EditableCell`)
- **MAS NÃO** são refletidas no histórico/PDF exportado

O fluxo atual:
1. Análise gera `result_html` → salvo em `t_dachser_chb_runs`
2. Usuário corrige valores → salvo em `t_dachser_chb_user_corrections`
3. Grid exibe correções (mostra valores editados em tempo real)
4. Histórico/PDF usa `result_html` original → **sem as correções**

### Solução
Modificar a lógica de exportação de PDF para **aplicar as correções do usuário** ao HTML antes de exportar, criando uma versão "consolidada" do resultado.

---

## Detalhamento Técnico

### Alteração 1: Valor Mercadoria como Alerta

**Arquivo**: `supabase/functions/analyze-chb-documents/index.ts`

Adicionar regra específica na seção de STATUS (após linha ~680):

```text
⚠️ EXCEÇÃO PARA VALOR MERCADORIA:
   - Divergência em "Valor Mercadoria" entre documentos → SEMPRE 🟨 ALERTA
   - Mesmo que a diferença seja maior que 20%
   - Motivo: valores de mercadoria variam naturalmente entre documentos (Invoice vs Packing List vs HBL)
   - Use 🟨 e documente a diferença nas observações
```

Também atualizar a regra nas linhas 710-713 para excluir explicitamente "Valor Mercadoria" dos casos críticos.

### Alteração 2: Histórico com Correções Aplicadas

**Arquivo**: `src/components/chb/ChbAnalysisPanel.tsx`

Modificar a função `handleExportPDF` para:
1. Buscar correções do usuário para cada etapa
2. Aplicar as correções ao HTML antes de passar para o exportador

**Novo fluxo**:
```text
analysisResult.html
       ↓
Buscar correções em useChbCorrections
       ↓
applyCorrectionsToHtml(html, corrections)
       ↓
HTML modificado com valores corrigidos
       ↓
exportChbHistoryToPDF()
```

**Arquivo**: `src/components/chb/ChbAnalysisPanel.tsx` ou novo utilitário

Criar função `applyCorrectionsToHtml`:
```typescript
function applyCorrectionsToHtml(html: string, corrections: ChbCorrection[]): string {
  // Parsear HTML
  // Para cada correção, encontrar célula correspondente e substituir valor
  // Retornar HTML modificado
}
```

### Alteração 3: Passar Correções para o Panel

**Arquivo**: `src/pages/ConferenciaChb.tsx`

- Buscar todas as correções do item via `useChbCorrections`
- Passar correções como prop para `ChbAnalysisPanel`

**Arquivo**: `src/components/chb/ChbAnalysisPanel.tsx`

- Receber prop `corrections: ChbCorrection[]`
- Usar na função `handleExportPDF`

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/analyze-chb-documents/index.ts` | Adicionar exceção no prompt para Valor Mercadoria ser sempre alerta |
| `src/components/chb/ChbAnalysisPanel.tsx` | Modificar `handleExportPDF` para aplicar correções ao HTML |
| `src/pages/ConferenciaChb.tsx` | Buscar e passar correções para o ChbAnalysisPanel |
| `src/utils/chbPdfExport.ts` (opcional) | Aceitar correções como parâmetro |

---

## Ordem de Implementação

1. **Modificar prompt do LLM** - Adicionar exceção para Valor Mercadoria
2. **Deploy da Edge Function** - `analyze-chb-documents`
3. **Criar função applyCorrectionsToHtml** - Lógica de substituição
4. **Buscar correções no ConferenciaChb** - Passar para o panel
5. **Modificar handleExportPDF** - Aplicar correções antes de exportar
6. **Testar** - Verificar PDF com valores corrigidos

---

## Resultado Esperado

### Valor Mercadoria
- Qualquer divergência em "Valor Mercadoria" será **🟨 ALERTA** (amarelo)
- Outros campos numéricos continuam seguindo regra de 20% para crítico

### Histórico/PDF
- O PDF exportado mostrará os **valores corrigidos pelo usuário**
- Correções são aplicadas ao HTML original antes da exportação
- Histórico reflete a "versão final" validada pelo conferente

