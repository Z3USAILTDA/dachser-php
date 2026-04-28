## Diagnóstico

A tabela `dados_dachser.t_cct_dashboard_cache` já é a **única fonte de verdade** para o CCT, com a coluna `eventos` consolidada por HAWB. O problema atual é que **dashboard e timeline do detalhe usam fontes diferentes**:

- **Dashboard / lista CCT (`get_cct_shipments_cached`)** → lê `t_cct_dashboard_cache.eventos` (correto). O hook `useCCTData` já ordena cronologicamente e usa o último evento como status efetivo. ✓
- **Detalhe / Timeline do processo (`get_cct_events`)** → lê `t_cct_hawb_api_historico` direto, com `STR_TO_DATE` instável e tiebreaker indefinido. Por isso o status do header (vindo do shipment do dashboard) e a timeline (vinda do histórico) podem divergir, e até dentro da própria timeline o "último evento" pode ser o errado.

No print: header "Informada" vs timeline "EM TRÂNSITO TERRESTRE 31/03 16:09" — sintoma típico de duas pipelines separadas para o mesmo HAWB.

## Solução: Single Source of Truth = `t_cct_dashboard_cache.eventos`

### 1. Reescrever `get_cct_events` no `mariadb-proxy`
Substituir a query atual (que vai em `t_cct_hawb_api_historico`) por:

```sql
SELECT eventos, situacao_portal_atual, data_ultima_atualizacao_atual, refreshed_at
FROM dados_dachser.t_cct_dashboard_cache
WHERE hawb = ? OR REPLACE(REPLACE(hawb,'-',''),' ','') = ?
LIMIT 1
```

E na edge function:
- Reusar a mesma lógica de `parseAndSortEventos` (hoje só no front) para parsear `eventos` (JSON ou pipe-format `Descricao | dd/MM/yyyy HH:mm:ss || ...`).
- Ordenar **cronologicamente DESC** por data parseada.
- Tiebreaker estável: índice de inserção (preserva ordem do array original quando datas empatam).
- Mapear cada item para o formato consumido por `EventTimeline` (`codigo_evento`, `descricao_evento`, `data_hora_evento` em ISO com `-03:00`, `fonte: 'RFB'`).

Isso elimina o `STR_TO_DATE` frágil e o JOIN no histórico.

### 2. Garantir que o status do header use o mesmo último evento
Em `src/pages/cct/ProcessoTimeline.tsx`:
- O status mostrado no card "Status" deve vir de `getLatestTimelineStatus(eventos)` (helper já existe em `cctStatusResolver`), aplicado sobre os eventos retornados por `useCCTEvents`.
- Só usar `status_cct_oficial` do shipment como fallback quando `eventos` estiver vazio.

Resultado: header e timeline mostram exatamente o mesmo último estado.

### 3. Reaproveitar parser entre front e edge
Mover `parseAndSortEventos` + `normalizeEventCode` + `parsePipeDateToISO` de `useCCTData.ts` para um util compartilhado (lógica idêntica), e duplicar a função dentro do edge function (edge functions não importam de `src/`). Isso garante que dashboard, detalhe e timeline interpretem `eventos` da mesma maneira.

### 4. Logging de validação
No primeiro deploy, logar para o HAWB consultado: total de eventos, primeiro e último evento parseado, e qual ganhou como status. Permite confirmar rapidamente se algum HAWB ainda diverge.

## Arquivos a alterar

- `supabase/functions/mariadb-proxy/index.ts` — reescrever case `get_cct_events` para ler de `t_cct_dashboard_cache.eventos` + parser cronológico.
- `src/pages/cct/ProcessoTimeline.tsx` — derivar status do header a partir de `eventos` (via `getLatestTimelineStatus`).
- `src/utils/cctStatusResolver.ts` — pequeno ajuste para também aceitar `EM_TRANSITO_TERRESTRE` como código direto (hoje só mapeia `EM_TRANSITO`).
- `src/hooks/useCCTData.ts` — sem mudanças funcionais; só remove o uso indireto de campos antigos se necessário.

## Não muda

- Estrutura de `t_cct_dashboard_cache` (já tem tudo).
- Pipeline `get_cct_shipments_cached` (dashboard) — já está certo.
- Componente `EventTimeline` — só passa a receber dados consistentes.
- Cálculo de SLA, divergências, bloqueios.
