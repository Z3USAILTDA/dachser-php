## Objetivo

Os processos exibidos na tela de Demurrage passam a refletir exatamente o que está em `t_sea_tracking_current` (estado/posição) e `t_sea_tracking_history` (eventos), as mesmas fontes que `/sea/tracking` agora usa. Os parâmetros próprios do Demurrage (free time, custos, perfis de cliente, pré-faturas, disputas) continuam vindos das tabelas `t_dachser_demurrage_*` — só muda a fonte de verdade do tracking.

## Mudanças no backend (`supabase/functions/mariadb-proxy/index.ts`)

### 1. `demurrage_sync_from_tracking` — fonte unificada

- Remover o JOIN com `t_consulta_armador` como fonte de ATA/voyage/status.
- Trazer **container, navio, IMO, origem, destino, consignee, last_event, container_status, e-mails, tipo_processo** diretamente de `t_sea_tracking_current` (já é o que /sea/tracking exibe).
- Resolver datas operacionais via subqueries em `t_sea_tracking_history` (mesmo padrão do fallback atual):
  - `data_atracacao` = MAX(`event_datetime`) onde `event_description` casa com regras do armador (HAPAG "vessel arrival", MSC "import", CMA "vessel arrival", ZIM "vessel arrival to port of discharge", MAERSK "vessel arrival", HMM "vessel arrival at pod", ONE "vessel arrival at port of discharge", COSCO "ata").
  - `data_devolucao` = MAX(`event_datetime`) onde `event_description` casa com `returnEvents` do mesmo armador (`gate in empty`, `empty`, `empty in depot`, etc.), e só conta se ≥ `data_atracacao`.
  - `data_gate_out` = MAX onde descrição contém "gate out".
- Manter regras já existentes de filtragem (active=1, container válido, tipo_processo SEA IMPORT/EXPORT, exclusão de PREFIX NOT FOUND etc.) e janelas IMPORT/EXPORT.

### 2. `demurrage_get_containers_by_mbl` (fallback)

- Mesma cadeia: ler container + eventos diretamente de `t_sea_tracking_current/history`. Remover dependência de `t_consulta_armador` para esses campos.

### 3. Sem mudança de cálculo

- `_shared/demurrageCalc.ts` e `extractDemurrageDatesFromEvents` continuam intactos. ATA/devolução continuam respeitando `resolveAta()` (nunca cai em ETA).

## Frontend

- Nenhuma mudança na UI. `DemurrageMonitor`, `ContainerDetailsSheet`, `PreInvoicing` já consomem `data_atracacao`, `data_devolucao`, `container_status`, `last_event`, `navio`, `cliente`, `free_time`. Os campos passam a refletir as duas tabelas-fonte.

## Refresh

- O cron `demurrage-daily-monitor` continua chamando `demurrage_sync_from_tracking` + `demurrage-recalc`. Sem novos cron jobs.
- Após o deploy, rodar 1× `demurrage_sync_from_tracking` manualmente para realinhar os containers ativos.

## Fora de escopo

- Não alterar `t_dachser_demurrage_*` (rates, settings, profiles, pre_invoices, disputes, alerts).
- Não trocar fonte do módulo de Exportação Demurrage que já tem regras próprias de PDF.
- Não mexer em RLS nem em outras telas SEA.

## Critérios de aceite

1. Após sync, cada linha do Demurrage Monitor traz `navio`, `last_event`, `container_status`, `data_atracacao` e `data_devolucao` idênticos aos da mesma MBL/container em `/sea/tracking`.
2. ATA exibida nunca usa ETA — só evento real de `t_sea_tracking_history`.
3. Devolução só aparece quando há evento de empty return ≥ ATA.
4. Pré-faturas continuam exigindo gate-out (regra existente preservada).
