## Objetivo

Adicionar um botão na tela `/admin/metrics` (Métricas de Uso) que abre uma visualização (modal) com **todos os usuários que estão com conexão ativa no momento e há quanto tempo cada um está conectado**.

A definição de "conexão ativa" segue o critério já usado pelo sistema de auto-logout por inatividade: **usuário com evento de uso (page view ou ação) registrado nos últimos 20 minutos**. Isso reflete fielmente quem está realmente com a tela aberta consumindo conexão.

---

## Como vai funcionar

1. Ao lado dos botões "Exportar Excel/PDF" no topo da tela de Métricas, aparece um novo botão **"Conexões Ativas"** com um indicador (badge) mostrando o número de usuários ativos.
2. O badge do botão é atualizado a cada 30s **somente enquanto a aba estiver visível** (respeita a regra de visibility-aware polling). Essa chamada é leve e serve apenas para que o admin perceba mudanças sem abrir o modal.
3. Ao clicar, abre um Dialog com tabela contendo:
   - **Usuário** (username)
   - **Sessão atual** (session_id curto — últimos 6 chars)
   - **Conectado há** (ex: "12m 30s") — calculado desde o `MIN(event_time)` da sessão ativa
   - **Última atividade** (ex: "há 45s")
   - **Tela atual** (último endpoint visitado, formatado com `prettifyEndpoint`)
   - **Eventos na sessão**
4. **Sem auto-refresh dentro do modal.** Os dados são carregados na abertura e só atualizam quando o usuário clicar no botão **"Atualizar"** dentro do modal. Um pequeno timestamp "Atualizado em HH:mm:ss" indica a última carga.
5. Header do modal mostra resumo: "X usuários ativos · Y sessões".

---

## Detalhes técnicos

### 1. Edge function — nova action `get_active_connections`

Adicionar em `supabase/functions/mariadb-proxy/index.ts` (perto de `get_metrics_sessions`):

```ts
case 'get_active_connections': {
  const { requesterUsername } = body;
  // Janela de 20 min = mesmo limite de inatividade do front
  const ACTIVITY_WINDOW_MIN = 20;

  const DACHSER_ADMIN_USERS = ["ana.tozzo","danilo.pedroso","teste.test3","metricas"];
  const HIDDEN_LOG_USERS = ["admin","teste.test3"];
  const isDachserUser = requesterUsername && DACHSER_ADMIN_USERS.includes(requesterUsername);

  const conds = [
    "event_time >= (NOW() - INTERVAL ? MINUTE)",
    "username != 'unknown'",
    "username IS NOT NULL",
    "username != ''",
    "session_id IS NOT NULL",
  ];
  const params: (string|number)[] = [ACTIVITY_WINDOW_MIN];
  if (isDachserUser) {
    conds.push(`username NOT IN (${HIDDEN_LOG_USERS.map(()=>'?').join(',')})`);
    params.push(...HIDDEN_LOG_USERS);
  }

  const rows = await client.query(
    `SELECT
       session_id,
       MIN(username)         AS username,
       MIN(event_time)       AS session_started_at,
       MAX(event_time)       AS last_activity_at,
       COUNT(*)              AS event_count,
       SUBSTRING_INDEX(
         GROUP_CONCAT(endpoint ORDER BY event_time DESC SEPARATOR '||'),
         '||', 1
       ) AS current_endpoint
     FROM ai_agente.t_dachser_usage_logs
     WHERE ${conds.join(' AND ')}
     GROUP BY session_id
     ORDER BY last_activity_at DESC`,
    params
  );

  const connections = rows.map((r:any) => ({
    sessionId: r.session_id,
    username: r.username,
    sessionStartedAt: r.session_started_at,
    lastActivityAt: r.last_activity_at,
    eventCount: Number(r.event_count),
    currentEndpoint: String(r.current_endpoint || '').replace(/#dur=\d+$/, ''),
  }));

  const uniqueUsers = new Set(connections.map(c => c.username)).size;

  result = {
    success: true,
    activityWindowMin: ACTIVITY_WINDOW_MIN,
    totalSessions: connections.length,
    uniqueUsers,
    connections,
    serverNow: new Date().toISOString(),
  };
  break;
}
```

Justificativa: usa a tabela já existente `ai_agente.t_dachser_usage_logs`, sem novas colunas. Janela de 20 min alinhada com `useInactivityTimeout` (depois desse tempo o front faz signOut).

### 2. Componente novo — `src/components/admin/ActiveConnectionsDialog.tsx`

- Usa `Dialog` do shadcn já instalado.
- Estado: `open`, `connections`, `loading`, `lastFetchedAt`.
- **Sem `setInterval` interno.** Fetch é disparado:
  - Uma vez ao abrir o modal (`useEffect` dependendo de `open`).
  - Sempre que o botão "Atualizar" for clicado.
- Renderiza tabela com as colunas listadas acima + botão "Atualizar" no topo direito do modal e label "Atualizado em HH:mm:ss".
- Helpers: `formatDuration(seconds)` (mesmo padrão de `MetricsUsage`), `formatDistanceToNow` de `date-fns/locale/pt-BR`.
- Importa `prettifyEndpoint` de `@/utils/endpointLabels` para mostrar a tela atual com label amigável.

### 3. Integração em `src/pages/MetricsUsage.tsx`

- Estado leve no topo: `activeCount` + `setInterval(30_000)` (gated por `usePageVisibility`) chamando `get_active_connections` e usando apenas `uniqueUsers` para o badge do botão.
- Botão posicionado no header de ações (mesma área de Export Excel/PDF):
  ```
  [Conexões Ativas · 7]  [Exportar Excel]  [Exportar PDF]
  ```
- Ícone: `Users` ou `Wifi` do lucide-react. Cor primary com badge dourado.
- Acesso: mesmos perfis que veem a tela (`is_admin === 1` ou `metrics_only === 1`).

### 4. Sem mudança de schema, sem migration

A tabela `ai_agente.t_dachser_usage_logs` já recebe `view_start` (`method='VI'`) a cada navegação e ações com `session_id` por aba — suficiente para identificar conexões ativas com precisão.

---

## Arquivos afetados

- **Editar** `supabase/functions/mariadb-proxy/index.ts` — nova action `get_active_connections` (~40 linhas).
- **Criar** `src/components/admin/ActiveConnectionsDialog.tsx` — modal + tabela + botão "Atualizar" manual.
- **Editar** `src/pages/MetricsUsage.tsx` — adicionar botão no header com badge de contagem e abrir o dialog.

---

## Fora de escopo

- Forçar logout remoto de uma sessão ativa.
- Histórico de conexões ativas ao longo do tempo (já coberto pela aba "Sessões").
- Geolocalização/IP por sessão.