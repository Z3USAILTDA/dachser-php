

## Diagnóstico: Filtro Impo/Expo Marítimo

### Problema encontrado

A lógica atual tem **3 pontos de falha** que fazem o `tipo_processo` ser quase sempre `'SEA IMPORT'`:

1. **Sync hardcoded**: Quando novos MBLs são inseridos na `t_tracking_sea` vindos da `t_sea_master`, o `tipo_processo` é fixado como `'SEA IMPORT'` (linha 2241 do `olimpo-proxy`), mesmo para processos de exportação.

2. **COALESCE com prioridade errada**: A query principal usa:
   ```sql
   COALESCE(MAX(ts.tipo_processo), MAX(mdn.tipo_processo), 'SEA IMPORT')
   ```
   Isso prioriza o valor da `t_tracking_sea` (que é o hardcoded errado) sobre o valor real vindo da `t_master_dados`.

3. **A tabela `t_sea_master` não tem coluna `tipo_processo`**, então na sincronização inicial não há como saber o tipo correto.

### Plano de correção

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts`

1. **Inverter prioridade do COALESCE na query principal** (linha ~1908):
   ```sql
   COALESCE(MAX(mdn.tipo_processo), MAX(ts.tipo_processo), 'SEA IMPORT') as tipo_processo
   ```
   Isso garante que o valor real do `t_master_dados` (que distingue corretamente IMPORT/EXPORT) tenha prioridade.

2. **Na sincronização de candidatos da `t_sea_master`** (linha ~2241): usar um LEFT JOIN com `t_master_dados` para tentar resolver o `tipo_processo` real, ao invés de hardcodar `'SEA IMPORT'`:
   ```sql
   COALESCE(MAX(md.tipo_processo), 'SEA IMPORT') AS tipo_processo
   ```

3. **Atualizar registros existentes** com `tipo_processo = 'SEA IMPORT'` que na verdade são EXPORT: adicionar um UPDATE na ação `sync_sea_tracking` que corrige registros existentes baseado no `t_master_dados`.

Essas mudanças farão o filtro funcionar corretamente sem necessidade de alteração no frontend.

