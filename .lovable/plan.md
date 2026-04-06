

## Plano: Corrigir 6 problemas na Régua de Cobrança e Olimpo Cobrança

### Problemas identificados e soluções

---

### 1. Importação de planilha e disputa manual retornando erro

**Causa raiz**: O `save_disputa` (manual) e `import_disputas_planilha` usam o driver `deno-mysql` que é instável em conexões concorrentes. Além disso, a importação e criação manual podem falhar se houver problemas de constraint no `INSERT INTO ai_agente.t_fin_disputas` (ex: coluna `nf` como chave primária/unique com colisão de collation).

**Ação**: 
- Testar a edge function `mariadb-proxy` com action `save_disputa` via curl para reproduzir o erro exato
- Adicionar tratamento de erro mais granular com try/catch em torno de cada operação SQL no `save_disputa` e `import_disputas_planilha`
- Verificar nos logs se há erros de constraint ou conexão

---

### 2. Campos observações e prazo não sobem corretamente na importação

**Causa raiz identificada**: O campo `prazo` é parseado na planilha (`prazoIdx` encontrado na linha 543/597) mas NUNCA é incluído no objeto `items.push()`. O objeto só contém `nd`, `descricao`, `departamento`, `responsavel`, `escalation` — sem `prazo`. Além disso, o backend `import_disputas_planilha` aceita `prazo` no tipo mas nunca o usa na query INSERT/UPDATE.

**Ação no frontend** (`src/pages/FinanceiroDisputa.tsx`):
- Adicionar `prazo` ao tipo e ao `items.push()` usando `prazoIdx`

**Ação no backend** (`supabase/functions/mariadb-proxy/index.ts`):
- Verificar se `t_fin_disputas` tem coluna `prazo` (ou `vencimento`)
- Incluir o campo `prazo` no INSERT e UPDATE da importação

**Para observações**: O campo `descricao` é mapeado para `observacoes` no INSERT — parece correto. Precisa verificar se o problema é o mapeamento de colunas na planilha (o `descIdx` pode não encontrar a coluna correta dependendo do nome usado).

---

### 3. Exportação de planilha — valor e total valor mostrando contagem

**Causa raiz**: Analisando `disputaExcelExport.ts`, o código parece correto — usa `r.valor` diretamente e `rows.reduce((sum, r) => sum + (r.valor || 0), 0)` para o total. O possível problema é que `r.valor` está chegando como string (do MariaDB) e o `||` trata como falsy. Se `valor` vier como `"123.45"` (string), o `r.valor || 0` funciona mas o SUM pode dar problemas se misturar tipos.

**Ação**: Garantir que `valor` é convertido para `Number()` na exportação: `Number(r.valor) || 0` tanto na linha de dados quanto no reduce do total.

---

### 4. Erro ao editar observação ou excluir disputa

**Causa raiz**: Relacionado ao problema 1 (conexão). O `update_disputa_observacoes` e `delete_disputa` fazem SELECT + UPDATE/INSERT que podem falhar por constraint ou conexão instável.

**Ação**: Corrigir junto com o item 1 — melhorar tratamento de erros e usar UPSERT mais robusto.

---

### 5. Erro ao enviar aging agrupado (múltiplos CNPJs)

**Causa raiz**: O `regua-send-aging` recebe `cnpjs[]` e faz queries separadas para cada CNPJ base. O problema pode ser:
- `max_user_connections` excedido (visto nos logs de rede: status 500 com "exceeded 'max_user_connections' resource (current value: 30)")
- O driver `npm:mysql2/promise` mantém conexões abertas muito tempo durante o processamento em lote

**Ação**: 
- Verificar logs da edge function `regua-send-aging`
- Reutilizar uma única conexão para todas as queries de CNPJs em vez de abrir múltiplas
- Adicionar timeout e retry no envio

---

### 6. Discrepância Total Receivable (R$30.8M vs R$21.3M)

**Causa raiz provável**: O `get_aging_overview` soma TODOS os registros (incluindo `not_due` — não vencidos), enquanto a planilha de 86 RM provavelmente só contém os vencidos. A diferença de ~R$9.5M seria os títulos a vencer.

**Ação**:
- Verificar se a planilha de referência (86 RM) exclui títulos `not_due`
- Verificar se a data do último registro (30/03/2026) indica dados desatualizados
- Adicionar breakdown no dashboard mostrando separadamente "A Vencer" e "Vencido" para facilitar comparação

---

### Arquivos a alterar

1. **`supabase/functions/mariadb-proxy/index.ts`**: 
   - `save_disputa` (~2919): melhorar try/catch
   - `import_disputas_planilha` (~3164): adicionar campo `prazo` no INSERT/UPDATE
   - `update_disputa_observacoes` (~2804): verificar robustez
   - `delete_disputa` (~3021): verificar robustez

2. **`src/pages/FinanceiroDisputa.tsx`**:
   - `parseSpreadsheet` (~500-625): incluir `prazo` no objeto parsed
   - Tipo do item: adicionar campo `prazo`

3. **`src/utils/disputaExcelExport.ts`**:
   - Garantir `Number()` cast no valor (~166, ~180)

4. **`supabase/functions/regua-send-aging/index.ts`**:
   - Investigar e corrigir erro de conexão no envio agrupado

5. **Dashboard Olimpo Cobrança** (se necessário após investigação do item 6)

### Ordem de execução

1. Primeiro diagnosticar os erros reais via logs e curl (items 1, 4, 5)
2. Corrigir o parse da planilha (item 2 — prazo/observações)
3. Corrigir a exportação (item 3 — Number cast)
4. Corrigir o envio agrupado (item 5)
5. Investigar discrepância de valores (item 6)

