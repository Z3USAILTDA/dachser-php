

# Ajustes no CHB: Valor Mercadoria como Conforme + Melhoria na Deteccao de Frete

## Problema Atual

### 1. Valor Mercadoria com alertas desnecessarios
Atualmente, quando o "Valor Mercadoria" diverge entre documentos, o sistema marca como alerta amarelo. Porem, cada Invoice pode ter um valor diferente (varias invoices por processo), e o Draft DI confere o valor total consolidado. Portanto, divergencias entre invoices individuais sao esperadas e nao devem gerar alerta.

### 2. Deteccao de Frete incorreta
A IA ainda confunde valores de frete com outros campos (ex: "Total net" sendo interpretado como frete, ou valores de mercadoria sendo colocados na linha de frete). Apesar de ja existirem regras extensas no prompt, a IA continua errando.

## O que sera alterado

### Arquivo unico: `supabase/functions/analyze-chb-documents/index.ts`

### Alteracao 1 — Valor Mercadoria: SEMPRE Conforme

Nas regras de status (secao 16), substituir a regra atual que marca "Valor Mercadoria" como alerta amarelo por uma regra que marca como **CONFORME** automaticamente:

**Antes:**
- "Valor Mercadoria" divergente entre documentos -> alerta amarelo
- Mesmo com diferenca >20% -> alerta amarelo

**Depois:**
- "Valor Mercadoria" divergente entre documentos -> CONFORME (sem alerta)
- Motivo documentado: cada Invoice pode ter valor diferente; o Draft DI confere o total consolidado
- Na secao de Observacoes, registrar os valores encontrados de forma informativa (sem icone de alerta)

Locais de alteracao no prompt:
- Secao 7A (definicao do campo "Valor Mercadoria") — adicionar nota de que divergencias sao normais
- Secao 16 (regras de status) — remover a excecao especial de "alerta amarelo" e substituir por "CONFORME"
- Secao 16 exemplos — atualizar os exemplos para refletir a nova regra
- Secao 17 (verificacao final) — ajustar consistencia

### Alteracao 2 — Reforco na Deteccao de Frete

Adicionar regras mais explicitas e exemplos negativos no prompt para evitar confusao entre frete e outros valores:

- Reforcar que "Total net" em Invoice NUNCA e frete (regra 7D ja existe, mas sera reescrita com mais enfase)
- Adicionar exemplos concretos de erros comuns que a IA comete e instrucoes para evita-los
- Adicionar regra explicita: se o documento e uma Invoice comercial e nao tem linha explicita de "Freight/Frete", o campo "Valor Total Frete" deve ser "ND" para essa Invoice
- Reforcar que "Amount Due", "Total Amount", "Final Amount" em Invoice sao geralmente o total da fatura (mercadoria + frete), NAO o frete isolado
- Adicionar regra de "checklist de validacao" antes de preencher o campo frete: "O valor que estou colocando como frete vem de uma linha EXPLICITAMENTE rotulada como freight/frete/charges?"

## Resumo do impacto

- Usuarios nao verao mais alertas amarelos desnecessarios para "Valor Mercadoria"
- A deteccao de frete sera mais precisa, reduzindo falsos positivos e erros de classificacao
- Nenhuma alteracao no frontend ou na estrutura de dados — apenas ajuste no prompt da IA

