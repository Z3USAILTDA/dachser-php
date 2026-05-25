## 1. Corrigir link do e-mail de boas-vindas

`supabase/functions/send-welcome-email/index.ts` linha 121 — trocar `https://dachser.z3us.ai/change_password.php` por `https://dachser.z3us.ai/`. Em seguida fazer deploy da function `send-welcome-email`. (HTML já usa a URL correta nas linhas 18/97.)

## 2. Carregar processos apenas para admins nas 3 telas

**Mudança de escopo vs. plano anterior:** as telas continuam abertas a todos (não há redirect/bloqueio de rota). O que muda é que o **carregamento dos processos** só acontece se `is_admin` for verdadeiro; para os demais, a tela renderiza vazia com uma mensagem informativa ("Visualização disponível apenas para administradores").

Critério de admin (igual ao já usado em `CCTDashboard.tsx` e `adminAccess.ts`): `localStorage["user"].is_admin === 1 | "1" | true`.

### 2.1 `/sea/tracking` — `src/pages/ContainerTracking.tsx`
- Ler `isAdmin` no topo do componente.
- No `useEffect` de inicialização (linha ~957) que chama `cleanup_orphan_pendentes` + `fetchMblData()`, envolver o bloco com `if (!isAdmin) { setIsLoading(false); return; }` — nem cleanup nem fetch são disparados.
- Em qualquer auto-refresh / re-fetch existente do mesmo escopo, aplicar o mesmo gate.
- Onde a lista é renderizada, quando `!isAdmin` mostrar um estado vazio: "Esta visualização está disponível apenas para administradores."

### 2.2 `/air/tracking-aereo` — `src/pages/air/TrackingAereo.tsx`
- Ler `isAdmin` no topo.
- No `useEffect` da linha ~479 que chama `fetchData()` e cria `setInterval(fetchData, 30000)`, gate com `if (!isAdmin) { setIsLoading(false); return; }`. Não disparar fetch nem agendar o polling.
- No `useEffect` da linha ~487 (alerta `air-tracking-failed-alert`), também gate por admin — não enviar alerta para usuários não-admin.
- Estado vazio com a mesma mensagem na área da tabela.

### 2.3 `/air/cct` — `src/pages/cct/CCTDashboard.tsx` + `src/hooks/useCCTData.ts`
- O hook `useProcessosCCT` (react-query) hoje não aceita opções. Adicionar parâmetro opcional `{ enabled?: boolean } = {}` e repassar para `useQuery({ ..., enabled })`. Mesma alteração em `useProfiles` e `useExcecoes` para não fazer chamadas desnecessárias quando não-admin.
- Em `CCTDashboard.tsx` chamar `useProcessosCCT({ enabled: isAdmin })`, `useProfiles({ enabled: isAdmin })`, `useExcecoes({ enabled: isAdmin })`. A variável `isAdmin` já existe no arquivo.
- Quando `!isAdmin`, exibir o estado vazio na área de processos com a mesma mensagem. Métricas/contadores ficam zerados (já dependem de `processos`).

### Observações
- Sub-rotas (ex.: `/sea/tracking/notificacoes`, `/air/cct/excecoes`, `/air/cct/processo/:id`) **não** são alteradas — escopo restrito às 3 telas pedidas.
- Não esconder itens de menu — apenas o carregamento de dados é gateado.
- Nenhuma alteração de RLS / banco — gate é client-side, consistente com o restante do app (auth via MariaDB).
