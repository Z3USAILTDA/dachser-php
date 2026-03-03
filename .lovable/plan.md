

# Ajustar árvore Z3US no menu ADMIN

## Arquivo: `src/pages/Dashboard.tsx`

Alterar o bloco Z3US dentro de `getVisibleChildren` (quando `adminType === "Z3US"`), reorganizando os 3 filhos expandíveis:

### Estrutura atual (2 filhos: DACHSER + Z3US)
### Nova estrutura (2 filhos: DACHSER + Z3US, com Z3US tendo 3 sub-grupos)

O filho **Z3US** passará a ter 3 `expandableId` em vez de uma lista plana:

```
Z3US
├── Usuários (expandableId: "z3us-usuarios")
│   ├── Cadastro de Usuário → /admin/register
│   ├── Métricas de Uso → /admin/metrics
│   └── Gerenciamento de Usuários → /admin/users
├── Monitoramento (expandableId: "z3us-monitoramento")
│   ├── Gerenciamento de APIs → /admin/apis
│   ├── Monitoramento de Dados → /admin/database
│   └── Monitoramento de Dados ZEUS → /admin/firecrawl-monitor
└── Teste (expandableId: "z3us-teste")
    ├── Upload Master → /admin/z3us/upload-master
    └── Teste de API Keys → /admin/api-test
```

### Mudanças necessárias

1. **`getVisibleChildren`** — Substituir o array de `subChildren` do item Z3US por 3 filhos expandíveis (cada um com seu `expandableId` e `subChildren`). Isso requer suporte a **3 níveis de profundidade** (ADMIN → Z3US → Usuários/Monitoramento/Teste → itens finais).

2. **Suporte a 3 níveis** — O código atual já suporta `expandableId` + `subChildren` em 2 níveis. Precisarei adicionar um nível intermediário: os subChildren do Z3US serão eles próprios expandíveis (com `expandableId` e `subChildren`). Isso exige:
   - Estender a interface `SubChild` para aceitar `expandableId` + `subChildren` (ou criar um tipo recursivo)
   - Adicionar lógica de renderização para o 3º nível no JSX (expandir sub-sub-children)
   - Gerenciar estado de expansão do 3º nível (novo state ou reusar `expandedChild` com IDs distintos)

3. **Renomear** "Monitor Firecrawl" → "Monitoramento de Dados ZEUS"

### Complexidade

O desafio principal é que o JSX atual renderiza no máximo 2 níveis de expansão. Precisarei adicionar renderização recursiva ou um 3º nível explícito no bloco de sub-children do Z3US.

