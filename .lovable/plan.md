## Objetivo

Refatorar o dashboard CCT (`/air/cct`) para usar **`dados_dachser.t_cct_dashboard_cache`** como fonte oficial dos dados operacionais (eventos, bloqueio, pesos, volumes, decolagem). A query pesada atual (`get_cct_shipments`) deixa de ser usada como base da tela. Apenas dados complementares (Cliente, Master, Rota, Analista, Tratamentos Especiais) virão de `t_master_dados`.

## Regra crítica de cronologia (NOVA)

A coluna `eventos` (JSON) **não está garantidamente ordenada**. Toda lógica deve:

1. Parsear o JSON de `eventos`.
2. **Ordenar cronologicamente pela data do evento (asc)** — nunca confiar na ordem física do array.
3. Considerar como "evento mais recente" o último item dessa ordenação cronológica.
4. **Ignorar `situacao_portal_atual`** quando o status/descrição derivado do evento mais recente (cronológico) divergir dela. Nesse caso, o status exibido na tela passa a ser o do evento mais recente cronologicamente, e `situacao_portal_atual` é descartada para fins de exibição.

Isto vale tanto para a tabela principal quanto para o detalhe.

## Mudanças

### 1. Backend — nova action `get_cct_shipments_cached` em `supabase/functions/mariadb-proxy/index.ts`

```sql
SELECT
  c.hawb, c.awb, c.eventos, c.teve_bloqueio, c.motivos_bloqueio,
  c.data_decolagem, c.peso_recebido_declarado, c.peso_constatado,
  c.volume_recebido_declarado, c.volume_constatado,
  c.situacao_portal_atual, c.data_ultima_atualizacao_atual,
  c.consulted_at_ultima_consulta, c.refreshed_at,
  m.cliente, m.master, m.aeroporto_origem, m.aeroporto_destino,
  m.nome_analista, m.email_analista, m.tratamento, m.tratamentos_especiais,
  m.id AS master_id, m.created_at, m.updated_at
FROM dados_dachser.t_cct_dashboard_cache c
LEFT JOIN dados_dachser.t_master_dados m
  ON m.house COLLATE utf8mb4_unicode_ci = c.hawb COLLATE utf8mb4_unicode_ci
WHERE c.teve_bloqueio <> 'Sem retorno CCT'
ORDER BY c.hawb;
```

A action retorna o `eventos` como JSON cru (string ou array) — **a ordenação cronológica é feita no frontend** após o parse. (Confirmar nome exato da coluna do HAWB em `t_master_dados` na implementação — provavelmente `house`.)

A action **não** abre nenhum JSON pesado, **não** aplica `tracking_status`, **não** consulta RFB/LeadComex/histórico.

### 2. Frontend — `src/hooks/useCCTData.ts`

- Trocar `useProcessosCCT` para invocar `get_cct_shipments_cached`.
- Reescrever `mapRowToProcessoCCT`:
  - Parsear `eventos` (JSON.parse se string).
  - **Ordenar `eventos` por data ASC** usando `parseDBDate` no campo de data de cada evento (descartar eventos com data inválida).
  - Popular array `CCTEvento[]` já ordenado.
  - **Evento mais recente** = último item da ordenação cronológica.
  - **Status efetivo** = status derivado do evento mais recente cronológico:
    - Se o status mapeado do evento mais recente **for diferente** de `situacao_portal_atual`, prevalece o do evento. `situacao_portal_atual` é ignorada nesse caso.
    - Se forem iguais (ou o evento não mapeia para um status canônico), usar `situacao_portal_atual` como fallback.
  - Mapear demais campos da cache direto (pesos, volumes, decolagem, bloqueio, motivos, timestamps) sem qualquer recálculo.
  - Complementos (cliente, master, rota, analista, tratamentos) vêm do JOIN com `t_master_dados`.
- Remover do hook qualquer cálculo derivado de SLA, ARR, RFB ou consolidação de eventos por snapshot. SLA passa a ser derivado simples (ou removido das métricas até regra futura).
- `useCCTEvents` deixa de ser chamado pelo detalhe — passa a usar `processo.eventos` (já ordenado) direto.

### 3. Frontend — `src/components/cct/ProcessosTable.tsx`

- Coluna "Status / Manifestação" usa o **status efetivo** calculado acima (evento cronológico mais recente vence sobre `situacao_portal_atual` quando divergem).
- Coluna "Atualização" passa a usar `data_ultima_atualizacao_atual`, com tooltip mostrando `consulted_at_ultima_consulta` e `refreshed_at`.
- Indicador de bloqueio: badge vermelho quando `teve_bloqueio` indica bloqueio ativo (≠ `Sem retorno CCT` e ≠ `Não`/equivalente), com `motivos_bloqueio` no tooltip.
- Botão "Atualizar" simplesmente chama `refetch()`.

### 4. Frontend — `src/pages/cct/ProcessoTimeline.tsx`

- Remover `useCCTEvents` e usar `processo.eventos` direto (já ordenado cronologicamente).
- Cabeçalho do detalhe mostra o **mesmo evento mais recente** que aparece na tabela principal (consistência garantida pela mesma fonte e mesma ordenação).
- Timeline renderiza todos os eventos em ordem cronológica.
- Status no header usa o mesmo "status efetivo" da tabela.

### 5. Backend — manter, mas não usar

- `get_cct_shipments` e `get_cct_events` permanecem no `mariadb-proxy` para fallback. Comentário no topo: "Substituídas por `get_cct_shipments_cached`".

## Filtros e visibilidade

1. **Apenas processos onde `teve_bloqueio <> 'Sem retorno CCT'`** (filtro SQL).
2. Filtro existente de "ENTREGUE há mais de 5 dias" — manter, baseado no status efetivo + `data_ultima_atualizacao_atual`.
3. Filtro de ano não-Z3US-admin (≥ 2027) — manter via `created_at` do master.

## Validação

1. `/air/cct` deve listar exatamente os HAWBs de `t_cct_dashboard_cache` onde `teve_bloqueio <> 'Sem retorno CCT'`.
2. Pesos, volumes, decolagem, motivos de bloqueio iguais aos da cache (sem recálculo).
3. Pegar um HAWB onde o `eventos` JSON contenha eventos fora de ordem física e confirmar:
   - Tabela mostra o evento de **maior data** como "mais recente".
   - Detalhe exibe a timeline ordenada cronologicamente.
4. Pegar um HAWB onde `situacao_portal_atual` divirja do status do evento cronológico mais recente — confirmar que a tela exibe o status do evento (não o de `situacao_portal_atual`).
5. Tabela e detalhe mostram o mesmo "evento mais recente" para o mesmo processo.
6. Botão "Atualizar" recarrega rapidamente, sem timeout.

## Pontos abertos (a confirmar na implementação)

- Nome exato da coluna do HAWB em `t_master_dados` (`house`?) para o JOIN.
- Estrutura exata do JSON `eventos`: nome do campo de data (`data`, `data_hora`, `dataHora`?) e do campo de descrição/código (`descricao`, `evento`, `codigo`?). Parser será ajustado conforme a estrutura real.
- Mapeamento de descrições/códigos de evento → status canônico CCT (`MANIFESTADA`, `RECEPCIONADA`, `ENTREGUE`, etc.) para a regra "evento vence sobre `situacao_portal_atual`". Será derivado do mesmo dicionário já usado em `mapRfbSituacaoToCCT`.
- Valores possíveis de `teve_bloqueio` além de `Sem retorno CCT` para definir o badge.
