

## Plano: Remover filtro de ano do Olimpo

### Problema
A página `src/pages/Olimpo.tsx` aplica `filterByYearIfNotZ3us` nos dados do mapa (linha 254), restringindo processos por ano para usuários não-Z3US admin. O usuário confirma que **não deve haver nenhum filtro** no Olimpo.

### Ação

1. **Remover importação e uso de `filterByYearIfNotZ3us`** em `src/pages/Olimpo.tsx`:
   - Remover `filterByYearIfNotZ3us` do import (linha 3)
   - Remover a linha 254 que filtra os dados (`const yearFilteredData = filterByYearIfNotZ3us(...)`)
   - Substituir referências a `yearFilteredData` por `data` diretamente

### Resultado esperado
- Todos os usuários (admin ou não) veem todos os processos no mapa do Olimpo, sem restrição por ano.

