

## Plano: Amarelo indica localização atual baseada no aeroporto, não no tipo de status

### Problema

A origem está sempre amarela. O correto: o amarelo marca **onde o processo está fisicamente**. Se o status (qualquer que seja — BKD, RCS, MAN, ARR, DEP, etc.) aconteceu na conexão, a conexão fica amarela. Se aconteceu na origem, a origem fica amarela. Se no destino, o destino.

### Lógica

A localização atual é determinada pela **posição na rota**, não pelo código do status:

1. Se `conexao` existe:
   - Statuses pós-chegada no destino (`ARR - DESTINO`, `RCF`, `NFD`, `AWD`, `DLV`, `POD`, `CCD`, `AWR`) → **destino** amarelo
   - Statuses na conexão (`ARR - CONEXÃO` e qualquer status como BKD/MAN/RCS/DEP que ocorre após ARR-CONEXÃO) → **conexão** amarela
   - Demais (ainda não chegou na conexão) → **origem** amarela
2. Se `conexao` não existe:
   - Statuses pós-chegada (`ARR`, `RCF`, `NFD`, `DLV`, etc.) → **destino** amarelo
   - Demais → **origem** amarela

**Simplificação prática:** Como não temos um campo "localização atual" explícito, usamos o status como proxy:
- `POST_DESTINO = ['ARR - DESTINO', 'ARR', 'RCF', 'NFD', 'AWD', 'DLV', 'POD', 'CCD', 'AWR']` (quando não há conexão, ARR = destino)
- `AT_CONEXAO = ['ARR - CONEXÃO', 'ARR - CONEXAO']` + qualquer status que **não** seja pós-destino quando `conexao` existe e o processo já passou pela origem (i.e., status como BKD, MAN, DEP na conexão)

**Regra final simplificada:**
- Se status está em `POST_DESTINO` → destino amarelo
- Se status é `ARR - CONEXÃO/CONEXAO` → conexão amarela
- Se `conexao` existe e status é `DEP` (saiu da conexão rumo ao destino) → conexão amarela (ainda na rota da conexão)
- Senão → origem amarela

### Alteração

**Arquivo:** `src/pages/Index.tsx` (linhas 2739-2766)

Substituir a IIFE da rota para usar lógica de highlight dinâmico. Remover `animate-pulse` e `text-orange-400`.

### Arquivo modificado

1. `src/pages/Index.tsx` — lógica de cores na célula Rota

