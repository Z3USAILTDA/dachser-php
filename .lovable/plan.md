## Ajustes na sub-tabela de histórico (Container Tracking SEA)

Três correções no expandido por MBL em `src/pages/ContainerTracking.tsx`. Backend já retorna todos os campos necessários (`h.eta`, `h.created_at`) em `get_tracking_history` — só frontend muda.

### 1. Preencher ETA Tracking, ETA Cadastrado e Última Atualização nas linhas de histórico

Hoje as três colunas mostram `—` nas linhas de eventos anteriores (linhas 2923-2925).

Substituir por:
- **ETA Tracking** → `ev.eta` formatado como `dd/MM/yyyy` (via `parseMariaDBLocalDate` + fallback `new Date`). Fallback `—`.
- **ETA Cadastrado** → espelha `mbl.eta_master` (mesmo valor da linha agregada / último evento), formato `dd/MM/yyyy`.
- **Última Atualização** → `ev.created_at` via `formatSaoPaulo(parseMariaDBLocalDate(ev.created_at) || new Date(ev.created_at))`. Fallback `—`.

Cor `text-[#aaaaaa]`, idêntica à linha agregada.

### 2. Mostrar todos os containers do MBL nas linhas de histórico

Hoje cada linha de evento mostra só os containers referenciados naquele evento. Quando o MBL tem múltiplos containers, fica incompleto.

Na célula `Container` das linhas de histórico (linhas 2899-2909):
- Se `mblContainers.length > 0` → renderizar **todos** os containers do MBL como chips (mesmo markup da linha agregada).
- Fallback: `ev.containers` (dedup atual) se `mblContainers` ainda não carregou.
- Fallback final: `ev.container` ou `—`.

### Fora de escopo
- Sem alteração em SQL, dedup, ordenação ou estrutura de colunas.
- Sem mudança no backend.
- Sem mudança na linha agregada ou no fetch de `mblContainers`.