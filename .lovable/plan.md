## Objetivo

Substituir os dois botões separados de calendário ("Venc. de" e "Venc. até") por **um único botão de calendário** na tela de Pagamentos, que ao ser clicado abre um popover contendo **dois campos de data (De / Até)**, podendo o usuário preencher apenas um, apenas o outro, ou ambos.

## Comportamento

- Um botão único `[📅]` ao lado dos demais filtros.
- Ao clicar, abre um Popover contendo:
  - Campo "De" com `CalendarPicker mode="single"`
  - Campo "Até" com `CalendarPicker mode="single"`
  - Botão "Limpar" (resetar ambas)
- Filtro aplica-se de forma flexível:
  - Só "De" preenchida → filtra `vencimento >= De`
  - Só "Até" preenchida → filtra `vencimento <= Até`
  - Ambas → range entre as duas
  - Nenhuma → sem filtro
- O label do botão muda dinamicamente:
  - Sem datas: `Vencimento`
  - Só De: `≥ dd/MM/yyyy`
  - Só Até: `≤ dd/MM/yyyy`
  - Ambas: `dd/MM ─ dd/MM`
- Quando há qualquer data selecionada, o botão fica destacado (`border-primary text-primary`).

## Mudanças (arquivo único: `src/components/esteira/PagamentosTab.tsx`)

1. **Remover** os dois `<Popover>` independentes de "Venc. de" e "Venc. até" (linhas ~794-833).
2. **Adicionar** um único `<Popover>` com:
  - `PopoverTrigger`: botão único com label dinâmica.
  - `PopoverContent`: layout vertical com dois sub-popovers ou dois `CalendarPicker` lado a lado (preferência: dois `CalendarPicker` empilhados com labels "De" e "Até" + botão "Limpar" no rodapé).
3. **Manter** os states `filterDataInicio` e `filterDataFim` (já existem) — apenas a UI muda.
4. **Manter** a lógica de filtragem existente em `dateFilteredPagamentos` (já é flexível com cada campo opcional, segundo a implementação anterior). Se não estiver, ajustar para tratar cada lado como opcional.

## Não muda

- Backend / edge functions
- Estado e lógica de filtragem (apenas UI consolidada)
- Demais filtros (Vencimento quick, Status, etapas, busca)

## Resumo visual

```text
Antes:  [▼ Vencimento][📅 Venc. de][📅 Venc. até][Status ▼]
Depois: [▼ Vencimento][📅 Vencimento ⌄         ][Status ▼]
                              │
                              ▼ Popover
                       ┌──────────────────┐
                       │ De               │
                       │ [Calendário]     │
                       │ Até              │
                       │ [Calendário]     │
                       │ [Limpar]         │
                       └──────────────────┘
```