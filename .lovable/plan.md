

## Usar apenas `t_cct_hawb_api_historico` como fonte da timeline

### Arquivo alterado

**1 arquivo:** `supabase/functions/mariadb-proxy/index.ts` — apenas o `case 'get_cct_events'` (linhas 6537-6648)

---

### O que muda

Substituir toda a lógica atual do `case 'get_cct_events'` por uma versão que:

1. **Remove** a query a `t_cct_eventos_historico` (linhas 6551-6566) — essa tabela deixa de ser consultada
2. **Mantém** a query a `t_cct_hawb_api_historico` como fonte única
3. **Remove** a deduplicação por `existingCodes` (que dependia dos eventos do `t_cct_eventos_historico`)
4. **Melhora** a inferência de eventos: em vez de deduplica por `seenStatuses` (que descartava transições repetidas legítimas), compara snapshots consecutivos para detectar **transições reais** de status
5. **Inclui evento sintético do snapshot atual** (`t_cct_hawb_api_atual`) para garantir que o status mais recente apareça na timeline mesmo antes de ser persistido no histórico

### Lógica nova do `case 'get_cct_events'`

```text
1. Normalizar HAWB
2. Query t_cct_hawb_api_historico ORDER BY consulted_at ASC (cronológico)
3. Para cada snapshot:
   - Extrair situacaoAtual de json_partes_estoque
   - Comparar com snapshot anterior
   - Se houve mudança de status → gerar evento
   - Usar consulted_at como data do evento
4. Query t_cct_hawb_api_atual (1 registro)
   - Extrair situacaoAtual
   - Se diferente do último snapshot histórico → gerar evento adicional
5. Ordenar todos os eventos por data DESC
6. Retornar no mesmo formato atual (id, awb, codigo_evento, descricao_evento, data_hora_evento, fonte, aeroporto, nivel_confianca, created_at)
```

### Mapeamento de `situacaoAtual` → `codigo_evento`

Mantém o mapeamento existente (linhas 6609-6613):
- `manifestada` → `MANIFESTADO`
- `informada` → `CHEGADA_INFORMADA`
- `recepcionada` → `RECEPCIONADO`
- `entregue` → `ENTREGUE`
- `transferência` → `AREA_TRANSFERENCIA`
- `em trânsito terrestre` → `EM_TRANSITO_TERRESTRE` (novo)
- Fallback: `UPPER(situacao).replace(/\s+/g, '_')`

### Contrato de saída (inalterado)

Cada evento retornado mantém exatamente os mesmos campos:

| Campo | Origem |
|---|---|
| `id` | `rfb-{awb}-{codigo}-{snap.id}` |
| `awb` | queryAwb |
| `codigo_evento` | Mapeado da situação |
| `descricao_evento` | Texto original da situação |
| `data_hora_evento` | `consulted_at` do snapshot |
| `fonte` | `'RFB'` |
| `aeroporto` | Extraído do JSON se disponível |
| `nivel_confianca` | `'PRIMARIA'` (única fonte agora) |
| `created_at` | `consulted_at` |

### O que NÃO muda

- Nenhum outro `case` do `mariadb-proxy`
- Nenhum arquivo frontend
- `useCCTEvents` no hook — consome o mesmo formato
- `EventTimeline.tsx` — renderiza o mesmo formato
- `ProcessoTimeline.tsx` — já corrigido anteriormente
- Dashboard, filtros, layout, tipos

