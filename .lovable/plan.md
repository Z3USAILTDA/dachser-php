## Problema

Após a mudança recente onde a coluna "Último evento" e o badge de status passaram a refletir `container_status` (vindo de `t_sea_tracking_current`), os cards do topo (Em Trânsito, Em Alerta, Crítico, Entregues) continuaram lendo `mbl.last_event`. Como `last_event` está vazio/diferente para a maioria dos MBLs, todas as classificações caem fora dos códigos esperados (CRG/DEP/TSP/ARR/DCH/GOD/DLV) e os cards mostram 0. Só "Total MBLS" funciona porque é uma contagem bruta da lista.

## Correção (somente frontend)

Arquivo: `src/pages/ContainerTracking.tsx`

1. Em `isEmTransito` e `isEntregue`, usar `container_status` como fonte primária, com fallback para `last_event`:
   - Trocar a chamada para `getReportStatus(m.container_status ?? m.last_event, m.container_status, m.tipo_processo)` (mesma forma usada no badge da coluna SITUAÇÃO).
2. Em `isEmAlerta`, manter a regra de `is_eta_delayed`, e na verificação textual usar `container_status || last_event` (assim mantém DELAYED/CANCELLED/HOLD se aparecer em qualquer dos campos).
3. Atualizar as chamadas em:
   - `useMemo` que calcula `stats` (linhas 2096–2099)
   - O filtro por card (`activeCardFilter`, linhas 2057–2063)
   - Qualquer uso na renderização da tabela (linha 2746–2747) para manter consistência com os cards.
4. Sem mudanças em backend, edge functions ou esquema. Sem novas dependências.

## Validação

- Recarregar `/sea/tracking`: cards passam a refletir as mesmas categorias mostradas no badge da coluna SITUAÇÃO (DEP, GIO, CLT, CRG, etc.) — DEP/CRG entram em "Em Trânsito", GOD/DLV em "Entregues", e MBLs com `is_eta_delayed`/`is_critico` em "Alerta"/"Crítico".
- Clicar em cada card filtra a tabela corretamente.
- Total MBLS continua igual.