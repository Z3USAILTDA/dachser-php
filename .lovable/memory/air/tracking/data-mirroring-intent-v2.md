---
name: Air Data Mirroring Intent v2
description: Exact mapping of last status or first timeline event with IATA-based top election
type: feature
---

A visualização do Tracking Aéreo (/air/tracking) segue a diretriz de espelhamento total, refletindo os dados brutos do banco MariaDB.

**Eleição do "último evento" (pickTopByIATA)**: Para evitar inconsistências causadas por timeline_json gravado em ordens variadas pelo crawler, o "último evento" exibido no card é eleito por hierarquia IATA entre os 3-4 slots devolvidos pelo SQL (`JSON_EXTRACT($[0..3])` em `fetch-tracking-aereo`). Não há reparse de data nem reordenação da timeline completa. Hierarquia: POD=44 > DLV=43 > NFD=42 > RCF=41 > AWD/AWR/CCD=40 > ARR=39 > TRM=38 > TFD=37 > DEP=36 > MAN=35 > BKD=34 > FOH=33 > RCS=32. Critério de desempate: índice original menor (preserva ordem do SQL).

**Resolução de código por slot**: prioridade `status_code` nativo → regex IBS `\| Code XXX \|` → regex Lufthansa `(XXX)` → keyword/lookup de `t_eventos_awb`/`t_description_eventos`.

**Modal vs card consistência**: `mariadb-proxy.get_awb_tracking_events` aplica o mesmo `pickTopByIATA` apenas para mover o slot eleito para a posição 0 da timeline retornada — os demais itens preservam a ordem do SQL.

**MANUAL_OVERRIDES** mantêm prioridade absoluta sobre toda a lógica de eleição.
