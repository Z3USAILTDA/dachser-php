# Ajustes na tela `/air/tracking-aereo`

Arquivo único editado: `src/pages/air/TrackingAereo.tsx`.

## 1. Coluna ETA/ETD (era Data/Hora)
- Renomear o header (linha ~1126) de `Data/Hora` para `ETA/ETD`.
- Trocar o conteúdo da célula (linha ~1330) de `formatDateTimeBR(awb.last_event_date)` para `formatDateTimeBR(awb.etd)`.
- Campo `etd` já existe na interface `AWBData` (linha 244) e já é retornado pela edge `fetch-status-aereo` (já consulta `etd` em `t_dados_aereo`). Nenhuma alteração de backend.

## 2. Remover coluna SLA
- Remover o `<th>` SLA (linha ~1128).
- Remover o bloco `{/* SLA */}` `<td>` completo (linhas ~1383–1402).
- Manter os campos `sla_cor`, `sla_tempo_formatado`, etc. no tipo (podem continuar sendo retornados pelo backend sem efeito visual).

## 3. Nova coluna Serviço + filtro
- Adicionar `<th>` "Serviço" após HAWB (ou antes de Cliente — a definir; manterei após HAWB seguindo ordem natural).
- Adicionar `<td>` exibindo `awb.tipo_servico || "-"` (campo já existe em `AWBData`, linha 251, e já é populado).
- Estado `filterService` já existe (linha 489); falta:
  - Adicionar `<Select>` no bloco de filtros (após Companhia/Analista) com opções derivadas de `uniqueServices` (novo `useMemo` similar a `uniqueAnalysts`, baseado em `awbsData.map(a => a.tipo_servico).filter`).
  - Incluir `matchesService = filterService === "all" || awb.tipo_servico === filterService` em `applyTopFilters` (linha 775) e na lista de dependências do `useCallback`.

## Observações
- Sem alterações em backend/edge functions — `etd` e `tipo_servico` já são retornados.
- Sem alterações no cache (`air_tracking_cache`); o payload existente já contém os campos.
- Nenhuma migração de banco.
