
# Plano de Correção: Extração de Informações CHB e Parâmetros de Localização

## Diagnóstico do Problema

Após análise detalhada do sistema, identifiquei as seguintes causas raiz das falhas na extração de informações CHB:

### 1. Problema: Localização Automática Insuficiente

A função `locateValueInFile` no `chb-corrections/index.ts` tem limitações críticas:
- Usa apenas os primeiros 15.000 caracteres do conteúdo (`fileContent.substring(0, 15000)`)
- Para documentos PDF maiores, o contexto completo não está disponível
- A localização depende do Gemini Flash, que recebe conteúdo truncado

### 2. Problema: Correções do Usuário Não Estão Sendo Aplicadas Corretamente

Na análise, as correções validadas pelo usuário deveriam sobrescrever os valores extraídos automaticamente, mas:
- O fluxo busca correções com `is_validated = TRUE`, porém as correções são salvas com `is_validated = FALSE` inicialmente
- A flag `is_validated` só é `TRUE` quando a localização automática encontra o valor (`locationResult.found`)

### 3. Problema: Parâmetros de Localização Não Respeitados no Prompt

O prompt de análise inclui:
- A regra de "CORRELAÇÃO DE ARQUIVOS" (linhas 325-332)
- Mas a instrução não é reforçada com exemplos negativos
- O Claude pode ainda "inferir" valores quando não encontra explicitamente

### 4. Problema: Contexto de Correções Não Passado na Reanalise

Quando o usuário faz uma correção e re-executa a análise:
- O sistema busca correções via `get_chb_corrections`
- Mas busca apenas `is_validated = TRUE`
- Se a correção não foi validada (localização não encontrada), ela é ignorada

## Solução Proposta

### Fase 1: Corrigir a Persistência de Correções

**Arquivo**: `supabase/functions/chb-corrections/index.ts`

1. Aumentar o limite de conteúdo para localização (15.000 → 50.000 caracteres)
2. Marcar correções como `is_validated = TRUE` mesmo quando localização falha (o usuário validou manualmente)
3. Adicionar campo `manually_validated` para distinguir validação automática vs manual

### Fase 2: Corrigir a Query de Busca de Correções

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts`

Alterar a query `get_chb_corrections` para:
- Buscar TODAS as correções do item (remover filtro `is_validated = TRUE`)
- Ou alterar para buscar correções onde `is_validated = TRUE OR manually_validated = TRUE`

### Fase 3: Reforçar Prompt com Instruções Defensivas

**Arquivo**: `supabase/functions/analyze-chb-documents/index.ts`

1. Adicionar seção de "EXEMPLOS NEGATIVOS" no prompt:
   - Mostrar o que NÃO fazer (inferir valores, copiar entre arquivos)
   
2. Reforçar regra de localização com instrução mais rígida:
```
REGRA ABSOLUTA - EXTRAÇÃO EXPLÍCITA:
- Extraia APENAS dados que estão EXPLICITAMENTE escritos no documento
- Se um campo não está visível → retorne "ND"
- NUNCA infira, calcule ou adivinhe valores
- Se você "acha" que um valor deveria estar lá mas não vê → "ND"
```

3. Adicionar validação de confiança para cada campo extraído:
```
PARA CADA CAMPO EXTRAÍDO, VALIDE:
1. Você VIU esse valor explicitamente no documento? SIM/NÃO
2. Se NÃO → use "ND"
3. Se SIM → cite a localização (página, seção, tabela)
```

### Fase 4: Melhorar Injeção de Correções no Prompt

**Arquivo**: `supabase/functions/analyze-chb-documents/index.ts`

Atualizar a construção do `cachedContext` para:
1. Incluir correções mesmo que `is_validated = FALSE`
2. Adicionar instrução explícita: "Se o usuário corrigiu um valor, USE O VALOR CORRIGIDO mesmo se você encontrar outro valor no documento"
3. Adicionar checklist de verificação final

---

## Detalhamento Técnico das Alterações

### Alteração 1: `supabase/functions/chb-corrections/index.ts`

```text
Linha 45: Aumentar limite de caracteres
- De: fileContent.substring(0, 15000)
- Para: fileContent.substring(0, 50000)

Linhas 224-229: Sempre marcar como validado quando salvo pelo usuário
- Adicionar: is_validated = TRUE (o usuário é a fonte de verdade)
```

### Alteração 2: `supabase/functions/mariadb-proxy/index.ts`

```text
Linha ~3834: Alterar query de busca
- De: WHERE item_id = ? AND is_validated = TRUE
- Para: WHERE item_id = ? (buscar todas as correções)
```

### Alteração 3: `supabase/functions/analyze-chb-documents/index.ts`

Adicionar seção no prompt após "REGRA CRÍTICA DE CORRELAÇÃO DE ARQUIVOS":

```text
REGRA DE EXTRAÇÃO DEFENSIVA (NÃO VIOLAR!):

ANTES DE INCLUIR QUALQUER VALOR NA TABELA, VERIFIQUE:
1. Você LITERALMENTE viu esse texto/número no conteúdo do arquivo? 
   → Se NÃO → use "ND"
   → Se SIM → prossiga

2. Esse valor está na coluna/seção correta do documento original?
   → Se NÃO → use "ND"  
   → Se SIM → prossiga

3. Você está colocando esse valor na coluna do arquivo CORRETO?
   → Se está no CCT.pdf, só pode ir na coluna "CCT.pdf"
   → NUNCA copie valores entre colunas de arquivos diferentes

EXEMPLOS DO QUE NÃO FAZER:
❌ CCT mostra peso 501.5 → colocar 501.5 na coluna do HAWB também
❌ Invoice não tem peso → "inferir" peso do packing list
❌ Valor não encontrado → inventar ou estimar
❌ Campo ausente → copiar de outro documento

EXEMPLOS DO QUE FAZER:
✅ CCT mostra peso 501.5 → coluna CCT = "501.5", outras = "ND" se não encontrar
✅ Invoice não tem peso → coluna Invoice = "ND"
✅ HAWB mostra peso 501,500 → coluna HAWB = "501,500"
```

### Alteração 4: Atualizar construção de correções no prompt

```text
Na função processAnalysisInBackground (linha ~1502):

Alterar a instrução de correções para:
"REGRA ABSOLUTA DE CORREÇÕES:
1. O usuário CORRIGIU manualmente os valores abaixo
2. VOCÊ DEVE usar EXATAMENTE esses valores na tabela
3. Se você encontrar valor DIFERENTE no documento → IGNORAR e usar o corrigido
4. A correção do usuário é FONTE DE VERDADE FINAL
5. NUNCA substituir uma correção do usuário por valor do documento"
```

---

## Ordem de Implementação

1. **Primeiro**: Corrigir `chb-corrections/index.ts` (validação)
2. **Segundo**: Corrigir `mariadb-proxy/index.ts` (query)
3. **Terceiro**: Atualizar `analyze-chb-documents/index.ts` (prompt)
4. **Quarto**: Deploy e teste

## Testes de Validação

Após implementação:
1. Criar novo processo CHB
2. Fazer upload de documentos
3. Executar análise
4. Verificar se valores aparecem APENAS na coluna correta
5. Editar um valor manualmente
6. Re-executar análise
7. Verificar se valor corrigido foi mantido
