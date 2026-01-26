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

## Limitações Conhecidas

- PDFs de imagem (scans) não podem ter valores localizados automaticamente
- Requer OCR para documentos não-textuais
