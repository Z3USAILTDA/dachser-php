# Plano de Ajustes no CHB: Valor Mercadoria e Histórico com Correções

## ✅ IMPLEMENTADO

### Alteração 1: Valor Mercadoria como Alerta
- **Arquivo modificado**: `supabase/functions/analyze-chb-documents/index.ts`
- Adicionada exceção explícita no prompt para que "Valor Mercadoria", "Valor Total", "Valor FOB", "Valor CIF" sejam sempre tratados como **🟨 ALERTA** quando divergentes, nunca como 🔴 CRÍTICO

### Alteração 2: Histórico/PDF com Correções do Usuário
- **Novo arquivo**: `src/utils/chbPdfCorrections.ts` - Utilitário para aplicar correções ao HTML
- **Arquivo modificado**: `src/components/chb/ChbAnalysisPanel.tsx` - Recebe prop `corrections` e usa `createCorrectedHistoryEntries` no export PDF
- **Arquivo modificado**: `src/pages/ConferenciaChb.tsx` - Busca correções via `useChbCorrections` e passa para o painel

## Resultado

- Divergências em "Valor Mercadoria" serão **🟨 ALERTA** (nunca crítico)
- O PDF exportado mostrará os **valores corrigidos pelo usuário** com indicador visual (asterisco azul)
- O histórico reflete a versão final validada pelo conferente
