

# Plano: Reestruturar Menu ADMIN com Subníveis DACHSER e Z3US

## Resumo
Reorganizar o menu ADMIN para ter dois "filhos" (DACHSER e Z3US) que agrupam as opções administrativas, com comportamentos diferentes baseado no usuário logado.

---

## Estrutura Proposta

```text
ADMIN (pai)
├── DACHSER (filho)
│   ├── Métricas de Uso
│   └── Monitoramento de Dados
│
└── Z3US (filho)
    ├── Cadastro de Usuário
    ├── Métricas de Uso
    ├── Gerenciamento de Usuários
    ├── Gerenciamento de APIs
    └── Monitoramento de Dados
```

---

## Regras de Acesso por Usuário

| Tipo | Usuários | Comportamento ao Clicar ADMIN |
|------|----------|------------------------------|
| **DACHSER** | `ana.tozzo`, `danilo.pedroso`, `teste.test3` | Abre diretamente as opções (Métricas de Uso, Monitoramento de Dados) |
| **Z3US** | Todos outros admins | Mostra dois filhos expandíveis: DACHSER e Z3US |

---

## Mudanças no Código

### 1. Definir Listas de Usuários

```typescript
// Usuários DACHSER (veem apenas opções DACHSER, abertura direta)
const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3"];

// Função para determinar tipo de usuário admin
const getAdminUserType = (username: string) => {
  if (DACHSER_ADMIN_USERS.includes(username)) return "DACHSER";
  return "Z3US";
};
```

### 2. Estrutura de Menu Dinâmica

Para usuários **DACHSER** (ana.tozzo, danilo.pedroso, teste.test3):
```text
ADMIN (clique)
├── Métricas de Uso
└── Monitoramento de Dados
```

Para usuários **Z3US** (demais admins):
```text
ADMIN (clique)
├── DACHSER (expandível)
│   ├── Métricas de Uso
│   └── Monitoramento de Dados
└── Z3US (expandível)
    ├── Cadastro de Usuário
    ├── Métricas de Uso
    ├── Gerenciamento de Usuários
    ├── Gerenciamento de APIs
    └── Monitoramento de Dados
```

### 3. Modificar `getVisibleChildren()` 

A função será atualizada para retornar children diferentes baseado no tipo de usuário:

```typescript
const getVisibleChildren = (item: MenuItem) => {
  if (!item.children) return [];
  
  if (item.id === "admin" && user?.username) {
    const adminType = getAdminUserType(user.username);
    
    if (adminType === "DACHSER") {
      // Mostra diretamente as opções DACHSER (sem subnível)
      return [
        { label: "Métricas de Uso", href: "/admin/metrics" },
        { label: "Monitoramento de Dados", href: "/admin/database" },
      ];
    }
    
    // Z3US: mostra dois filhos expandíveis
    return [
      {
        label: "DACHSER",
        expandableId: "dachser-sub",
        subChildren: [
          { label: "Métricas de Uso", href: "/admin/metrics" },
          { label: "Monitoramento de Dados", href: "/admin/database" },
        ],
      },
      {
        label: "Z3US",
        expandableId: "z3us-sub",
        subChildren: [
          { label: "Cadastro de Usuário", href: "/admin/register" },
          { label: "Métricas de Uso", href: "/admin/metrics" },
          { label: "Gerenciamento de Usuários", href: "/admin/users" },
          { label: "Gerenciamento de APIs", href: "/admin/apis" },
          { label: "Monitoramento de Dados", href: "/admin/database" },
        ],
      },
    ];
  }
  
  return item.children.filter(child => !child.adminOnly || isAdmin);
};
```

### 4. Remover Lógica Antiga

Remover a constante `ADMIN_METRICS_ONLY_USERS` que ficará obsoleta com a nova lógica.

---

## Fluxo Visual

### Usuário DACHSER (ana.tozzo, danilo.pedroso, teste.test3)

```text
┌─────────────────────────────────────────────────────────────────┐
│                           ADMIN                                 │
│                        (clique para expandir)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
       ┌───────┴───────┐               ┌───────┴───────┐
       │ Métricas de   │               │ Monitoramento │
       │     Uso       │               │   de Dados    │
       └───────────────┘               └───────────────┘
```

### Usuário Z3US (demais admins)

```text
┌─────────────────────────────────────────────────────────────────┐
│                           ADMIN                                 │
│                        (clique para expandir)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
       ┌───────┴───────┐               ┌───────┴───────┐
       │    DACHSER    │               │     Z3US      │
       │  (expandível) │               │  (expandível) │
       └───────┬───────┘               └───────┬───────┘
               │                               │
       ┌───────┴───────┐       ┌───────┬───────┼───────┬───────┐
       │               │       │       │       │       │       │
   ┌───┴───┐       ┌───┴───┐ ┌─┴─┐   ┌─┴─┐   ┌─┴─┐   ┌─┴─┐   ┌─┴─┐
   │Métricas│     │Monitor│ │Cad│   │Mét│   │Ger│   │API│   │Mon│
   │de Uso  │     │ Dados │ │Usr│   │Uso│   │Usr│   │   │   │Dat│
   └────────┘     └───────┘ └───┘   └───┘   └───┘   └───┘   └───┘
```

---

## Alterações por Arquivo

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Dashboard.tsx` | Substituir `ADMIN_METRICS_ONLY_USERS` por `DACHSER_ADMIN_USERS`, adicionar função `getAdminUserType()`, modificar `getVisibleChildren()` |

---

## Lista de Usuários DACHSER

| Username | Acesso |
|----------|--------|
| `ana.tozzo` | Métricas de Uso, Monitoramento de Dados |
| `danilo.pedroso` | Métricas de Uso, Monitoramento de Dados |
| `teste.test3` | Métricas de Uso, Monitoramento de Dados |

---

## Benefícios

1. **Separação clara**: Usuários DACHSER veem apenas suas opções
2. **Visão completa para Z3US**: Admins Z3US podem ver e acessar tudo
3. **UX otimizada**: DACHSER não precisa de clique extra
4. **Código reutilizável**: Usa estrutura existente de `expandableId` e `subChildren`

