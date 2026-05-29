# Resolver IMO automaticamente para o mapa do navio

Hoje o `VesselFinderMap` só renderiza quando recebe `imo` ou `mmsi`. Quando MSC/ONE retornam apenas `vesselName`, caímos no link externo. O plano abaixo enriquece automaticamente o IMO sem depender de APIs pagas.

## Estratégia em 3 camadas

```text
┌─────────────────────────────────────────────────────┐
│ 1. Cache interno (t_vessel_registry)                │ ← hit instantâneo
├─────────────────────────────────────────────────────┤
│ 2. Scraping VesselFinder (edge function)            │ ← fallback grátis
├─────────────────────────────────────────────────────┤
│ 3. Link externo (comportamento atual)               │ ← último recurso
└─────────────────────────────────────────────────────┘
```

Toda resolução bem-sucedida (camada 2) alimenta a camada 1, fazendo a base crescer sozinha.

## 1. Tabela de cache (MariaDB)

Nova tabela `t_vessel_registry` em MARIADB_SEA:

| coluna | tipo |
|---|---|
| vessel_name_normalized | VARCHAR(120) PK (UPPER, sem espaços extras) |
| vessel_name_original | VARCHAR(180) |
| imo | VARCHAR(20) |
| mmsi | VARCHAR(20) NULL |
| flag | VARCHAR(80) NULL |
| source | ENUM('hapag','msc','one','scrape','manual') |
| hit_count | INT DEFAULT 1 |
| last_seen | TIMESTAMP |
| created_at | TIMESTAMP |

Índice em `vessel_name_normalized`. Sem RLS (MariaDB, não Supabase).

## 2. Enriquecimento no backend de tracking (escopo "ambos")

Nas edge functions `draft-track-hapag-multi`, `draft-track-msc`, `draft-track-one`, após montar `bookingInfo`:

- Se `bookingInfo.vesselIMO` existe → **UPSERT** em `t_vessel_registry` (alimenta cache, source = carrier).
- Se `bookingInfo.vesselIMO` está vazio mas `vesselName` existe:
  1. SELECT em `t_vessel_registry` por `vessel_name_normalized` → preenche `vesselIMO` na resposta.
  2. Miss no cache → chama nova função `resolve-vessel-imo` (camada 3 abaixo). Se retornar IMO, preenche na resposta e o próprio resolver grava no cache.

Resultado: payload do tracking já chega com IMO sempre que possível, e `t_consulta_armador.vessel_imo` passa a ser populado consistentemente.

## 3. Nova edge function `resolve-vessel-imo`

Input: `{ vesselName: string }`
Output: `{ imo?: string, mmsi?: string, source: 'cache' | 'scrape' | 'none' }`

Fluxo:
1. Normaliza nome (UPPER, trim, colapsa espaços).
2. SELECT em `t_vessel_registry`. Hit → retorna `source: 'cache'`.
3. Miss → fetch `https://www.vesselfinder.com/vessels?name={encoded}`:
   - Extrai primeiro resultado via regex no HTML (`/\/vessels\/details\/(\d{7})/` para IMO).
   - Headers: User-Agent realista, timeout 8s.
   - Se sucesso → UPSERT no cache (source = 'scrape') e retorna.
4. Falha total → `source: 'none'`, sem erro 500 (apenas log).

Tolerância: scraping pode quebrar; falha silenciosa cai no comportamento atual (link externo). Sem secrets novos.

## 4. Fallback no frontend (camada de visualização)

`src/components/tracking/VesselFinderMap.tsx`:

- Quando `imo` e `mmsi` chegam vazios mas `vesselName` existe:
  - `useEffect` chama `supabase.functions.invoke('resolve-vessel-imo', { body: { vesselName } })`.
  - Enquanto resolve → mostra estado "Buscando navio…".
  - Sucesso → renderiza o iframe normalmente com o IMO retornado.
  - Falha/none → mantém o card atual com link externo (sem regressão visual).

Cache em memória (Map) na sessão para evitar invocações duplicadas do mesmo nome.

## 5. Limpeza/qualidade

- Função `resolve-vessel-imo` valida `vesselName` (Zod, min 2, max 120).
- CORS padrão Lovable.
- Logs concisos (`console.log`), sem toasts visuais (regra de error handling do projeto).
- Sem mudar `useDraftData`/`DraftExportacao` (mudanças isoladas em tracking + componente do mapa).

## Detalhes técnicos

### Arquivos novos
- `supabase/functions/resolve-vessel-imo/index.ts`
- Migration MariaDB (rodada via SQL direto no painel ou via edge function de bootstrap — o projeto não usa Supabase migrations para MariaDB).

### Arquivos editados
- `supabase/functions/draft-track-hapag-multi/index.ts` — UPSERT após sucesso.
- `supabase/functions/draft-track-msc/index.ts` — lookup + UPSERT.
- `supabase/functions/draft-track-one/index.ts` — lookup + UPSERT.
- `src/components/tracking/VesselFinderMap.tsx` — fallback async quando sem IMO.

### Riscos
- Scraping do VesselFinder pode mudar layout → função degrada graciosamente (retorna `none`).
- Nomes ambíguos ("MAERSK SHANGHAI" duplicado) → cache guarda o primeiro match; aceitável para visualização.

## Out of scope
- APIs pagas (MarineTraffic/Datalastic).
- Resolução de MMSI por IMO reverso.
- UI de gestão manual do `t_vessel_registry` (pode vir depois se necessário).
