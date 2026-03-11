

## Filtrar Tracking Aéreo e CCT para processos de 2027 (non-Z3US admins)

### Lógica de filtro

Usuários que **não** são admin Z3US verão **apenas processos de 2027**. Admin Z3US (is_admin=1 E username não está em DACHSER_ADMIN_USERS) vê tudo.

A filtragem será feita no **frontend** após receber os dados, usando a data do AWB ou data de criação do processo.

### Alterações

**1. `src/pages/Index.tsx` (Tracking Aéreo)**

- Adicionar constante `DACHSER_ADMIN_USERS` e helper `isZ3usAdmin`
- Após o `deduplicatedData` ser montado, filtrar para manter apenas AWBs de 2027 se o usuário não for Z3US admin
- O critério de ano será baseado no campo `last_check` (última atualização/scraped_at) — processos com data em 2027

**2. `src/pages/cct/CCTDashboard.tsx` (CCT)**

- Adicionar a mesma lógica de detecção Z3US admin
- Filtrar o array `processos` (do `useProcessosCCT`) via `useMemo` para manter apenas processos de 2027 quando não for Z3US admin
- O critério será baseado no `created_at` ou `data_decolagem_ultimo_trecho` do shipment

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `src/pages/Index.tsx` | Filtro de ano 2027 no `statusAereoData` após fetch |
| `src/pages/cct/CCTDashboard.tsx` | Filtro de ano 2027 nos `processos` via useMemo |

