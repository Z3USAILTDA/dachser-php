---
name: Air Data Mirroring Intent v2
description: Exact mapping of last status or first timeline event with IATA-based top election
type: feature
---

A visualização do Tracking Aéreo (/air/tracking) segue a diretriz de espelhamento total, refletindo os dados brutos do banco MariaDB.

**Eleição do "último evento" (pickTopByIATA)**: O "último evento" exibido no card é eleito entre os 3-4 slots devolvidos pelo SQL (`JSON_EXTRACT($[0..3])` em `fetch-tracking-aereo`). **Regra de aeroporto (prioridade primária)**: os slots são agrupados por `loc` (aeroporto). Quando há mais de um aeroporto entre os top 4, o aeroporto cujo evento mais recente (data parseada) for maior vence — isso garante que re-manifestações em novo trecho (ex.: AWB recebido em CPT, depois MAN/PRE em JNB para novo voo) sejam reconhecidas como "último evento". **Dentro do aeroporto vencedor**, a hierarquia IATA decide: POD=44 > DLV=43 > NFD=42 > RCF=41 > AWD/AWR/CCD=40 > ARR=39 > TRM=38 > TFD=37 > DEP=36 > MAN=35 > RCS=34 > FOH=33 > BKD=32 > PRE=20 > DOC=12 > RCT=11 > FWB=4. Ordem segue fluxo IATA outbound real: BKD < FOH < RCS < MAN. Critério de desempate: índice original menor (preserva ordem do SQL). Não há reordenação da timeline completa — apenas a eleição do slot vencedor.

**Resolução de código por slot (`resolveCodeFromSlot`)**: ordem de prioridade — (1) `status_code` nativo do JSON; (2) **EXACT_MAP** construído a partir de `t_eventos_awb.descricao_en` + `t_description_eventos.description` (match exato após normalização `upper().trim().replace(/[^\w\s]/g,' ').replace(/\s+/g,' ')`); (3) **KEYWORD_INDEX** das mesmas tabelas, ordenado por tamanho da needle DESC (substring mais específica vence); (4) regex IBS `\| Code XXX \|`; (5) prefixo IATA no início da descrição (`^([A-Z]{2,5})\b`); (6) regex Lufthansa `(XXX)`. Todo candidato é validado contra a whitelist `VALID_IATA` antes de ser aceito; falha → tenta o próximo passo. As tabelas `t_eventos_awb` e `t_description_eventos` são a fonte canônica/autoritativa de mapeamento descrição→sigla, mantidas pela operação.

**Fallback de `last_status_code` cru**: só é aceito quando bate com whitelist de códigos IATA válidos (chaves de IATA_WEIGHT + OFLD/NIL/NIF/DIS/TFD/RCT/TRM/POD/UNK). Caso contrário `finalCode = null` e o front exibe "Aguardando consulta" — nunca infere código a partir de localização (FRA, FCO, GRU).

**Front-end (`getStatusCode` em `TrackingAereo.tsx` e `Index.tsx`)**: nunca usa `substring(0,3)` como fallback. Se `last_event` não bater com `knownStatusCodes` nem com prefixo válido antes de " - ", retorna `"UNK"`.

**Modal vs card consistência**: `mariadb-proxy.get_awb_tracking_events` aplica o mesmo `pickTopByIATA` apenas para mover o slot eleito para a posição 0 da timeline retornada — os demais itens preservam a ordem do SQL.

**MANUAL_OVERRIDES** mantêm prioridade absoluta sobre toda a lógica de eleição.
