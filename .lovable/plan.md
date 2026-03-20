

## Plano: Corrigir destaque de rota — RCF deve destacar a origem quando há conexões

### Problema
AWB 724-85006073 (CDG → ZRH → GRU): o status RCF em ZRH indica que a carga saiu da origem (CDG) e foi recebida na conexão. A origem deveria estar amarela, mas o destino (GRU) está destacado porque `RCF` está na lista `POST_DESTINO` que é verificada primeiro (linha 2753).

### Solução
Em `src/pages/Index.tsx` (linhas 2752-2764), quando há conexões, reorganizar a ordem de verificação:

1. **Criar lista `FINAL_DESTINO_ONLY`** com status exclusivamente de destino final: `DLV`, `POD`, `ARR - DESTINO`
2. **Criar lista `ORIGIN_DEPARTURE`** que inclui `RCF` junto com os status pré-embarque — quando há conexões, RCF indica que a carga acabou de sair da origem
3. **Lógica com conexões passa a ser**:
   - `FINAL_DESTINO_ONLY` → destacar destino
   - `PRE_DEPARTURE` ou `RCF` → destacar origem
   - `AT_CONEXAO` / `DEP` / `IN_TRANSIT_AT_CONNECTION` (sem RCF) → destacar conexão
   - `POST_DESTINO` restante (`ARR`, `NFD`, `AWD`, `CCD`, `AWR`, `FOH`) → destacar destino
   - fallback → origem

4. **Lógica sem conexões** permanece inalterada (RCF no destino faz sentido quando não há ponto de trânsito)

### Arquivo alterado
- `src/pages/Index.tsx` — bloco de highlight de rota (linhas ~2750-2764)

