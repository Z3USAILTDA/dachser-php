

## Plano: Corrigir fuso horário nas datas do Histórico de Baixas

### Problema
A função `formatDate` (linha 121-129 de `HistoricoBaixasTab.tsx`) usa `parseISO` do date-fns. Quando o backend retorna `"2026-04-10"` (sem hora), `parseISO` interpreta como UTC meia-noite. No fuso do Brasil (UTC-3), isso vira `2026-04-09 21:00`, resultando em `09/04/2026` na tela.

### Solução
Substituir `parseISO(dateStr)` por um parsing manual que trata a data como local, evitando a conversão de fuso:

```typescript
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    // Para datas ISO sem hora (YYYY-MM-DD), parsear como local
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}/${m}/${y}`;
    }
    // Fallback para datas com hora
    const date = parseISO(dateStr);
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
};
```

### Resumo
| Arquivo | Alteração |
|---------|-----------|
| `src/components/esteira/HistoricoBaixasTab.tsx` linhas 121-129 | Tratar datas `YYYY-MM-DD` sem conversão de fuso |

Uma alteração cirúrgica de ~8 linhas.

