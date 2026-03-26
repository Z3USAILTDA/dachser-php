

## Nova Tela: `/air/tracking-aereo`

Criar uma nova tela com o mesmo design visual do `/air/tracking` mas com backend baseado nas tabelas `t_dados_aereo`, `t_aereo_scraper`, `t_eventos_awb` e `t_description_eventos`.

---

### Arquitetura

```text
┌─────────────────────────┐     ┌──────────────────────────┐
│  /air/tracking-aereo    │────▶│  fetch-tracking-aereo    │
│  (TrackingAereo.tsx)    │     │  (nova edge function)    │
│  Mesmo design visual    │     │  Query: t_dados_aereo +  │
│  do Index.tsx           │     │  t_aereo_scraper +       │
└─────────────────────────┘     │  t_eventos_awb +         │
                                │  t_description_eventos   │
                                └──────────────────────────┘
```

---

### 1. Nova Edge Function: `fetch-tracking-aereo`

**Arquivo:** `supabase/functions/fetch-tracking-aereo/index.ts`

Conecta ao MariaDB (usando as mesmas credenciais `MARIADB_*`) e executa a query fornecida:

- **Select interno** busca: `awb_number`, `hawb_number`, `consignee_nome`, `clerk`, `clerk_email`, `etd`, `last_flight`, `origin`, `destination`, `timeline_json`, `last_status_code` + campos calculados (penúltimo/último evento, locations)
- **Select externo** resolve o `last_event` real comparando IDs do último e penúltimo evento
- Retorna array de objetos normalizados com campos: `awb`, `hawb`, `consignee_name`, `clerk`, `clerk_email`, `etd`, `last_flight`, `origin`, `destination`, `timeline_json`, `last_event` (código real), `last_event_description`, `last_event_date`, `last_event_location`, `penultimate_location`
- Corrige o typo `toda.awb_number` → `tda.awb_number` na query
- Sem parâmetro `awb_number` na query (busca todos os registros para popular o grid)
- Usa `COLLATE utf8mb4_unicode_ci` em todos os JOINs conforme padrão do projeto

**Lógica dos cards** (calculada no frontend, baseada nos dados retornados):
- **Total Monitorados**: total de registros retornados
- **Em Trânsito**: `last_event` IN (`DEP`, `MAN`, `RCF`, `ARR`)
- **Em Alerta**: processos onde `etd` indica atraso (ETD < now e não chegou)
- **Críticos**: processos com discrepância de peças/peso na `timeline_json` OU `last_event` IN (`NIL`, `NIF`, `OFLD`)

---

### 2. Nova Página: `src/pages/air/TrackingAereo.tsx`

Cópia estrutural do `Index.tsx` com as seguintes adaptações:

**Dados/Backend:**
- Chama `fetch-tracking-aereo` em vez de `fetch-status-aereo`
- Mapeia campos do novo backend para `AWBData`:
  - `awb` ← `awb_number`
  - `hawb` ← `hawb_number`
  - `consignee_name` ← `consignee_nome`
  - `nome_analista` ← `clerk`
  - `email_analista` ← `clerk_email`
  - `etd` ← `etd`
  - `origem` ← `origin`
  - `destino` ← `destination`
  - `last_event` ← `last_event` (código real do select externo)
  - `conexao` ← derivada comparando `last_event_location` e `penultimate_location` com `origin`/`destination`
  - `last_event_date` ← data/hora do último evento na timeline_json
  - `hours_in_status` ← calculado no frontend a partir da data do último evento

**Lógica de Situação:**
- Usa `etd` para determinar se está no prazo ou em atraso
- Se `etd` < agora E último evento não é `ARR`/`DLV`/`POD` → atraso
- Se se enquadra no card crítico → crítico

**Cards** (mesma lógica definida acima, calculada no frontend)

**Timeline Modal:**
- Usa `timeline_json` diretamente do registro (já vem do `t_aereo_scraper`)
- Ordena pela lógica do `last_event` para garantir que o evento real mais recente fique no topo
- Passa `awb_number`, `consignee_nome` e `timeline_json` para o modal

**Funcionalidades mantidas idênticas:**
- Filtros (Companhia, Analista, Serviço, Impo/Expo, busca textual)
- Modal de CIAs Monitoradas
- Painel de estatísticas do banco (DatabaseStatsPanel)
- Modal de novo processo (CadastroNovaModal)
- Modal de regras de notificação (EmailClienteRegrasDialog)
- Manual de uso (link para manual)
- Visualização de rota com highlighting de origem/conexão/destino
- Barra de rastreio (timeline progress)
- SLA badges
- Paginação
- Sorting por colunas

**Funcionalidades removidas/simplificadas:**
- Sem re-tracking automático (dados vêm da scraper table, não de API direta)
- Sem localStorage para AWBs (tudo vem do banco)
- Sem envio de emails de status change
- Sem botão "Forçar Novo Master"

---

### 3. Nova Rota

**Arquivo:** `src/App.tsx`

Adicionar:
```typescript
<Route path="/air/tracking-aereo" element={<TrackingAereo />} />
```

---

### 4. Timeline Modal Adaptado

Criar `src/components/air/AwbTimelineModalScraper.tsx` — variante do `AwbTimelineModal` que recebe `timeline_json` diretamente (já parseado) em vez de chamar o `mariadb-proxy`. A ordenação dos eventos usa a lógica do `last_event` (comparação de IDs do último e penúltimo evento) para garantir que o evento correto apareça no topo.

---

### Resumo de arquivos

| Arquivo | Ação |
|---------|------|
| `supabase/functions/fetch-tracking-aereo/index.ts` | Criar (edge function) |
| `src/pages/air/TrackingAereo.tsx` | Criar (página principal) |
| `src/components/air/AwbTimelineModalScraper.tsx` | Criar (modal de timeline) |
| `src/App.tsx` | Editar (adicionar rota) |

Nenhuma alteração de banco, RLS ou tabelas existentes.

