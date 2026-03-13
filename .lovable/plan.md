

## Plano de Correção — CHB Processo #95

### Problema 1: BL Prepaid + Invoice com Incoterm Collect (FCA) não é detectado

**Situação atual**: O prompt já tem regras sobre Prepaid vs Collect (linha 877, 915) e sobre Incoterms diferentes (linha 916), mas **não** cruza Incoterm com tipo de frete. Quando o BL diz "Prepaid" e a Invoice diz "FCA" (que implica Collect), o modelo marca tudo ✅ porque cada campo individualmente está "correto".

**Correção**: Adicionar nova regra no prompt do edge function `analyze-chb-documents/index.ts`, na seção 6 (Incoterm, ~linha 653-658), com a seguinte lógica:

```text
REGRA DE CONSISTÊNCIA — INCOTERM vs TIPO DE FRETE:
- FCA, EXW, FOB → frete tipicamente COLLECT (comprador paga)
- CIF, CFR, CPT, CIP, DDP, DAP → frete tipicamente PREPAID (vendedor paga)

VALIDAÇÃO CRUZADA OBRIGATÓRIA:
- Se BL/AWB mostra "Prepaid" mas Incoterm é FCA/EXW/FOB → 🔴 CRÍTICO
- Se BL/AWB mostra "Collect" mas Incoterm é CIF/CFR/CPT/DDP → 🔴 CRÍTICO
- Registrar na tabela E nas observações com 🔴
```

Também adicionar na seção 17 (Verificação Final, ~linha 968) um item de checklist:
- "CONFIRME consistência entre Incoterm e tipo de frete (Prepaid/Collect)"

**Arquivo**: `supabase/functions/analyze-chb-documents/index.ts`

---

### Problema 2: Botão "Copiar Resultado" mostra toast de sucesso mas não copia

**Situação atual**: `navigator.clipboard.writeText()` é chamado **sem** `await` e **sem** tratamento de erro. Em ambientes de iframe/preview, a API de Clipboard pode falhar silenciosamente.

**Correção**: Criar uma função utilitária `copyToClipboard(text)` que:
1. Tenta `await navigator.clipboard.writeText(text)`
2. Se falhar, usa fallback com `document.execCommand('copy')` (textarea temporário)
3. Retorna `true/false` para controlar o toast

Aplicar em 3 arquivos:
- `src/components/chb/ChbAnalysisPanel.tsx` (linha 26-31)
- `src/components/chb/ChbHistoryPanel.tsx` (função `copyResult`)
- `src/pages/ChbAnalises.tsx` (linha 145-152)

**Arquivo novo**: `src/utils/clipboard.ts` (utilitário reutilizável)

---

### Resumo de arquivos a modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/analyze-chb-documents/index.ts` | Adicionar regra Incoterm vs Frete no prompt |
| `src/utils/clipboard.ts` | Criar utilitário de cópia com fallback |
| `src/components/chb/ChbAnalysisPanel.tsx` | Usar novo utilitário de cópia |
| `src/components/chb/ChbHistoryPanel.tsx` | Usar novo utilitário de cópia |
| `src/pages/ChbAnalises.tsx` | Usar novo utilitário de cópia |

