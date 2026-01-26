# CHB System - Implementation Status

## Completed

### 1. Valor Mercadoria como Alerta (não Crítico)
- **Status**: ✅ Implementado
- Divergências em "Valor Mercadoria", "Valor Total", "Valor FOB", "Valor CIF" são sempre 🟨 ALERTA

### 2. Histórico com Correções do Usuário
- **Status**: ✅ Implementado
- PDF exportado reflete valores corrigidos pelo usuário
- Correções aplicadas ao HTML antes da exportação

### 3. Sistema de Aprendizado (Parallel Learning)
- **Status**: ✅ Implementado e funcionando
- Tabela `t_dachser_chb_extraction_rules` criada
- 4 regras de extração salvas:
  - `valor_total_frete/CCT` (confiança alta)
  - `valor_total_frete/HAWB` (confiança alta)  
  - `incoterm/Outros` (confiança alta)
  - `valor_total_frete/CE_Mercante` (confiança alta)

### 4. OCR para PDFs Escaneados
- **Status**: ✅ Implementado (26 Jan 2025)
- Suporte a PDFs de imagem/escaneados via Gemini Vision OCR
- Função `extractTextWithOCR()` detecta e processa automaticamente
- Fluxo:
  1. PDF recebido → Tenta extração OCR via Gemini Vision
  2. Valida qualidade (>100 chars, contém letras)
  3. Se boa extração → Usa texto OCR para análise
  4. Se extração ruim → Fallback para handling nativo da API
- Também suporta OCR para arquivos de imagem (JPG, PNG)
- Usa Gemini 2.5 Flash para extração rápida e precisa

## Arquitetura

### Edge Functions
- **analyze-chb-documents**: Análise principal com OCR, Anthropic Claude (primário), Gemini Pro (fallback)
- **chb-corrections**: Salva correções e dispara aprendizado paralelo

### Tabelas MariaDB
- `ai_agente.t_dachser_chb_extraction_rules` - Regras aprendidas
- `ai_agente.t_dachser_chb_user_corrections` - Correções do usuário
- `ai_agente.t_dachser_chb_extracted_data` - Cache de dados extraídos
