## Analise da Demora do SELECT `search_vouchers_for_master`

### Dados Observados

- **Tempo total percebido pelo usuário**: ~32 segundos (digitou em `116894`, resultado em `149105`)
- **Debounce no frontend**: 500ms (linha 83 do `VoucherMasterForm.tsx`)
- **O request HTTP retornou status 200** com 1 resultado

### Causas Identificadas

A demora tem **3 componentes cumulativos**:

#### 1. Cold Start da Edge Function (~5-10s)

O arquivo `mariadb-proxy/index.ts` tem **14.691 linhas**. Isso causa um cold start significativo toda vez que a função não está "quente". O log do edge function mostra `booted (time: 41ms)` mas o bundle e compilação do arquivo enorme adiciona latência antes mesmo do boot.

#### 2. Conexão MariaDB (~1-3s)

Cada chamada precisa abrir uma conexão TCP nova ao MariaDB (`177.70.19.42:3306`). O log mostra `INFO connecting → INFO connected` levando ~300ms em condições normais, mas pode chegar a vários segundos sob carga ou instabilidade de rede.

#### 3. Query SQL lenta (~20-25s) — **Causa principal**

O `LEFT JOIN` com `t_dados_financeiro_voucher` usando `COLLATE utf8mb4_unicode_ci` em ambos os lados da condição **impede o uso de índices**. Além disso:

- `LIKE '%search'` (busca por sufixo) em 5 campos diferentes **não pode usar índices** — força full table scan
- `CAST(v.id AS CHAR) LIKE ?` e `CAST(v.id_rm AS CHAR) = ?` — o `CAST` também impede índices
- O `LEFT JOIN` multiplica os registros antes do `DISTINCT`, adicionando overhead
- O `ORDER BY v.created_at DESC` sem LIMIT força o sort de todo o result set

### Plano de Otimização

#### Passo 1: Remover o LEFT JOIN com `t_dados_financeiro_voucher`

O campo `dfv.nd` é redundante — ele é igual a `v.numero_spo` (é a condição do JOIN). Buscar por `dfv.nd LIKE '%search'` quando já se busca `v.numero_spo = search` é desnecessário. Remover o JOIN elimina o scan extra na tabela financeira.

#### Passo 2: Otimizar a query para usar índices quando possível

- Manter `v.numero_spo = ?` como exact match (usa índice)
- Manter `v.id_rm = ?` como exact match
- Converter os `LIKE '%search'` para condições mais específicas onde possível
- Remover `CAST(v.id AS CHAR) LIKE ?` — buscar por UUID parcial via LIKE é ineficiente e raramente útil

### Mudanças Concretas

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (linhas 10467-10485)

Nova query:

```sql
SELECT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda,
       v.vencimento, v.etapa_atual, v.filial, v.voucher_master_id, v.is_master,
       v.processo_id
FROM dados_dachser.t_vouchers v
WHERE (
  v.numero_spo = ?
  OR v.fornecedor LIKE ?
  OR v.cnpj_fornecedor LIKE ?
  OR v.processo_id LIKE ?
  OR CAST(v.id_rm AS CHAR) = ?
)
AND (v.etapa_atual != 'CANCELADO' OR v.etapa_atual IS NULL)
ORDER BY v.created_at DESC

```

Parâmetros reduzidos de 7 para 5: `[search, %search, %search, %search, search]`

**Resultado esperado**: Query de ~32s para ~1-3s ao eliminar o JOIN e reduzir campos LIKE.