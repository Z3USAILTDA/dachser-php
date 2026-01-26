
# Plano: Re-Extração Paralela quando Localização Automática Falha

## Problema Atual

Quando o usuário salva uma correção e a localização automática **NÃO encontra** o valor no documento:
1. A correção é salva com `location_confidence = 'baixa'`
2. O sistema **não faz nada adicional**
3. Em re-análises futuras, a correção é usada, mas o LLM pode falhar novamente no mesmo ponto

**Resultado**: O usuário precisa corrigir o mesmo tipo de erro repetidamente.

## Solução Proposta: Re-Extração Inteligente em Paralelo

Criar um mecanismo que, quando a localização falha, dispara uma **re-extração focada** em paralelo para "ensinar" o sistema a encontrar esse campo específico.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO: CORREÇÃO COM RE-EXTRAÇÃO                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Usuário salva correção                                                     │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────┐                                               │
│  │ locateValueInFile()      │                                               │
│  │ Tenta localizar valor    │                                               │
│  └──────────────────────────┘                                               │
│         │                                                                   │
│         ├─── SUCESSO (found=true) ───► Salva correção com localização       │
│         │                                                                   │
│         └─── FALHA (found=false) ────► Dispara RE-EXTRAÇÃO EM PARALELO     │
│                                               │                             │
│                                               ▼                             │
│                                  ┌───────────────────────────────┐          │
│                                  │  reextractFieldWithContext()  │          │
│                                  │                               │          │
│                                  │  1. Prompt especializado:     │          │
│                                  │     "Onde está o campo X      │          │
│                                  │      com valor Y neste        │          │
│                                  │      documento?"              │          │
│                                  │                               │          │
│                                  │  2. Usa modelo mais potente   │          │
│                                  │     (gemini-2.5-pro)          │          │
│                                  │                               │          │
│                                  │  3. Retorna localização       │          │
│                                  │     detalhada                 │          │
│                                  └───────────────────────────────┘          │
│                                               │                             │
│                                               ▼                             │
│                                  Atualiza correção com localização           │
│                                  encontrada (location_confidence = 'media')  │
│                                               │                             │
│                                               ▼                             │
│                                  Salva "regra de extração" para             │
│                                  futuras análises do mesmo tipo             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Detalhamento Técnico

### Fase 1: Nova Função de Re-Extração

**Arquivo**: `supabase/functions/chb-corrections/index.ts`

Adicionar função `reextractFieldWithContext` que:
1. Usa um prompt mais detalhado e especializado
2. Envia **todo** o conteúdo do documento (não truncado)
3. Pede ao LLM para identificar:
   - Onde exatamente o valor está
   - Qual padrão/formato o valor usa
   - Contexto visual (posição na página, nome da seção)

```typescript
async function reextractFieldWithContext(
  filename: string,
  fieldName: string,
  correctedValue: string,
  fileContent: string
): Promise<{
  success: boolean;
  location: string;
  pattern: string;
  extractionHint: string;
  confidence: 'alta' | 'media' | 'baixa';
}> {
  const prompt = `TAREFA DE EXTRAÇÃO PRECISA

Você é um especialista em documentos de comércio exterior.

OBJETIVO: Encontrar EXATAMENTE onde o valor "${correctedValue}" aparece 
para o campo "${fieldName}" no arquivo "${filename}".

CONTEÚDO COMPLETO DO DOCUMENTO:
${fileContent}

RESPONDA EM JSON:
{
  "found": true/false,
  "location": "descrição precisa: página, seção, tabela, coluna",
  "pattern": "padrão do campo: ex: 'Gross Weight:' seguido do valor",
  "extractionHint": "dica para futuras extrações: ex: 'Procurar na seção WEIGHTS após TOTAL'",
  "nearbyText": "texto que aparece próximo ao valor (10 palavras antes e depois)",
  "confidence": "alta/media/baixa"
}

Se o valor não existir LITERALMENTE, retorne found=false.
Se existir mas com formatação diferente, indique a formatação encontrada.`;

  // Usar modelo mais potente para análise profunda
  const response = await fetch('gemini-2.5-pro endpoint', {
    body: { prompt, max_tokens: 2000 }
  });
  
  return parseResponse(response);
}
```

### Fase 2: Disparar Re-Extração em Paralelo

Modificar o fluxo de salvamento de correções:

```typescript
// Após salvar a correção inicial (linha ~336)
if (!locationResult.found) {
  // Dispara re-extração em paralelo (não bloqueia resposta)
  EdgeRuntime.waitUntil(
    reextractAndUpdateCorrection(
      correctionId, 
      item_id,
      filename, 
      field_name, 
      corrected_value, 
      effectiveFileContent
    )
  );
  
  console.log(`[chb-corrections] Started parallel re-extraction for correction ${correctionId}`);
}
```

### Fase 3: Armazenar "Regras de Extração" Aprendidas

**Nova tabela no MariaDB**:

```sql
CREATE TABLE ai_agente.t_dachser_chb_extraction_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field_name VARCHAR(100) NOT NULL,
  document_type VARCHAR(50),      -- 'CCT', 'HAWB', 'Invoice', etc.
  extraction_pattern VARCHAR(500), -- Ex: "Procurar 'Gross Weight:' seguido de número"
  location_hint VARCHAR(500),      -- Ex: "Seção WEIGHTS, após totais"
  example_value VARCHAR(255),
  times_used INT DEFAULT 0,
  success_rate DECIMAL(5,2),
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_field_doc (field_name, document_type)
);
```

### Fase 4: Usar Regras Aprendidas na Análise

**Arquivo**: `supabase/functions/analyze-chb-documents/index.ts`

Injetar regras de extração no prompt:

```typescript
// Antes de chamar o LLM para análise, buscar regras aprendidas
const extractionRules = await callMariaDBProxy('get_chb_extraction_rules', {
  fields: ['peso_bruto', 'peso_liquido', 'valor_mercadoria']
});

// Adicionar ao prompt
if (extractionRules.length > 0) {
  cachedContext += `
═══════════════════════════════════════════════════════════════════════════════
📚 REGRAS DE EXTRAÇÃO APRENDIDAS (ALTA PRIORIDADE)
═══════════════════════════════════════════════════════════════════════════════

Com base em correções anteriores, estas são DICAS de onde encontrar cada campo:

${extractionRules.map(r => `
  Campo: ${r.field_name}
  Documento típico: ${r.document_type}
  Padrão: ${r.extraction_pattern}
  Localização comum: ${r.location_hint}
  Exemplo: "${r.example_value}"
`).join('\n')}

USE ESTAS DICAS para localizar os campos corretamente.
═══════════════════════════════════════════════════════════════════════════════
`;
}
```

## Alterações por Arquivo

| Arquivo | Alteração |
|---------|-----------|
| `chb-corrections/index.ts` | + função `reextractFieldWithContext()` |
| `chb-corrections/index.ts` | + lógica para disparar re-extração paralela quando localização falha |
| `chb-corrections/index.ts` | + função `updateCorrectionWithLocation()` para atualizar após re-extração |
| `mariadb-proxy/index.ts` | + action `save_chb_extraction_rule` |
| `mariadb-proxy/index.ts` | + action `get_chb_extraction_rules` |
| `analyze-chb-documents/index.ts` | + injeção de regras de extração no prompt |
| MariaDB | + tabela `t_dachser_chb_extraction_rules` |

## Ordem de Implementação

1. **Criar tabela de regras** - MariaDB
2. **Implementar re-extração paralela** - `chb-corrections/index.ts`
3. **Adicionar actions no proxy** - `mariadb-proxy/index.ts`
4. **Injetar regras no prompt de análise** - `analyze-chb-documents/index.ts`
5. **Deploy e testes**

## Benefícios

1. **Aprendizado automático**: Sistema melhora a cada correção
2. **Menos correções manuais**: Regras aprendidas evitam erros repetitivos
3. **Processamento paralelo**: Usuário não espera pela re-extração
4. **Feedback loop**: Correções viram conhecimento reutilizável
5. **Transparência**: Regras podem ser visualizadas/editadas por admins

