

## Plano: Reescrever query do fetch-tracking-aereo e alimentar grid existente com novo SELECT

### Resumo

Substituir a query SQL do `fetch-tracking-aereo` pelas 4 CTEs fornecidas (`base`, `codes`, `ids`, `final`). Manter **todas** as colunas do frontend iguais, apenas alimentando-as com os campos do novo SELECT. Processos com `ULTIMO_STATUS_CORRETO = NULL` ficam ocultos por padrão, mas aparecem como "Falha no Rastreio" quando pesquisados. E-mail enviado para larissa@z3us.ai com a lista de falhas.

### Mapeamento SELECT → Frontend

| Campo do SELECT | Coluna no Frontend |
|---|---|
| `AWB` | AWB |
| `HAWB` | HAWB |
| `CLIENTE` | Cliente |
| `ORIGEM` / `DESTINO` | Rota (origem → destino) |
| `ULTIMO_STATUS_CORRETO` | Último Evento + Rastreio (progress bar) + Situação + SLA |
| `DATA_HORA_ULTIMO_EVENTO` | Data/Hora |
| `LOCALIZACAO_ULTIMO_EVENTO` / `LOCALIZACAO_PENULTIMO_EVENTO` | Conexão (derivada) + highlight de rota |
| `ANALISTA` | Analista |
| `TIMELINE` | Modal de Timeline (já funciona assim) |

### Alterações

#### 1. `supabase/functions/fetch-tracking-aereo/index.ts` — Reescrever query

- Substituir toda a query SQL (linhas 48-279) pelas 4 CTEs (`base`, `codes`, `ids`, `final`) + SELECT final fornecido pelo usuário
- A CTE `base` já contém o filtro `master_insert >= '2026-03-20' OR created_at >= '2026-03-20'`
- Simplificar a normalização JS: o SQL já resolve `ultimo_status_correto` — não precisa mais da lógica de hierarquia de IDs no JS
- Retornar campos mapeados: `awb_number`, `hawb_number`, `consignee_nome` (CLIENTE), `origin`, `destination`, `loc0-loc3`, `clerk` (ANALISTA), `timeline_json`, `last_event` (ultimo_status_correto), `last_event_date` (data_hora_ultimo_evento), `last_status_code` (ultimo_status_correto_code para progress bar)
- Separar registros com `ultimo_status_correto = NULL` como `failed`
- Enviar e-mail via SMTP para larissa@z3us.ai com lista de AWB/HAWB/Cliente dos `failed`

#### 2. `src/pages/air/TrackingAereo.tsx` — Ajustar fetchData

- Atualizar `fetchData` para mapear os novos campos retornados (nomes mudaram ligeiramente)
- `last_event` agora vem do `ULTIMO_STATUS_CORRETO` (descricao_en, ex: "Received from Flight")
- Precisamos derivar o **code** do status para a progress bar e SLA — o backend deve retornar `ultimo_status_correto_code` além do `descricao_en`
- Processos com `ultimo_status_correto = null`: marcados como `tracking_failed = true`, ocultos por padrão, visíveis ao pesquisar com texto "Falha no Rastreio"
- Usar `loc0` como `last_event_location` e `loc1` como `penultimate_location` (mesma lógica de conexão existente)
- **Nenhuma coluna adicionada ou removida na grid**

#### 3. Timeline Modal

- Já recebe `timeline_json` e já renderiza corretamente — nenhuma alteração necessária
- O campo `TIMELINE` do SELECT é o mesmo `timeline_json` que já é passado ao modal

### Detalhe técnico do retorno normalizado

```typescript
return {
  awb_number: row.AWB || "",
  hawb_number: row.HAWB || "",
  consignee_nome: row.CLIENTE || "",
  clerk: row.ANALISTA || "",
  origin: row.ORIGEM || "",
  destination: row.DESTINO || "",
  timeline_json: parseJSON(row.TIMELINE),
  last_event: row.ULTIMO_STATUS_CORRETO || "",      // descricao_en
  last_status_code: row.ultimo_status_correto_code,  // code (para progress bar)
  last_event_date: row.DATA_HORA_ULTIMO_EVENTO,
  last_event_location: row.LOCALIZACAO_ULTIMO_EVENTO || "",
  penultimate_location: row.LOCALIZACAO_PENULTIMO_EVENTO || "",
};
```

### Arquivos alterados

| Arquivo | Ação |
|---|---|
| `supabase/functions/fetch-tracking-aereo/index.ts` | Reescrever query + normalização + e-mail |
| `src/pages/air/TrackingAereo.tsx` | Ajustar fetchData mapping |

### O que NÃO muda

- Colunas da grid (AWB, HAWB, Cliente, Rota, Rastreio, Último Evento, Data/Hora, Situação, SLA, Analista, Ações)
- Progress bar, SLA, Situação (continuam derivados do status code)
- Modal de Timeline (já usa timeline_json)
- Dashboard cards, filtros, ordenação, paginação
- Background, header, modais auxiliares

