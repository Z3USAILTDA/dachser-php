# CHB Analysis System - Implementation Notes

## ✅ Re-Extração Paralela quando Localização Automática Falha (IMPLEMENTADO)

### Problema Resolvido
Quando o usuário salvava uma correção e a localização automática não encontrava o valor no documento, o sistema apenas salvava a correção com `location_confidence = 'baixa'` e não fazia nada adicional.

### Solução Implementada

#### 1. Re-Extração Paralela (`chb-corrections/index.ts`)
- Quando `locateValueInFile()` retorna `found=false`, dispara automaticamente `reextractAndUpdateCorrection()` em paralelo
- Usa `EdgeRuntime.waitUntil()` para não bloquear a resposta ao usuário
- Utiliza modelo mais potente (Gemini 2.5 Pro) com prompt especializado para análise profunda
- Atualiza a correção com a localização encontrada

#### 2. Regras de Extração Aprendidas
- **Nova tabela**: `ai_agente.t_dachser_chb_extraction_rules`
  - `field_name`: Nome do campo (ex: "Peso Bruto")
  - `document_type`: Tipo de documento (CCT, HAWB, Invoice, etc.)
  - `extraction_pattern`: Padrão para localizar (ex: "Após 'Gross Weight:'")
  - `location_hint`: Dica de localização (ex: "Seção TOTALS, linha 5")
  - `example_value`: Exemplo de valor encontrado
  - `times_used`: Contador de uso
  - `success_rate`: Taxa de sucesso (0-100%)

#### 3. Injeção de Regras no Prompt (`analyze-chb-documents/index.ts`)
- Antes de cada análise, busca regras aprendidas via `get_chb_extraction_rules`
- Injeta as regras no contexto do prompt com alta prioridade
- LLM usa essas dicas para localizar campos corretamente

#### 4. Actions Adicionadas (`mariadb-proxy/index.ts`)
- `get_chb_extraction_rules`: Busca regras com `success_rate >= 50%`
- `save_chb_extraction_rule`: Salva/atualiza regra de extração

### Fluxo de Aprendizado

```
Usuário corrige valor → locateValueInFile() falha → 
  ↓ (paralelo)
reextractFieldWithContext() com Gemini Pro →
  ↓
Encontra localização → Atualiza correção + Salva regra →
  ↓
Próxima análise usa regra aprendida no prompt
```

### Benefícios
1. Sistema aprende automaticamente com cada correção
2. Menos correções manuais necessárias ao longo do tempo
3. Processamento paralelo não bloqueia o usuário
4. Feedback loop: correções viram conhecimento reutilizável

---

## Outras Funcionalidades do Módulo CHB

### Correções de Usuário
- Tabela: `t_dachser_chb_user_corrections`
- Localização automática com Gemini Flash
- Fallback para busca de conteúdo no storage quando não enviado pelo frontend

### Análise de Documentos
- Multi-modelo: Anthropic Claude → Gemini Pro (fallback)
- Cache de campos extraídos
- Suporte a Excel, PDF, imagens
- Prompts específicos por etapa (1, 2, 3)
