## Adicionar "Retornar Voucher" em lote na tela de Pagamentos

Hoje, a barra de ações em lote (que aparece quando >=1 voucher é selecionado) tem apenas:
- **Definir Tipo Execução** (dropdown)
- **Marcar Pronto**
- **Limpar Seleção**

Vamos adicionar um terceiro botão **"Retornar Voucher"** que reaproveita a mesma mecânica do retorno individual (mesmo dialog, mesmo destino — Operacional/Fiscal — mesma justificativa única para todos os selecionados).

### Comportamento

1. Botão **"Retornar Voucher (N)"** (variant outline, cor laranja, ícone `Undo2`) na barra de ações em lote, posicionado entre **Marcar Pronto** e **Limpar Seleção**.
2. Ao clicar abre o **mesmo dialog `Retornar Voucher`** que já existe (linhas 1339–1433), porém em modo lote:
   - Título: "Retornar N Vouchers"
   - Mostra a lista de SPOs selecionados (até 5, com "+X mais" se exceder)
   - Mesmos campos: destino (Operacional/Fiscal) + justificativa (mín. 10 caracteres)
   - A mesma justificativa é aplicada a todos os vouchers selecionados
3. Ao confirmar, executa `handleVoltarOperacional` em loop para cada voucher selecionado:
   - Atualiza `etapa_atual` → `AJUSTE_OPERACAO` ou `AJUSTE_FISCAL`
   - Persiste justificativa em `ajuste_operacao` ou `ajuste_fiscal` com marcador do solicitante (FINANCEIRO)
   - Loga `RETORNO_AJUSTE_OPERACIONAL` / `RETORNO_AJUSTE_FISCAL`
   - Dispara notificação via `sendVoucherReturnNotification`
4. Toast final: `"X retornado(s), Y falha(s)"`. Limpa seleção e recarrega.

### Edits

**`src/components/esteira/PagamentosTab.tsx`**

1. Adicionar estado `isBatchMode: boolean` no contexto do dialog de retorno (ou reutilizar `voltarOperacionalVoucher = null` + nova lista `voltarBatchVouchers: PagamentoItem[]`).
2. Adicionar botão na batch bar (após linha 955):
   ```tsx
   <Button size="sm" variant="outline" className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
     onClick={() => {
       const selected = pagamentos.filter(p => selectedIds.has(p.id));
       setVoltarBatchVouchers(selected);
       setVoltarOperacionalDialogOpen(true);
     }}>
     <Undo2 className="h-4 w-4 mr-2" />
     Retornar Voucher ({selectedIds.size})
   </Button>
   ```
3. Adaptar dialog (linhas 1339–1433):
   - Quando `voltarBatchVouchers.length > 0`, mostrar título "Retornar N Vouchers" e lista de SPOs em vez de "Voucher/SPO: X".
   - Resto idêntico (destino + justificativa + aviso laranja).
4. Adaptar `handleVoltarOperacional` para detectar modo lote: se `voltarBatchVouchers.length > 0`, iterar; senão fluxo single atual. Ao final, toast consolidado, limpar `selectedIds`, fechar dialog, recarregar.

### Resultado

- Seleção múltipla → barra de ações ganha **Retornar Voucher (N)**.
- Mesma UX e mesmas regras do retorno individual; apenas aplicado em massa com justificativa única.
- Sem mudanças em backend, schema, memória ou outras telas.