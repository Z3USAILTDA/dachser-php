## Repaginar visual do modal "Importar SPO em Lote"

Apenas ajustes de estilo no `BatchImportVoucherDialog.tsx` para alinhar ao padrão DACHSER/Z3US (fundo escuro, accent gold #F5B843, cantos arredondados, header com ícone). Sem mudança funcional.

### Mudanças em `src/components/esteira/BatchImportVoucherDialog.tsx`

**Header**
- Adicionar ícone `FileSpreadsheet` (gold) ao lado do título.
- Subtítulo em `text-xs text-muted-foreground`: "Crie múltiplos vouchers/SPO a partir de uma planilha CSV ou XLSX".

**Step upload** (atual está visualmente vazio e baixo contraste)
- Card com `bg-primary/5 border-primary/20 rounded-2xl py-16 px-8`.
- Ícone `Upload` em círculo gold (`h-14 w-14 rounded-full bg-primary/10 text-primary`).
- Título grande "Selecione sua planilha" + subtítulo curto.
- Botão `Selecionar arquivo` com estilo primary (gold).
- Linha separadora discreta + bloco final com cabeçalhos esperados em chips/badges (`Processo`, `Fornecedor`, `Valor Solicitação`, `Vencimento`, `Forma Pagto`, `Fatura`, `Data fatura`, `Histórico`, `Quebra`) usando `Badge variant="outline"`.
- Suporte a drag & drop (visual + handler — onDragOver/onDrop chamando `handleFile`).

**Step preview**
- Resumo com 3 mini-cards (Total, Válidas, Com erro) em grid `grid-cols-3 gap-3`, cada um `rounded-xl border bg-card/50 p-3` com número grande e label.
- Tabela mantida, mas wrapper com `rounded-xl border border-border overflow-hidden`.
- Footer com `Voltar` (outline ghost) e `Criar N voucher(s)` (primary gold).

**Container**
- `DialogContent` ajustado: `max-w-4xl rounded-2xl border-border/60`.

### Não muda

- `parseBatchSpreadsheet`, fluxo de upload/preview/confirm, props, `BatchImportPreviewTable`, backend, permissões.
- Demais arquivos do lote intactos.
