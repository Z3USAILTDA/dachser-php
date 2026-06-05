# Discrepâncias de troca de master no card Críticos + filtro

## Objetivo
Garantir que processos com discrepância de troca de master (registros PENDENTE em `t_aereo_master_discrepancia`) sejam contabilizados e visíveis no card **Críticos** da tela `/air/tracking-aereo`, e adicionar um botão de filtro **"Troca de master"** na barra de filtros para isolar somente esses processos.

## Mudanças

### 1. Backend (`mariadb-proxy/index.ts`)
- Ajustar `air_master_discrepancy_list` (ou criar action auxiliar) para retornar o conjunto de pares `(awb, hawb)` PENDENTES — usado pelo frontend para marcar linhas.
- Na action que alimenta o dashboard (contagem de Críticos), incluir como Crítico qualquer AWB+HAWB presente em `t_aereo_master_discrepancia` com `status='PENDENTE'`, mesmo que `last_status_code` não seja crítico por si só. Sem alterar a regra de Alertas.

### 2. Frontend (`src/pages/air/TrackingAereo.tsx`)
- Após carregar a lista de AWBs, cruzar com `air_master_discrepancy_list` e marcar essas linhas com flag `hasMasterDiscrepancy=true`.
- **Card Críticos**: incluir essas linhas na contagem e na listagem do card (união com os críticos atuais, dedup por awb+hawb).
- **Barra de filtros**: adicionar botão/chip **"Troca de master"** ao lado dos filtros existentes (mesmo estilo dos atuais — pill com ícone `GitMerge` ou `Replace`). Quando ativo, a tabela mostra apenas as linhas com `hasMasterDiscrepancy=true`. Toggle on/off; mutuamente compatível com a busca textual.
- Badge de "Discrepância de master" já existente continua aparecendo inline.

### 3. Regras
- Não altera detecção/cron, schema, nem a lógica de resolução manual já implementada.
- Não cria painel fixo (memória anterior: removido a pedido).
- Sem mudanças em RLS, sem novas tabelas.

## Detalhes técnicos
- Junção no frontend para evitar nova query pesada; `air_master_discrepancy_list` já retorna o conjunto pendente.
- Contagem do card Críticos = `count(distinct awb||hawb)` da união (críticos por status) ∪ (pendentes de discrepância).
- Filtro persiste apenas em estado local (sem URL/localStorage), seguindo padrão dos outros filtros da página.
