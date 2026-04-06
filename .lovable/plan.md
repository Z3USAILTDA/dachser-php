
Objetivo

Corrigir de vez a coluna Data/Hora em `/air/tracking-aereo`.

Diagnóstico

O dado está vindo do backend:
- `fetch-tracking-aereo` retorna `last_event_date: "31 Mar 2026 23:00"`.

O problema está no parsing no front:
- `TrackingAereo.tsx` renderiza com `formatDateTimeBR(awb.last_event_date)`.
- `formatDateTimeBR` chama `parseDBDate`.
- Em `parseDBDate`, a condição `if (dateStr.includes(' '))` roda antes do parser textual.
- Então `"31 Mar 2026 23:00"` é tratado como se fosse formato MariaDB e vira algo inválido como:
```text
31TMar 2026 23:00-03:00
```
- Resultado: `Invalid Date` e a tela mostra `—`.

Por que a correção anterior não resolveu

O suporte ao formato textual foi adicionado, mas ficou abaixo de uma regra mais genérica que captura qualquer string com espaço. Então o branch correto nunca é alcançado para esse formato.

Plano de correção

1. Ajustar a ordem do parsing em `src/utils/timezone.ts`.
   - Mover o branch do formato textual `"DD Mon YYYY HH:MM"` para antes da regra:
   ```ts
   if (dateStr.includes(' '))
   ```
   - Assim o formato do tracking será reconhecido corretamente.

2. Tornar o `parseDBDate` mais seguro.
   - Deixar a regra de “MariaDB datetime com espaço” restrita ao formato real `YYYY-MM-DD HH:mm:ss`, em vez de aceitar qualquer string com espaço.
   - Isso evita novos falsos positivos.

3. Padronizar `last_event_date` no `fetchData` de `src/pages/air/TrackingAereo.tsx`.
   - Em vez de manter o valor cru vindo da função, converter com `parseTimelineDateTime(...)` quando necessário.
   - Assim a tela, ordenação e qualquer cálculo passam a usar um formato consistente.

4. Corrigir também a ordenação da coluna.
   - Hoje o sort usa `new Date(a.last_event_date)`.
   - Com dado textual cru, isso pode continuar inconsistente entre navegadores.
   - Após normalizar o valor, a ordenação por data/hora volta a funcionar corretamente.

Arquivos a ajustar

- `src/utils/timezone.ts`
- `src/pages/air/TrackingAereo.tsx`

Resultado esperado

- A coluna Data/Hora volta a exibir valores.
- A ordenação por data deixa de falhar silenciosamente.
- O tracking aéreo passa a usar um formato de data consistente em toda a tela.
