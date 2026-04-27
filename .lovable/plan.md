## Objetivo

Corrigir o erro 500 (`Unknown column 't.aeroporto_origem'`) e usar `t_fato_aereo` como fonte oficial da rota (origem/destino) no dashboard CCT.

## Diagnóstico

A tabela `t_dados_aereo` **não possui** as colunas `aeroporto_origem`/`aeroporto_destino` — daí o erro 500 da última alteração. A rota deve vir de `t_fato_aereo`, que já é usada em outras partes do projeto e expõe `origin` e `destination`, ligadas por `awb`.

## Mudança (mariadb-proxy/index.ts, action `get_cct_shipments_cached`)

1. **Remover** as colunas `t.aeroporto_origem` e `t.aeroporto_destino` da subquery de `t_dados_aereo` (não existem).
2. **Adicionar** `LEFT JOIN dados_dachser.t_fato_aereo f` ligando por `f.awb = COALESCE(c.awb, m.mawb, a.awb_number)` (com `COLLATE utf8mb4_unicode_ci`).
3. **Atualizar SELECT** da rota:
   - `aeroporto_origem` ← `f.origin`
   - `aeroporto_destino` ← `f.destination`
4. Manter os demais COALESCEs (cliente, master, analista) com fallback `t_master_dados → t_dados_aereo` já implementados.

## Resultado

- Corrige o 500 imediatamente.
- Rota passa a vir de `t_fato_aereo` (fonte de tracking real), independente de existir registro em `t_master_dados` ou `t_dados_aereo`.
- Mantém a abordagem cirúrgica — apenas a query do action `get_cct_shipments_cached` é alterada.