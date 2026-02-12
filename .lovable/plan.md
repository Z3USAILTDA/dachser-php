
# Corrigir Comparacao de Numeros com Zeros Diferentes

## Problema

Valores como `2000030614` e `200030614` estao retornando MATCH quando deveriam retornar DIVERGENCE. O problema pode estar em **dois caminhos** do sistema:

1. **Pipeline Determinístico** (`deterministicCompare.ts`): A funcao `compareInvoices` usa `normSuffix` que extrai o ultimo grupo numerico e remove zeros a esquerda. Em tese, `2000030614` e `200030614` sao strings diferentes e nao deveriam dar match — mas o algoritmo de suffix pode causar confusao se os valores forem parcialmente iguais em contextos com prefixos.

2. **Pipeline Legacy LLM** (prompts.ts): O prompt instrui o modelo a "Strip ALL leading zeros from extracted numbers" e fazer matching por sufixo numerico. O Gemini pode interpretar `2000030614` e `200030614` como equivalentes por proximidade visual, especialmente com instrucoes agressivas de normalizacao.

## Solucao

### 1. Reforcar `compareInvoices` em `deterministicCompare.ts` (Linha 173-199)

Adicionar comparacao completa **antes** da normalizacao por sufixo:
- Primeiro comparar as strings originais (sem normalizacao agressiva, apenas removendo espacos/tracos)
- Somente aplicar normalizacao por sufixo se as strings originais nao derem match direto
- Garantir que numeros com quantidades diferentes de zeros nunca sejam tratados como iguais

### 2. Adicionar regra explicita nos prompts (LLM fallback)

Em `prompts.ts`, adicionar instrucao clara nas secoes de normalizacao:

```text
CRITICAL: Different QUANTITIES of zeros WITHIN a number are REAL DIFFERENCES.
- "2000030614" vs "200030614" → DIVERGENCE (different numbers!)
- "20252930" vs "2025293" → DIVERGENCE (different numbers!)
- Leading zeros at the START are formatting only: "0048" vs "48" → MATCH
- Zeros in the MIDDLE or END of a number change its value: "2000" vs "200" → DIVERGENCE
```

Adicionar esta instrucao em todas as secoes relevantes dos 3 prompts (manifest_hbl, hbl_mbl, invoices_hbl).

### 3. Reforcar `compareExact` em `deterministicCompare.ts` (Linha 132)

A funcao `compareExact` ja faz comparacao estrita de strings. Se o problema for no campo Seal, ela deveria funcionar corretamente. Mas vamos adicionar um log para debug:
- Adicionar `console.log` temporario para rastrear quais campos estao retornando MATCH incorretamente

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/sea-submit-analysis/deterministicCompare.ts` | Reforcar `compareInvoices` com comparacao full-string antes do suffix matching |
| `supabase/functions/sea-submit-analysis/prompts.ts` | Adicionar regra explicita sobre zeros diferentes em numeros |

## Impacto

- Corrige falsos positivos onde numeros com zeros diferentes sao tratados como iguais
- Afeta tanto o pipeline deterministico quanto o fallback LLM
- Nao quebra matches legitimos de invoice (prefixo + sufixo como "TD02025000002013" vs "2013")
