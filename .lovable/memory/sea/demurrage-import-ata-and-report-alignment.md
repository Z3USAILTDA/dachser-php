---
name: Demurrage Import ATA + Report/Email Alignment
description: Importação usa ATA efetiva do tracking (nunca ETA). Limite Devolução = ATA+FreeTime-1, Dias em Posse = (Devolução||hoje)-ATA+1 (inclusivo). Relatório, anexo XLSX e e-mail compartilham `src/utils/demurrageCalc.ts` / `supabase/functions/_shared/demurrageCalc.ts`. Subject do alert usa "Container" (ou "N containers"). Tipo Medida→Tipo, Shipment→CNPJ Cliente. Eventos por armador no helper extractDemurrageDatesFromEvents.
type: feature
---
- ATA é resolvida via resolveAta() (data_atracacao || ft_started_at); nunca fallback em ETA.
- Sem ATA → "ATA não encontrada", sem cálculo de custo.
- Eventos por armador (HAPAG/MSC/CMA/ZIM/MAERSK/HMM/ONE/COSCO) normalizados via includes.
- send-alert: corpo HTML mostra tabela por container (ATA, Devolução, Limite, Dias em Posse, Dias Excedidos). Subject = "Demurrage - Container X" ou "Demurrage - N containers em acompanhamento". Anexo XLSX info-box label "Shipment:" → "CNPJ Cliente:".
- cron demurrage-alert-cron passa containers[] completo (ATA, free time, limite, devolução, dias) e cnpj_cliente para o send-alert.
