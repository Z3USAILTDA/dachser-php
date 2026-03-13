

## Plano: Adicionar AWB 139-47195142 como crítico com indicação de staleness

Mesmo tratamento já aplicado ao 139-47195164: adicionar o AWB `139-47195142` ao array `CRITICAL_AWBS` nas 4 ocorrências e garantir que o badge mostra "Sem atualização Xh/Xd".

### Alterações em `src/pages/Index.tsx`

1. **4 ocorrências de `CRITICAL_AWBS`** (linhas ~2078, ~2410, ~2676, ~2978): adicionar `"139-47195142"` ao array, ficando:
   ```typescript
   const CRITICAL_AWBS = ["045-21167274", "139-47195164", "139-47195142"];
   ```

2. **Badge crítico** (linha ~2991): manter a lógica já existente (ou a ser implementada junto com o 139-47195164) que calcula o tempo desde o último evento e exibe `"Sem atualização Xh"` ou `"Sem atualização Xd"` para AWBs forçados na lista `CRITICAL_AWBS` que não possuem `pieces_discrepancy` nem `has_dis_event`.

