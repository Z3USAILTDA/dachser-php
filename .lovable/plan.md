
# Plano: Sistema de Aprendizado CHB - Correções Ensinam o LLM (Não Mascaram)

## Problema Central Identificado

O sistema atual funciona assim:
1. ✅ Correções são salvas em `t_dachser_chb_user_corrections`
2. ✅ Regras de extração são criadas em `t_dachser_chb_extraction_rules`
3. ✅ Regras são injetadas no prompt como "dicas de localização"
4. ❌ **MAS as dicas são insuficientes** - apenas indicam "onde procurar"
5. ❌ **Não ensinam COMO calcular** (ex: somar itens de uma Packlist)

### Exemplo do Problema
Regra atual para `peso_bruto_kg`:
```
Padrão de busca: "O valor está no campo Gross Weight"
Localização comum: "Tabela de totais"
```

Isso **não ensina** o LLM que quando há peso por item, ele deve **somar**.

## Solução: Enriquecer Regras com Instruções de Processamento

### Fase 1: Adicionar Campo de Instrução de Processamento

Modificar a tabela de regras para incluir um campo `processing_instruction` que contenha a **lógica de cálculo** quando necessário.

```sql
ALTER TABLE ai_agente.t_dachser_chb_extraction_rules
ADD COLUMN processing_instruction VARCHAR(1000) DEFAULT NULL;
```

### Fase 2: Atualizar Geração de Regras no chb-corrections

Quando o sistema aprende uma correção, usar o LLM para identificar se o valor é:
- Direto (copiar do documento)
- Calculado (soma de itens, conversão, etc.)

E salvar a instrução de processamento:
```
Campo: peso_bruto_kg
Documento: Packlist
Instrução: "Este documento apresenta peso por item. SOME todos os valores 
da coluna 'Gross Weight' para obter o total. Ex: 10.5 + 25.0 + 15.0 = 50.5"
```

### Fase 3: Injetar Instruções no Prompt de Análise

Modificar `analyze-chb-documents` para incluir instruções de processamento:

```typescript
for (const rule of extractionRules) {
  cachedContext += `📍 Campo: ${rule.field_name}\n`;
  cachedContext += `   Documento típico: ${rule.document_type}\n`;
  if (rule.extraction_pattern) {
    cachedContext += `   Padrão de busca: ${rule.extraction_pattern}\n`;
  }
  // NOVO: Instrução de processamento
  if (rule.processing_instruction) {
    cachedContext += `   ⚠️ INSTRUÇÃO ESPECIAL: ${rule.processing_instruction}\n`;
  }
}
```

### Fase 4: Melhorar Prompt de Re-extração

Atualizar `reextractFieldWithContext` em `chb-corrections` para identificar padrões de cálculo:

```typescript
const reextractionPrompt = `
Analise esta correção feita pelo usuário:
- Campo: ${fieldName}
- Valor corrigido: ${correctedValue}
- Arquivo: ${filename}

CONTEÚDO DO ARQUIVO:
${fileContent}

DETERMINE:
1. O valor foi extraído diretamente de um campo único?
2. O valor foi CALCULADO (soma, média, conversão)?
   - Se calculado, identifique a FÓRMULA usada
   - Liste os valores originais e como foram somados/processados

RETORNE JSON:
{
  "found": true,
  "location": "onde está no documento",
  "is_calculated": true/false,
  "calculation_formula": "10.5 + 25.0 + 15.0 = 50.5" ou null,
  "processing_instruction": "SOME todos os valores da coluna X" ou null,
  "extraction_pattern": "padrão para encontrar o campo",
  "confidence": "alta"
}
`;
```

## Resumo de Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/chb-corrections/index.ts` | 1. Adicionar coluna `processing_instruction` na tabela<br>2. Melhorar prompt de re-extração para detectar cálculos<br>3. Salvar instrução de processamento na regra |
| `supabase/functions/analyze-chb-documents/index.ts` | 1. Injetar `processing_instruction` no contexto do prompt<br>2. Formatar instruções como obrigatórias |

## Fluxo Completo Após Implementação

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. USUÁRIO CORRIGE: peso_bruto = "101,5" (era "ND" na Packlist)             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. SISTEMA ANALISA O DOCUMENTO COM LLM:                                     │
│    - "O arquivo tem 3 itens com Gross Weight: 50, 30, 21.5"                 │
│    - "O valor 101.5 é a SOMA desses itens"                                  │
│    - processing_instruction = "SOME todos os Gross Weight por item"         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. REGRA SALVA EM t_dachser_chb_extraction_rules:                           │
│    field_name: peso_bruto_kg                                                │
│    document_type: Packlist                                                   │
│    extraction_pattern: "Coluna 'Gross Weight' por item"                     │
│    processing_instruction: "SOME todos os valores da coluna Gross Weight"  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. PRÓXIMA ANÁLISE (qualquer item):                                         │
│    Prompt inclui: "⚠️ INSTRUÇÃO ESPECIAL para peso_bruto_kg em Packlist:   │
│    SOME todos os valores da coluna Gross Weight"                            │
│    → LLM CALCULA CORRETAMENTE                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Resultado Esperado

- Correções do usuário **ensinam** o LLM a processar corretamente
- Regras incluem **instruções de cálculo** quando necessário
- Próximas análises usam essas instruções para **extrair corretamente**
- O sistema **aprende** e melhora com cada correção
- Não há mais "mascaramento" - o LLM efetivamente corrige seu comportamento
