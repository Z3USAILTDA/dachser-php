---
name: Demurrage Tracking Source Alignment
description: Demurrage lê container/eventos exclusivamente de t_sea_tracking_current e t_sea_tracking_history (mesmas fontes da tela /sea/tracking). Sem dependência de t_consulta_armador.
type: feature
---
- `demurrage_sync_from_tracking` e `demurrage_get_containers_by_mbl` (em mariadb-proxy) consultam só `t_sea_tracking_current` + `t_sea_tracking_history`.
- Campos antes vindos de `t_consulta_armador` (booking, voyage, etd, status_armador, eta_confirmado) viram NULL.
- ATA = primeiro evento de chegada do histórico (discharge/vessel arrival/import/ATA por armador). NUNCA cai em ETA — sem fallback `ft_source = 'ETA'`.
- Devolução = primeiro evento de empty return do histórico (gate in empty, empty container return, empty in depot, devolução).
- Demais tabelas `t_dachser_demurrage_*` (rates, settings, profiles, pre_invoices, disputes, alerts) inalteradas.
