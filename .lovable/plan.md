

## Plano: Corrigir status para espelhar o banco de dados

### Problema

O `fetch-status-aereo` aplica uma cadeia complexa de transformações entre o valor real do banco e o que aparece na coluna "Último Evento" do grid:

1. **`resolveUnkFromTimeline`** — reordena eventos por hierarquia IATA, filtra eventos `[planned]`/futuros/pré-ETD, aplica `statusMap` (ex: "CONFIRMED" → "NFD", "RECEIVED" → "RCF")
2. **Fallback chain** — timeline → t_aereo_api → ws.last_status_code → description (4 camadas com transformações em cada uma)
3. **`classifyArrival`** — transforma "ARR" em "ARR - DESTINO" / "ARR - CONEXAO"
4. **`extractLastEventDescription`** — filtra eventos por ETD cutoff para gerar `status_info`
5. **MANUAL_OVERRIDES** — substitui status com regras de skip por peso IATA e data

Resultado: se o banco tem NFD no último evento, a tela pode mostrar RCF (por causa do ETD filter ou IATA tiebreaker).

### Solução

Simplificar o bloco de resolução de status no `fetch-status-aereo` (linhas ~1088-1166) para ler direto do banco.

### Alterações

**Arquivo: `supabase/functions/fetch-status-aereo/index.ts`**

**1. Novo resolvedor de `finalStatus` (substituir linhas ~1088-1166)**

- Parsear `timeline_json`, ordenar **apenas por data DESC** (sem tiebreaker IATA, sem filtro ETD, sem filtro `[planned]`, sem `statusMap`)
- Usar o código do evento mais recente diretamente via `getEventStatusCode`
- Se timeline vazia: usar `ws.last_status_code` como está no banco
- Manter `classifyArrival` para ARR (diferencia conexão de destino — é informação visual, não altera o dado base)
- **Remover**: `resolveUnkFromTimeline` da resolução principal, `statusMap` translations, UNK guard, description fallback, safety net

```text
Lógica simplificada:

timeline_json → parse → sort by date DESC → último evento → getEventStatusCode()
                                                          ↓
                                                   classifyArrival (se ARR)
                                                          ↓
                                                     finalStatus
```

**2. Novo resolvedor de `status_info` (linha ~1180)**

- Substituir `extractLastEventDescription(timelineStr, etdForTimeline)` por leitura direta do último evento (sem filtro ETD)
- Pegar `Description`/`description`/`descricao_evento` do mesmo evento usado para o status

**3. Override loop (linhas ~2504-2517 aprox.)**

- Remover os blocos de `continue` que fazem skip quando o peso IATA automático é maior ou a data automática é mais recente
- Resultado: overrides manuais sempre aplicam quando definidos (conforme memória `ajustes-manuais-e-exclusoes-v2`, flags como `force_discrepancy` e `force_critical` já persistem — agora o status também)

### O que NÃO muda

- Colunas do grid (AWB, HAWB, Cliente, Rota, etc.)
- `classifyArrival` (ARR → DESTINO/CONEXAO)
- Enriquecimento com `t_master_dados` (HAWB, cliente, analista)
- Detecção de ground transport, days_in_transit, pieces_discrepancy
- MANUAL_OVERRIDES existência — só remove a trava que os ignora

### Resultado esperado

| Banco (último evento timeline) | Tela atual (pode divergir) | Tela após mudança |
|---|---|---|
| NFD | RCF (ETD filter ignorou NFD) | NFD |
| AWD | NFD (IATA tiebreaker) | AWD |
| FOH | RCS (IATA tiebreaker) | FOH |
| DIS | DIS | DIS |
| ARR | ARR - DESTINO/CONEXAO | ARR - DESTINO/CONEXAO |

