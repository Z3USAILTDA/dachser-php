## Objetivo

Garantir que vouchers em etapa `RASCUNHO` (como o 20261567156) sejam fáceis de encontrar na esteira, sem depender de mudar manualmente o filtro de etapa.

## Mudanças (cirúrgicas, só frontend)

**Arquivo único:** `src/pages/esteira/EsteiraIndex.tsx`

### A) Incluir RASCUNHO nas etapas permitidas do role OPERACAO

Em `roleFilteredVouchers` (~linha 1270), adicionar `RASCUNHO` ao `etapasPermitidas` quando `isOperacao`:

```ts
if (isOperacao) {
  etapasPermitidas.add("OPERACAO");
  etapasPermitidas.add("A_PROCESSAR");
  etapasPermitidas.add("PRE_LANCAMENTO");
  etapasPermitidas.add("RASCUNHO"); // novo
}
```

Efeito: usuários OPERACAO continuam vendo OPERACAO/A_PROCESSAR no filtro "Todos" e, se selecionarem manualmente "Rascunho", também enxergam. FISCAL/SUPERVISOR/FINANCEIRO continuam sem ver rascunhos (rascunho é responsabilidade da Operação).

### B) Card/atalho "Rascunhos" no topo da esteira

Adicionar um card-resumo na faixa de métricas superior (junto com "Pendentes - Operação", "Vencidos" etc.) mostrando a contagem de vouchers em `etapaAtual === "RASCUNHO"`.

- **Visibilidade:** apenas para `isAdmin`, `isGestor` ou `isOperacao` (quem cria/edita rascunhos).
- **Ação ao clicar:** seta `filters.etapa = "RASCUNHO"` e rola até a tabela (mesmo padrão dos cards existentes).
- **Estilo:** reaproveitar o componente de MetricCard já usado, variante neutra/cinza (alinhado ao badge cinza atual `bg-gray-500/10 text-gray-400` em `VoucherTable.tsx`).
- **Contagem:** derivada de `allVouchers.filter(v => v.etapaAtual === "RASCUNHO").length` no mesmo `useMemo` das demais métricas (~linha 348).

## Fora de escopo

- Backend (`get_vouchers_esteira` já retorna RASCUNHO).
- Mudar a opção "Rascunho" do dropdown de filtro (já existe).
- Auto-selecionar "Rascunho" como etapa padrão para qualquer role.
- Permissões de edição/aprovação de rascunho.

## Validação

1. Logar como usuário OPERACAO → o card "Rascunhos" aparece com a contagem; clicar nele filtra e exibe o 20261567156.
2. Filtro em "Todos" como OPERACAO → 20261567156 listado junto com os demais.
3. Logar como FISCAL/SUPERVISOR/FINANCEIRO → card não aparece e rascunhos seguem ocultos no auto-filtro de etapa (comportamento atual preservado).
