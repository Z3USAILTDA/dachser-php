## Fase 1 — Migração controlada Régua de Cobrança para `t_dados_financeiro_contas_receber` (final)

Objetivo: criar camada paralela (view + endpoints shadow `_cr`) sem alterar nenhum endpoint atual, tela, e-mail, disputa ou Olimpo. Permite validação lado-a-lado antes de cutover.

### Escopo

1. **`supabase/functions/mariadb-proxy/index.ts`** — adicionar 5 novos `case` (endpoints shadow). Nenhum endpoint atual alterado.
2. **DDL MariaDB** — criar a view `dados_dachser.v_fin_regua_contas_receber` (executada manualmente pelo usuário).

Tudo o mais permanece intocado.

---

### 1. View `v_fin_regua_contas_receber`

Mesma estrutura especificada, com aliases extras (`ref_cliente`, `referencia_cliente`, `nro_di`, `statuslan`, `datavalidade`) apenas se as colunas-fonte existirem em `t_dados_financeiro_contas_receber` (validar com `DESCRIBE` antes).

```sql
CREATE OR REPLACE VIEW dados_dachser.v_fin_regua_contas_receber AS
SELECT
  t.idlan AS id_rm,
  t.idlan AS idlan,
  t.idmov AS idmov,
  CONCAT('CR|', t.idlan) AS doc_key,
  t.numerodocumento AS documento,
  t.nota_fiscal AS numero_nf,
  t.segundonumero AS nd,
  t.segundonumero AS segundo_numero,
  t.codcfo AS cod_cliente,
  t.customercode AS customer_code,
  t.cnpjoucpf AS cnpj,
  t.razaosocial_clifor AS razao_social,
  t.codtb5flx AS modal,
  t.codtdo AS tipo_documento,
  t.codtmv AS tipo_movimento,
  t.dataemissao AS data_emissao,
  t.datavencimento AS data_vencimento,
  t.dataprevbaixa AS data_prev_baixa,
  t.databaixa AS data_baixa,
  t.valororiginal AS valor_original,
  t.valorliquido AS valor_liquido,
  t.valorbaixado AS valor_baixado,
  t.valorpendentebaixa AS valor_nf,
  t.valorpendentebaixa AS valor_pendente_baixa,
  t.valorpendbx_dtcorte AS valor_pendente_data_corte,
  t.valorjuros AS valor_juros,
  t.valordesconto AS valor_desconto,
  t.retencao AS retencao,
  t.outrasdeducoes AS outras_deducoes,
  t.processo AS processo,
  t.codmaster AS master,
  t.house AS house,
  t.nrodi AS di,
  t.nrodi AS nro_di,
  t.origem AS origem,
  t.destino AS destino,
  t.codcpgvenda AS cod_condicao_pagamento,
  t.nomepgvenda AS condicao_pag,
  t.vendedor AS nome_vendedor,
  t.oth_salesid AS sales_id,
  t.statuslan AS status_lancamento,
  t.statuslan AS statuslan,
  t.carteira AS carteira,
  t.datacriacao AS data_criacao,
  t.ultimaalteracao AS ultima_alteracao,
  t.datavalidade AS data_insert,
  t.datavalidade AS datavalidade,
  t.refcliente AS ref_cliente,
  t.refcliente AS referencia_cliente,
  CASE WHEN t.codtdo = 'FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo_pagamento
FROM dados_dachser.t_dados_financeiro_contas_receber t
WHERE t.carteira = 'Receber'
  AND COALESCE(t.valorpendentebaixa, 0) > 0
  AND t.statuslan IN ('Em aberto', 'Baixado parcialmente')
  AND t.datavencimento IS NOT NULL;
```

---

### 2. Endpoints shadow

**Regra de ouro:** mesmo *shape* de retorno dos endpoints atuais, **SQL reescrito** — sem copiar referências a colunas inexistentes na view (`t.disputa`, `t.inicio_disputa`, `t.responsavel_disp`, `t.email_cliente`, JOINs com `tbaixas` etc.). Se o endpoint antigo filtrava `AND t.disputa = 0`, a versão `_cr` **omite** esse filtro nesta fase.

**Padrão de soft delete (todos os `_cr`):** usar `NOT EXISTS` em vez de `LEFT JOIN`, para evitar duplicidade caso existam múltiplos registros para a mesma chave:

```sql
AND NOT EXISTS (
  SELECT 1
  FROM ai_agente.t_financeiro_soft_delete sd
  WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
    AND sd.active = 0
)
```

Sem registro = aparece; com `active = 0` = oculto. Equivalente em comportamento ao `COALESCE(sd.active, 1) = 1` antigo, sem multiplicar linhas.

#### Cases a adicionar

- **`get_regua_counts_cr`** — **shape idêntico ao `get_regua_counts` atual.** Hoje o endpoint atual **não** retorna `FORA_DA_REGUA`; portanto o `_cr` **também não** retorna. Buckets: PRE, D1, D7, D15, D30, D45, D60, com regra especial `FAT_NF` (sem D45; D60 = 45+). Valor somado: `valor_nf` (= `valorpendentebaixa`). Origem: `v_fin_regua_contas_receber`. Soft delete por `NOT EXISTS` em `doc_key`.

- **`get_regua_stage_cr`** — mesmos parâmetros e mesmo shape de `get_regua_stage`. Campos retornados (só os existentes na view): `id_rm, idlan, doc_key, documento, numero_nf, nd, cnpj, razao_social, modal, tipo_documento, tipo_pagamento, data_emissao, data_vencimento, valor_nf, valor_liquido, valor_pendente_baixa, processo, master, house, condicao_pag, nome_vendedor, status_lancamento`.

- **`get_regua_clientes_resumo_cr`** — agrupado por cliente. Retorno: `razao_social, razao_base, cnpj, total_titulos, valor_total, menor_vencimento, maior_vencimento`. `razao_base = SUBSTRING_INDEX(razao_social, ' - ', 1)`. Soft delete via `NOT EXISTS`.

- **`get_financeiro_nfs_stats_cr`**:
  ```sql
  SELECT COUNT(*) AS total_records, MAX(data_insert) AS last_update
  FROM dados_dachser.v_fin_regua_contas_receber;
  ```

- **`compare_regua_old_vs_cr`** — endpoint auxiliar, não plugado em tela. **Único lugar que expõe `FORA_DA_REGUA`** (apenas para auditoria). Retorna:
  ```json
  {
    "base_antiga": { "total_titulos": n, "valor_total": v,
      "buckets": { "PRE": ..., "D1": ..., "D7": ..., "D15": ..., "D30": ..., "D45": ..., "D60": ..., "FORA_DA_REGUA": ... } },
    "base_nova":   { ... mesmo shape ... },
    "diferenca":   { "total_titulos": nova-antiga, "valor_total": nova-antiga, "buckets": { ... } },
    "diferencas_esperadas": [
      "Origem: nfs vs contas_receber",
      "Valor: base antiga pode usar valor_nf/tbaixas; base nova usa valorpendentebaixa",
      "Statuslan: nova filtra 'Em aberto'/'Baixado parcialmente'",
      "Disputa: base antiga pode excluir títulos em disputa; base nova ainda não trata disputa",
      "Soft delete: base antiga usa chaves antigas; base nova usa doc_key=CR|idlan",
      "Títulos com 2 a 6 dias de atraso seguem FORA_DA_REGUA em ambas as bases"
    ]
  }
  ```

Adicionar os 5 novos action names à allowlist (linhas ~503-528). Logar cada case com prefixo `[*_cr]`.

---

### 3. Ressalvas documentadas (comentário no topo de cada case `_cr`)

- **Disputa fora desta fase.** Endpoints `_cr` não filtram nem resolvem disputa. Diferença vs. base antiga por causa disso é esperada.
- **Soft delete antigo pode não bater 100%.** Registros antigos foram gravados com chave antiga (`documento` ou `documento|nf`), não com `CR|idlan`. Não migrar nesta fase.
- **Sem JOIN com `tbaixas`** nos `_cr` — `valorpendentebaixa > 0` na view já reflete saldo aberto.
- Nada de `valororiginal`/`valorliquido` como valor principal.
- Nada de INSERT/UPDATE/DELETE.

---

### 4. Validação manual

```
get_regua_counts            vs  get_regua_counts_cr
get_regua_stage             vs  get_regua_stage_cr
get_regua_clientes_resumo   vs  get_regua_clientes_resumo_cr
get_financeiro_nfs_stats    vs  get_financeiro_nfs_stats_cr
compare_regua_old_vs_cr
```

Aceite: `_cr` mesmo shape do antigo (sem `FORA_DA_REGUA` no `counts_cr`); `compare_regua_old_vs_cr` retorna comparação + `diferencas_esperadas`; endpoints antigos inalterados; nenhuma tela mudou.

---

### Fora desta fase

- Cutover do frontend para `_cr`.
- Migração de disputas para `ai_agente.t_fin_disputas` com `doc_key`.
- Migração de chaves antigas de soft delete para `CR|idlan`.
- Migração do Olimpo.
- Revisão do `regua-send-emails` (modo teste / devs@z3us.ai).
