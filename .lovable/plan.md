## Refatoração CCT — Eventos cronológicos via `situacaoPortal` + métricas do snapshot atual

### Objetivo
Substituir a lógica atual de extração de eventos (que compara snapshots inteiros e gera eventos sintéticos de peso/volume/voo) pela query SQL fornecida, que:
- lê o **último snapshot** de `t_cct_hawb_api_historico` por HAWB para métricas (peso/volume/decolagem/bloqueios);
- lê **todos os snapshots** para extrair pares únicos `(situacaoPortal, dataUltimaAtualizacaoCargaDetalhada)` como eventos cronológicos.

Os campos auxiliares (Cliente, Master, Rota, Analista, Tratamentos Especiais, SLA, status_cct_oficial) continuam vindo dos JOINs já existentes com `t_dados_aereo` + `t_master_dados`.

### Mudanças no backend — `supabase/functions/mariadb-proxy/index.ts`

#### 1. `get_cct_shipments` (linha 3835)
Reescrever a CTE para incorporar a nova lógica:

- **Substituir `base_cct`** (que hoje lê `t_cct_hawb_api_atual`) por uma CTE `snapshot_atual` baseada em `MAX(id)` por HAWB de `t_cct_hawb_api_historico` (conforme query do usuário).
- **Adicionar CTE `eventos_unicos` + `eventos_consolidados`** extraindo `situacaoPortal` / `dataUltimaAtualizacaoCargaDetalhada` de **todo** o histórico, deduplicando.
- **Adicionar CTE `bloqueios_snapshot`** (TEVE_BLOQUEIO + motivos consolidados) conforme a query.
- Recalcular peso/volume/decolagem a partir de `snapshot_atual` (mesmos campos que a query do usuário).
- **Último evento** (para preencher `ultimo_evento_codigo`, `ultimo_evento_descricao`, `ultimo_evento_data` da listagem principal): selecionar o evento de `eventos_unicos` com `STR_TO_DATE(data_ultima_atualizacao, '%Y-%m-%d %H:%i:%s')` mais recente por HAWB (subquery com `ROW_NUMBER()`).
- Manter `aereo_latest` (JOIN com `t_dados_aereo`) e o `INNER JOIN tracking_status` para preservar Cliente, Master, Analista, Rota, Tratamentos Especiais e a regra de visibilidade existente.
- Manter o cálculo de `tipo_voo`, `sla_*`, `status_cct_oficial` inalterado, agora baseados no novo "último evento" e na `data_decolagem` do snapshot.

#### 2. `get_cct_events` (linha 7261)
Substituir todo o bloco de comparação de snapshots por uma única query baseada em `eventos_unicos`:

```sql
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(h.json_identificacao, '$.situacaoPortal')) AS situacao_portal,
  JSON_UNQUOTE(JSON_EXTRACT(h.json_identificacao, '$.dataUltimaAtualizacaoCargaDetalhada')) AS data_ultima_atualizacao
FROM t_cct_hawb_api_historico h
WHERE h.hawb_normalizado = ?
  AND h.json_identificacao IS NOT NULL
  AND JSON_VALID(h.json_identificacao)
  AND JSON_UNQUOTE(JSON_EXTRACT(h.json_identificacao, '$.situacaoPortal')) <> ''
  AND JSON_UNQUOTE(JSON_EXTRACT(h.json_identificacao, '$.dataUltimaAtualizacaoCargaDetalhada')) <> ''
GROUP BY situacao_portal, data_ultima_atualizacao
ORDER BY STR_TO_DATE(data_ultima_atualizacao, '%Y-%m-%d %H:%i:%s') ASC;
```

Mapear cada linha para um `CCTEvento`:
- `codigo_evento` ← derivado de `situacao_portal` via `mapSituacao()` (já existente)
- `descricao_evento` ← `situacao_portal` (texto original)
- `data_hora_evento` ← `data_ultima_atualizacao` convertida para ISO
- `fonte` ← `'RFB'`, `nivel_confianca` ← `'PRIMARIA'`

**Remover** a geração de eventos sintéticos: `PESO_CONSTATADO`, `VOLUME_CONSTATADO`, `VOO_PARTIDA`, `DIVERGENCIA`, `DUIMP_VINCULADA`, e a comparação de fingerprints de bloqueios (a presença de bloqueio passa a ser exposta apenas via `TEVE_BLOQUEIO` na listagem; eventos `BLOQUEIO`/`DESBLOQUEIO` não fazem mais parte da timeline cronológica baseada em `situacaoPortal`).

### Mudanças no frontend

#### `src/hooks/useCCTData.ts`
- `mapRowToProcessoCCT`: nenhum schema novo no row — apenas garantir que `peso_declarado`, `peso_constatado`, `volume_declarado`, `volume_constatado`, `data_decolagem` e `ultimo_evento_*` continuem sendo lidos (já são).
- `useCCTEvents`: já consome `data.data` como lista linear — ordenar por `data_hora_evento ASC` no cliente como salvaguarda (backend já ordena).

#### `src/pages/cct/ProcessoTimeline.tsx` / `src/components/cct/EventTimeline.tsx`
- Garantir que `EventTimeline` exiba a lista em ordem cronológica ASC e destaque o **último** (mais recente) — verificar se já faz isso; ajustar se necessário.
- Nada muda na listagem principal: continua exibindo `ultimo_evento_descricao` + `ultimo_evento_data` vindos do backend.

### Validação
1. Rodar a query do usuário diretamente em alguns HAWBs (ex.: `BRE16429865`) via `mariadb-proxy` action de debug e conferir o retorno antes de reescrever a CTE.
2. Após implementação: abrir `/air/cct` e `/air/cct/processo/BRE16429865` e validar:
   - Listagem mostra `situacaoPortal` mais recente + sua data como último evento.
   - Timeline mostra todos os pares únicos `(situacaoPortal, data)` em ordem cronológica.
   - Peso recebido/constatado, volume recebido/constatado e data de decolagem batem com o snapshot.
   - Cliente, Master, Rota, Analista e Tratamentos Especiais permanecem inalterados.

### Pontos que pretendo confirmar durante a implementação
- Se já existe HAWB sem `hawb_normalizado` no histórico (a query do usuário usa `hawb`, mas o lookup atual em `get_cct_events` usa `hawb_normalizado` — vou padronizar para `hawb_normalizado` no `WHERE` para manter compatibilidade com as buscas atuais).
- Manter o fallback `t_dados_aereo.gross_weight_kg` / `pieces` para peso/volume declarado quando o snapshot não trouxer.
