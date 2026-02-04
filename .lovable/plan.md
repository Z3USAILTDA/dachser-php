

# Plano: Correções na Tela de Métricas de Uso

## Resumo
Implementar três correções na tela de Métricas de Uso (`/admin/metrics`):
1. Ajustar o fuso horário para São Paulo
2. Ocultar logs de `admin` e `teste.test3` para usuários DACHSER
3. Corrigir a filtragem por módulo

---

## Problema 1: Fuso Horário

### Situação Atual
O código usa `new Date().toISOString().split("T")[0]` para definir as datas de filtro, o que retorna a data em **UTC**. Entre 21:00 e 23:59 em São Paulo (UTC-3), a data mostrada é do **dia seguinte**.

### Solução
Usar componentes de data locais (`getFullYear()`, `getMonth()`, `getDate()`) ao invés de `toISOString()`:

```typescript
// Função auxiliar para obter data no formato YYYY-MM-DD em fuso local
const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Uso
const today = new Date();
const defaultFrom = new Date(today);
defaultFrom.setDate(defaultFrom.getDate() - 7);

const [dateFrom, setDateFrom] = useState(getLocalDateString(defaultFrom));
const [dateTo, setDateTo] = useState(getLocalDateString(today));
```

**Arquivos**: `src/pages/MetricsUsage.tsx` (linhas 71-76, 161-164)

---

## Problema 2: Logs Restritos por Tipo de Usuário

### Situação Atual
Todos os usuários com acesso à tela de métricas veem todos os logs, incluindo logs de `admin` e `teste.test3`.

### Requisito
- **Usuários DACHSER** (`ana.tozzo`, `danilo.pedroso`, `teste.test3`): **NÃO** devem ver logs de `admin` e `teste.test3`
- **Usuários Z3US** (demais admins): podem ver todos os logs

### Solução

1. **Frontend**: Enviar o `requesterUsername` na requisição de métricas
2. **Backend**: Adicionar filtro para excluir logs quando o requisitante for DACHSER

```typescript
// Frontend - adicionar ao body da requisição
body: {
  action: "get_metrics",
  dateFrom,
  dateTo,
  username: usernameFilter,
  module: moduleFilter,
  perPage,
  page: currentPage,
  requesterUsername: user?.username, // NOVO
}
```

```typescript
// Backend - nova lógica de filtragem
const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3"];
const HIDDEN_LOG_USERS = ["admin", "teste.test3"];

const isDachserUser = DACHSER_ADMIN_USERS.includes(requesterUsername);

if (isDachserUser) {
  // Excluir logs destes usuários
  whereConditions.push("username NOT IN (?, ?)");
  params.push(...HIDDEN_LOG_USERS);
}
```

**Arquivos**: 
- `src/pages/MetricsUsage.tsx` (linhas 122-135)
- `supabase/functions/mariadb-proxy/index.ts` (linhas 596-620)

---

## Problema 3: Filtragem por Módulo

### Situação Atual
O backend só aceita `['air', 'chb', 'maritime']` como módulos válidos:

```typescript
const validModules = ['air', 'chb', 'maritime'];
if (moduleFilter && validModules.includes(moduleFilter.toLowerCase())) {
```

O frontend envia outros valores como `maritimo`, `fin`, `olimpo`, `admin` que são **ignorados**.

### Solução
Expandir a lista de módulos válidos e criar um mapeamento para os padrões de endpoint corretos:

```typescript
// Mapeamento de módulos para padrões de endpoint
const moduleEndpointPatterns: Record<string, string[]> = {
  'air': ['/air/', '/check-awb', '/awb'],
  'chb': ['/chb/', '/conferencia'],
  'maritimo': ['/sea/', '/maritime/', '/draft/', '/container'],
  'fin': ['/fin/', '/esteira/', '/voucher', '/regua'],
  'olimpo': ['/olimpo/'],
  'admin': ['/admin/'],
};

if (moduleFilter && moduleEndpointPatterns[moduleFilter.toLowerCase()]) {
  const patterns = moduleEndpointPatterns[moduleFilter.toLowerCase()];
  const patternConditions = patterns.map(() => "LOWER(endpoint) LIKE ?").join(' OR ');
  whereConditions.push(`(${patternConditions})`);
  params.push(...patterns.map(p => `%${p}%`));
}
```

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (linhas 614-618)

---

## Alterações por Arquivo

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/MetricsUsage.tsx` | Adicionar `getLocalDateString()`, usar nas datas padrão, enviar `requesterUsername` |
| `supabase/functions/mariadb-proxy/index.ts` | Adicionar filtro de usuário DACHSER, expandir mapeamento de módulos |

---

## Fluxo de Dados Atualizado

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (MetricsUsage.tsx)                 │
├─────────────────────────────────────────────────────────────────┤
│  1. Inicializa datas usando fuso local (São Paulo)             │
│  2. Envia requesterUsername no body                            │
│  3. Seleciona módulo (air, maritimo, fin, olimpo, admin, chb)  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Backend (mariadb-proxy)                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Recebe requesterUsername                                   │
│  2. Se DACHSER → adiciona WHERE username NOT IN (...)          │
│  3. Mapeia módulo para padrões de endpoint                     │
│  4. Retorna logs filtrados                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Seção Técnica

### Constantes Reutilizadas
```typescript
// Usuários DACHSER (ver apenas opções DACHSER)
const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3"];

// Usuários cujos logs devem ser ocultos para DACHSER
const HIDDEN_LOG_USERS = ["admin", "teste.test3"];
```

### Queries SQL Modificadas

**Antes (sem filtro de usuário)**:
```sql
SELECT * FROM t_dachser_usage_logs 
WHERE event_time BETWEEN ? AND ?
```

**Depois (com filtro para DACHSER)**:
```sql
SELECT * FROM t_dachser_usage_logs 
WHERE event_time BETWEEN ? AND ?
  AND username NOT IN ('admin', 'teste.test3')
```

---

## Benefícios

1. **Datas corretas**: Usuários em São Paulo verão as datas corretas mesmo após 21:00
2. **Privacidade**: Logs de usuários de teste/admin ficam ocultos para clientes DACHSER
3. **Filtragem funcional**: Módulos como FIN, OLIMPO e SEA funcionarão corretamente

