---
name: Air Data Mirroring Intent v2
description: Exact mapping of last status or first timeline event with IATA-based top election and BKD filtering
type: feature
---

A visualização do Tracking Aéreo (/air/tracking) segue a diretriz de espelhamento total, refletindo os dados brutos do banco MariaDB.

**Eleição do "último evento" (pickTopByIATA)**: O "último evento" exibido no card é eleito entre os 6 slots devolvidos pelo SQL (`JSON_EXTRACT($[0..5])` em `fetch-tracking-aereo`).

**Filtragem de BKD**: Eventos BKD (Booked) representam reservas planejadas/futuras feitas com antecedência para cada aeroporto da rota planejada, frequentemente com timestamps de ETD futuros que parecem "mais recentes". **Quando existir pelo menos um evento operacional não-BKD entre os slots, todos os BKDs (incluindo variantes BKG/BOOKED) são filtrados**, e o vencedor é eleito entre os operacionais. Se todos os slots forem BKD, mantém-se a lógica original (BKD mais recente vence). Por isso o SQL extrai 6 slots em vez de 4 — garante captura de eventos operacionais (FOH, RCS, MAN) mesmo quando precedidos por múltiplas entradas BKD.

**Regra primária**: vence sempre o slot com data/hora parseada mais recente. **Hierarquia IATA só atua em empate exato de data/hora** entre slots do topo: POD=44 > DLV=43 > NFD=42 > RCF=41 > AWD/AWR/CCD=40 > ARR=39 > TRM=38 > TFD=37 > DEP=36 > MAN=35 > RCS=34 > FOH=33 > BKD=32 > PRE=20 > DOC=12 > RCT=11 > FWB=4. Ordem segue fluxo IATA outbound real: BKD < FOH < RCS < MAN. Critério de desempate final: índice original menor (preserva ordem do SQL). Se nenhuma data for parseável, preserva-se a ordem original do SQL. Não há reordenação da timeline completa — apenas a eleição do slot vencedor.

**Resolução de código por slot (`resolveCodeFromSlot`)**: ordem de prioridade — (1) `status_code` nativo do JSON; (2) **EXACT_MAP** construído a partir de `t_eventos_awb.descricao_en` + `t_description_eventos.description` (match exato após normalização `upper().trim().replace(/[^\w\s]/g,' ').replace(/\s+/g,' ')`); (3) **KEYWORD_INDEX** das mesmas tabelas, ordenado por tamanho da needle DESC (substring mais específica vence); (4) regex IBS `\| Code XXX \|`; (5) prefixo IATA no início da descrição (`^([A-Z]{2,5})\b`); (6) regex Lufthansa `(XXX)`. Todo candidato é validado contra a whitelist `VALID_IATA` antes de ser aceito; falha → tenta o próximo passo. As tabelas `t_eventos_awb` e `t_description_eventos` são a fonte canônica/autoritativa de mapeamento descrição→sigla, mantidas pela operação.

**Fallback de `last_status_code` cru**: só é aceito quando bate com whitelist de códigos IATA válidos (chaves de IATA_WEIGHT + OFLD/NIL/NIF/DIS/TFD/RCT/TRM/POD/UNK). Caso contrário `finalCode = null` e o front exibe "Aguardando consulta" — nunca infere código a partir de localização (FRA, FCO, GRU).

**Front-end (`getStatusCode` em `TrackingAereo.tsx` e `Index.tsx`)**: nunca usa `substring(0,3)` como fallback. Se `last_event` não bater com `knownStatusCodes` nem com prefixo válido antes de " - ", retorna `"UNK"`.

**Modal vs card consistência**: `mariadb-proxy.get_awb_tracking_events` aplica o mesmo `pickTopByIATA` apenas para mover o slot eleito para a posição 0 da timeline retornada — os demais itens preservam a ordem do SQL.

**MANUAL_OVERRIDES** mantêm prioridade absoluta sobre toda a lógica de eleição.
