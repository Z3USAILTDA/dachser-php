

## Corrigir fuso horario da coluna "Atualizacao" no CCT

### Problema
A coluna "Atualizacao" na tabela do CCT usa `new Date(dateStr)` diretamente, o que interpreta o sufixo `Z` das datas do MariaDB como UTC. Porem, o MariaDB armazena as datas no horario de Sao Paulo (UTC-3). Isso faz com que os horarios exibidos estejam **3 horas adiantados**.

### Solucao
Substituir o `new Date(dateStr)` pelo `parseDBDate` do utilitario centralizado `src/utils/timezone.ts`, que ja trata corretamente o fuso horario do banco de dados.

### Alteracao

**Arquivo: `src/components/cct/ProcessosTable.tsx`**

1. Adicionar import do `parseDBDate` de `@/utils/timezone`
2. Alterar a funcao `formatDate` (linha 93-96) para usar `parseDBDate` em vez de `new Date`:

```typescript
// Antes
const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "dd/MM HH:mm", { locale: ptBR });
};

// Depois
const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "-";
  const parsed = parseDBDate(dateStr);
  if (!parsed) return "-";
  return format(parsed, "dd/MM HH:mm", { locale: ptBR });
};
```

### Impacto
- A coluna "Atualizacao" passara a exibir o horario correto de Sao Paulo
- Nenhuma outra coluna ou componente e afetado por esta mudanca

