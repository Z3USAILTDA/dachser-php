## Mudança

Hoje, em `src/pages/air/TrackingAereo.tsx` (linha 727), processos com `hide_reason` (vindos da `t_air_process_visibility`) só são ocultados quando **não há** termo de busca. Qualquer texto digitado já os revela — inclusive um pedaço do número (ex.: `001-234`).

A nova regra: processos ocultos só devem aparecer quando o termo de busca for **igual** ao número completo do AWB ou do HAWB.

## Implementação

Arquivo único: `src/pages/air/TrackingAereo.tsx`

1. **`filteredAwbs` (linha 727)** — substituir
   ```ts
   if (!searchTerm && awb.hide_reason) return false;
   ```
   por uma checagem de match exato:
   ```ts
   if (awb.hide_reason) {
     const term = searchTerm.trim().toLowerCase();
     const awbNum = (awb.awb || "").trim().toLowerCase();
     const hawbNum = (awb.hawb || "").trim().toLowerCase();
     // Aceita com ou sem o traço do AWB (001-23496686 ou 00123496686)
     const awbNoDash = awbNum.replace(/-/g, "");
     const termNoDash = term.replace(/-/g, "");
     const isFullMatch =
       term.length > 0 &&
       (term === awbNum || term === hawbNum || termNoDash === awbNoDash);
     if (!isFullMatch) return false;
   }
   ```

2. **Contadores dos cards (linha 703)** — manter `if (awb.hide_reason) return;` como está, para que processos ocultos **nunca** entrem nas contagens de Total/Trânsito/Alerta/Crítico, mesmo quando estiverem visíveis por busca exata (mantém o comportamento atual dos cards).

Nenhuma mudança no backend (`fetch-tracking-aereo`) nem na tabela `t_air_process_visibility` — apenas filtro de UI.
