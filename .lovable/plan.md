
## Objetivo

Para Demurrage de Importação, abandonar ETA como base de cálculo e usar a ATA efetiva extraída do tracking do armador. Realinhar relatório baixado, anexo do e-mail e corpo do e-mail (mesma função de cálculo, mesmos campos, mesma nomenclatura).

## Regra de cálculo (Importação)

```text
Limite Devolução = ATA + FreeTime - 1
Dias em Posse    = (Devolução || Hoje) - ATA + 1   (inclusivo)
Dias Excedidos   = max(0, Dias em Posse - FreeTime)
```

- Sem ATA efetiva: não calcular, marcar "ATA não encontrada", pendente de revisão. Nunca cair em ETA.
- Sem Devolução: contar até hoje, status em aberto.

## Mapeamento de eventos por armador

Helper único `carrierEvents` com regras (normalize lowercase + includes):

| Armador | ATA | Devolução |
|---|---|---|
| HAPAG-LLOYD | vessel arrival | gate in empty |
| MSC | import | empty |
| CMA-CGM | vessel arrival | empty in depot |
| ZIM | vessel arrival to port of discharge | empty container gate in |
| MAERSK | vessel arrival | empty container return |
| HMM | vessel arrival at pod | import empty container returned |
| ONE | vessel arrival at port of discharge | empty container returned from customer |
| COSCO | ata | empty return |

OOCL / EVERGREEN ficam sem regra (retornam "ATA não encontrada") até confirmação.

## Arquivos

**Novos (compartilháveis frontend + edge):**
- `src/utils/demurrageCalc.ts` — `parseDateOnly`, `addDays`, `diffDaysInclusive`, `calculateImportDemurrage`, `normalizeCarrier`, `isAtaEvent`, `isReturnEvent`, `extractDemurrageDatesFromEvents`.
- `supabase/functions/_shared/demurrageCalc.ts` — espelho da mesma lógica (Deno).

**Alterar (frontend):**
- `src/utils/demurrageExcelExport.ts` — substituir colunas pela ordem solicitada (Armador, MBL, HBL, Tipo Operação, Partner ID, Cliente, Container, Tipo Container, Tipo, CNPJ Cliente, ATA, Devolução, Limite Devolução, Free Time, Dias em Posse, Dias Excedidos, Status Risco, Último Evento, Porto Origem, Porto Destino, Incidência, Cost Center). Remover Shipment. Renomear "Tipo Medida" → "Tipo". Calcular ATA/Devolução/Limite/Dias via `demurrageCalc.ts`.
- `src/utils/demurragePdfExport.ts` — mesmas mudanças.
- `src/pages/demurrage/DemurrageMonitor.tsx` — passar `eventos`/histórico para o exporter (necessário para resolver ATA real); ajustar cabeçalhos visíveis se exibirem "Tipo Medida" ou "Shipment".

**Alterar (backend):**
- `supabase/functions/demurrage-send-alert/index.ts`:
  - Subject: 1 container → `Demurrage - Container <numero>`; N>1 → `Demurrage - N containers em acompanhamento`.
  - Corpo: trocar Shipment→CNPJ Cliente, Tipo Medida→Tipo, adicionar ATA, Devolução, Limite Devolução, Dias em Posse, Dias Excedidos.
  - Anexo: gerar com os mesmos campos/ordem do exporter frontend (porta para Deno do `demurrageCalc.ts`).
- `supabase/functions/demurrage-alert-cron/index.ts` — garantir que o payload enviado ao `send-alert` carregue eventos/histórico do container e CNPJ do cliente.
- `supabase/functions/demurrage-recalc/index.ts` — quando recalcular containers de importação, derivar `ft_started_at` (=ATA) e `data_devolucao` a partir dos eventos do tracking (via `extractDemurrageDatesFromEvents`), nunca de ETA. Se ATA ausente: `risk_status='pending_review'`, não calcular custo. Recalcular `days_remaining`/`excedente_dias` com regra inclusiva (`FreeTime-1`, `+1`).

## Origem dos eventos

Buscar histórico do container em `dados_dachser.t_tracking_sea` (campos `last_event`, `container_status`) e na tabela de histórico de eventos usada pelo monitor marítimo (a função `sea-get-history` já expõe). Para o cron de recalc, adicionar uma query auxiliar no `mariadb-proxy` (`demurrage_get_container_events`) que retorne eventos ordenados por data para os containers ativos — sem mudar schema.

## Consistência

Relatório da tela, anexo e corpo do e-mail consomem a MESMA função `calculateImportDemurrage` + a mesma lista de colunas (constante exportada `DEMURRAGE_REPORT_COLUMNS`) para garantir paridade.

## Fora de escopo

Login/RLS, módulos FIN/Esteira, tracking marítimo geral, schema do banco. Exportação atual (`DemurrageExportacaoPdfExport`) só será tocada se compartilhar utilitário.

## Critérios de aceite

1. Nenhum campo do relatório/e-mail usa ETA como ATA.
2. ATA e Devolução vêm dos eventos mapeados por armador.
3. Limite de Devolução exibido em relatório, anexo e e-mail.
4. Dias em Posse / Dias Excedidos calculados de forma inclusiva.
5. "Shipment" removido, "CNPJ Cliente" presente; "Tipo Medida" renomeado para "Tipo".
6. Assunto do e-mail usa Container (ou contagem se múltiplos).
7. Anexo e corpo do e-mail iguais ao relatório baixado pela tela.
8. Containers sem ATA aparecem como "ATA não encontrada" e não são cobrados.
