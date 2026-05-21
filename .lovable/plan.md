## Ajustes no Monitoramento Marítimo (v2 — revisado)

### Mudança principal: visão expandida com linha única por MBL + drill-down de eventos

Substituir a tabela atual de "uma linha por container" por uma **única linha agregada do MBL** (todos containers compartilham o mesmo navio e rota), com botão `+` que expande **linhas adicionais** mostrando o histórico cronológico de eventos.

### 1. Coluna Coordenador faltando

**Causa:** em `olimpo-proxy/get_sea_tracking` (linha ~2221), `nome_analista` é resolvido só via `COALESCE(t_sea_master.nome_analista, t_dados_maritimo.clerk)`. MBLs vindos por outras vias ficam vazios.

**Correção:**
- Expandir COALESCE para também usar `ts.email_analista` (já existente em `t_tracking_sea`).
- Em `sync_sea_tracking`, gravar `email_analista` a partir de `COALESCE(dm.clerk, dm.clerk_email)`.

### 2. Nova visão expandida (substitui timeline modal)

A API JSONCargo retorna `data.events[]` e esses eventos **já são persistidos** em `dados_dachser.t_tracking_sea_history` no `refresh_sea_tracking` (linhas 3411-3627). Action `get_tracking_history` já existe no `olimpo-proxy` (linha 6270) e retorna data/hora, local, navio, descrição, código e status.

**Redesenho da seção expandida em `src/pages/ContainerTracking.tsx`:**

Antes (uma linha por container):
```
Container        | Armador | Status | Último Evento | ETA Tracking | ...
HLBU 1759058     | Hapag   | DEP    | Vessel dep... | 09/03/2026   | ...
HLBU 1759059     | Hapag   | DEP    | Vessel dep... | 09/03/2026   | ...
HLBU 1759060     | Hapag   | DEP    | Vessel dep... | 09/03/2026   | ...
```

Depois (linha agregada + drill-down por evento):
```
[+] HLBU1759058, HLBU1759059, HLBU1759060 | Hapag | DEP | Vessel departed - VALENCIA · 09/03/2026 14:32 | 09/03/2026 | — | 12/03/2026, 08:08
      └─ 09/03/2026 14:32  DEP   Vessel departed         VALENCIA, ES     navio MUNKEBO MAERSK
      └─ 05/03/2026 21:10  LOAD  Loaded on Vessel        VALENCIA, ES     navio MUNKEBO MAERSK
      └─ 03/03/2026 09:45  GTIN  Gate In Full            VALENCIA, ES     —
      └─ ...
```

**Detalhes de implementação:**

- Substituir o `mblContainers.map(cnt => <tr>)` por uma **única `<tr>` resumo** com:
  - Coluna Container: chips/badges para cada `container` distinto (`mblContainers.map(c => c.container).join(', ')` ou flex-wrap de pills).
  - Status/Armador/ETA/Última atualização: agregados (já são iguais entre irmãos do mesmo MBL).
  - Último Evento: descrição + **data/hora** (campo `event_datetime` já vem em ISO via `t_tracking_sea.last_check` para fallback, mas o mais correto é exibir `MAX(event_datetime)` de `t_tracking_sea_history`).
  - Botão `+` (ChevronDown/Up) no início da linha, controlando `eventsExpanded` (estado local por MBL).

- Quando `eventsExpanded = true`:
  - Fetch lazy via `supabase.functions.invoke('olimpo-proxy', { method:'GET' })` para `?action=get_tracking_history&mbl_id=...&limit=200` (a action atual aceita POST com JSON; mantemos POST).
  - Renderizar uma `<tr>` por evento (colSpan total), em ordem **cronológica decrescente** (já vem assim do backend) ou ascendente conforme escolhido.
  - Cada linha de evento mostra: hora (`event_datetime` em UTC-3, formato `dd/MM/yyyy HH:mm`), código, descrição, local, navio. Usar tokens Dachser (gold accent na hora, foreground neutro para texto).

- **Hora no "Último Evento" da linha resumo**: ler `last_check` (ou `MAX(event_datetime)` se vier na action) e exibir `dd/MM/yyyy HH:mm` ao lado da descrição.

**Sem modal novo, sem novo componente externo.** Toda mudança fica em `ContainerTracking.tsx` + um pequeno helper para chamar `get_tracking_history`.

### 3. Inconsistência DLV vs GIO entre badge e tooltip

**Causa:** `ContainerTracking.tsx` linha 2002-2003 usa `getReportStatus(last_event, container_status)`; linha 2635 usa `getStatusDescription(mbl.last_event)` (sem `container_status`). Também, `EMPTY_RECEIVED_AT_CY` está mapeado fixo para DLV (linha 278), mas para SEA EXPORT pode ser GIO (gate-in vazio).

**Correção:**
- Adicionar parâmetro opcional `containerStatus` a `getStatusDescription` e `getTimelineProgress` e propagar nas chamadas.
- Em `getReportStatus`, condicionar `EMPTY_RECEIVED_AT_CY` ao `tipo_processo`: EXPORT → GIO; IMPORT → DLV.

### 4. 20 processos AGD não encontrados

**Causa:** `sea-carrier-fallback` só cobre HAPAG, HAMBURG SUD, MSC, ONE. MBLs de COSCO/MAERSK/CMA/EVERGREEN/YANG MING/HMM/ZIM ficam em `skipped_no_carrier`. Além disso, `MAX_MBLS = 15` por execução.

**Correção:**
- SQL de diagnóstico para listar os 20 AGD atuais por armador (confirmar distribuição).
- Adicionar carriers faltantes ao `CARRIER_CONFIG` (verificar quais edge functions `draft-track-*` já existem; se faltar, sinalizar criação).
- Subir `MAX_MBLS` para 40 ou tornar configurável.
- Botão "Retry NAO_ENCONTRADO" existente (linha 3052) passar a invocar também `sea-carrier-fallback` em loop até esvaziar.

### 5. 9 processos "Sem informação no armador" (SIA)

**Causa:** `container='NAO_ENCONTRADO'` — fallback consultou o armador e veio vazio (linha 142-145 do `sea-carrier-fallback`). Pode ser MBL inválido, sufixo, ou armador atrasado.

**Correção:**
- SQL diagnóstico dos 9 SIA atuais.
- Gravar `last_error` informativo ("Armador X retornou vazio em DD/MM HH:MM").
- Retry com cooldown em `sea-carrier-fallback`: NAO_ENCONTRADO com `last_check < 24h` é pulado; após 24h re-tenta; após 7 dias marca como "verificar manualmente".

### 6. Novos processos de t_dados_maritimo não populando

**Causas prováveis em `sync_sea_tracking` (linhas 2711-2732):**
- `LIMIT 300` pode truncar lotes.
- `INSERT IGNORE` não reativa registros com `active = 0`.
- REGEXP pode rejeitar prefixos válidos sem log.

**Correção:**
- **Remover o `LIMIT` do SELECT de candidatos** (sem teto — todos os MBLs elegíveis são processados em cada execução).
- Trocar `INSERT IGNORE` por `INSERT ... ON DUPLICATE KEY UPDATE active = 1`.
- Adicionar `UPDATE t_tracking_sea SET active = 1` para MBLs que reapareceram em t_dados_maritimo.
- Expor contadores no retorno: `total_candidates`, `rejected_by_regex` (com amostra), `inserted`, `reactivated`, `already_active`.

### Arquivos a modificar
- `supabase/functions/olimpo-proxy/index.ts` — `get_sea_tracking` (COALESCE coordenador), `sync_sea_tracking` (remover LIMIT + reativação + contadores). `get_tracking_history` já existe, não muda.
- `supabase/functions/sea-carrier-fallback/index.ts` — carriers, MAX_MBLS, retry cooldown, last_error.
- `src/pages/ContainerTracking.tsx` — toda a seção expandida (linha agregada + drill-down de eventos), correções de `getStatusDescription`/`getTimelineProgress`, mapeamento EMPTY_RECEIVED_AT_CY por tipo_processo, hora no último evento.

### Ordem sugerida
1. Diagnóstico SQL (20 AGD + 9 SIA + sem coordenador + MBLs faltantes).
2. Item 6 (sync) — destrava demais.
3. Itens 4 e 5 (fallback + retry).
4. Item 1 (coordenador).
5. Item 3 (consistência DLV/GIO).
6. Item 2 (nova visão expandida com drill-down de eventos).
