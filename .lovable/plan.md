

# Fix: Bloquear logs de usuário "unknown" no useUsageLog

## Problema
O hook `useUsageLog` registra acessos com username "unknown" quando não há sessão válida, poluindo as métricas.

## Solução

**Arquivo: `src/hooks/useUsageLog.ts`**

Adicionar validação para só registrar quando houver um username real (não "unknown"):

1. No hook `useUsageLog`: após extrair o username, verificar se é válido antes de chamar o log. Se for "unknown" ou vazio, abortar silenciosamente.

2. Na função `logAction`: mesma validação — não registrar se username resultar em "unknown".

```typescript
// Antes de chamar o log:
const username = user?.username || user?.email?.split("@")[0];
if (!username || username === "unknown") return; // ← aborta
```

Alteração em um único arquivo, sem impacto no backend.

