

## Plano: Adicionar 2 novas abas à importação Othello

### Resumo
Estender a importação existente em `/fin/othello-import` para processar as abas **"Othello Nacional-Não RLS"** e **"Othello Internacional-Não RLS"**, gravando nas tabelas MariaDB `t_othello_nacional_nao_rls` e `t_othello_internacional_nao_rls`.

### Arquivos alterados

#### 1. `src/pages/fin/OthelloImport.tsx`

- Adicionar constantes de headers para as 2 novas abas
- Adicionar nomes das novas abas em `REQUIRED_SHEETS` (total: 5)
- Criar função `toDateStrOrNull(v)` que trata `-` como NULL (regra especial de datas logísticas ETD/ATD/ETA/ATA)
- No `handleImport`:
  - Validar existência e headers das 2 novas abas
  - Processar **Othello Nacional-Não RLS** (20 colunas, valida `id_ref_object || settlement_id`)
  - Processar **Othello Internacional-Não RLS** (13 colunas, valida `id_ref_object`)
  - Enviar os 2 arrays adicionais (`nacional_nao_rls`, `internacional_nao_rls`) no payload ao edge function
- Atualizar `ImportResult.counts` para incluir `nacional_nao_rls` e `internacional_nao_rls`
- Adicionar 2 linhas no resumo final
- Atualizar texto descritivo para "5 abas obrigatórias"

#### 2. `supabase/functions/fin-othello-import/index.ts`

- Receber `nacional_nao_rls` e `internacional_nao_rls` do payload
- Validar presença dos 2 novos arrays
- Dentro da transação:
  - `DELETE FROM dados_dachser.t_othello_nacional_nao_rls`
  - `DELETE FROM dados_dachser.t_othello_internacional_nao_rls`
  - INSERT loop para `t_othello_nacional_nao_rls` (campos: arquivo_origem, aba_origem, linha_excel, importado_em, id_ref_object, settlement_id, branch, object_type, service_date, cost_center_iv, deb_cred_no, deb_cred_name, settlement_type, status_settl, status_interpreter, flag, revenue, revenue_transit, total_revenue, etd, atd, eta, ata, comentarios)
  - INSERT loop para `t_othello_internacional_nao_rls` (campos: arquivo_origem, aba_origem, linha_excel, importado_em, id_ref_object, branch, service_date, cost_center_iv, deb_cred_name, status_settl, flag, revenue, etd, atd, eta, ata, comentarios)
  - Usar `NULLIF(?, '')` para colunas DATE (etd, atd, eta, ata) conforme regra MariaDB
  - `importado_em = NOW()` direto no SQL
- Retornar contagens das 2 novas tabelas no response

### Detalhes técnicos

**Headers Nacional-Não RLS (20 colunas):**
ID Ref Object, Settlement ID, Branch, Object Type, Service Date, Cost Center IV, Deb Cred No, Deb Cred Name, Settlement Type, Status Settl, Status Interpreter, Flag, Revenue, Revenue (Transit), ∑ Revenue, ETD, ATD, ETA, ATA, Comentários

**Headers Internacional-Não RLS (13 colunas):**
ID Ref Object, Branch, Service Date, Cost Center IV, Deb Cred Name, Status Settl, Flag, Revenue, ETD, ATD, ETA, ATA, Comentários

**Regra de datas ETD/ATD/ETA/ATA:**
- `"-"` → NULL
- `""` → NULL  
- Data Excel válida → formato `YYYY-MM-DD`
- String `"2010-01-01"` → mantém

### O que NÃO muda
- Lógica das 3 abas existentes (Nacional-RLS, Interacional-RLS, Base Totvs RM)
- Layout, design e componentes visuais
- Fluxo de autenticação e navegação

