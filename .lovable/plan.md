## Diagnóstico

1. **Valor / Total vazios** — Causa raiz: o MariaDB devolve `valor` como string ("39.08"). No `ReportsTab.tsx` (linha 75) o campo é repassado sem `parseFloat`, e no `voucherExcelExport.ts` há um guard `typeof v.valor === "number"` que descarta tudo e grava 0. Resultado: coluna Valor toda 0 e linha TOTAL = 0.

2. **A_PROCESSAR ausente** — Causa raiz: vouchers "A Processar" vivem na tabela RM (`t_rm_*`), não em `t_vouchers`. A action `export_vouchers_report` consulta apenas `dados_dachser.t_vouchers`. Confirmação por contagem: `t_vouchers` não possui linhas com `etapa_atual = 'A_PROCESSAR'`. Por isso, mesmo com o WHERE incluindo `A_PROCESSAR`, nada retorna.

3. **Colunas estreitas** — As larguras atuais (16, 8, 12, 16…) cortam textos como "Forma de Pagamento" e "Necessita Fiscal". Aumentar as larguras e dar `wrapText` apenas onde realmente faz sentido.

---

## Mudanças

### A) `src/utils/voucherExcelExport.ts`
- Coluna **Valor**: usar `Number(v.valor) || 0` em vez de `typeof === 'number'` para aceitar strings vindas do banco.
- Larguras maiores (em `wch`):
  - Número SPO/Voucher: 22
  - Fornecedor: 38
  - CNPJ Fornecedor: 22
  - Valor: 18
  - Moeda: 10
  - Vencimento: 14
  - Necessita Fiscal: 18
  - Forma de Pagamento: 22
  - Urgente: 12
  - Etapa Atual: 26
  - Criado Por: 30
- Header com `wrapText: true`, altura 32; linhas de dados sem `wrapText` (textos curtos cabem) — evita quebras feias.
- Linha TOTAL recalculada com `Number()` também (mantém fórmula `SUM`).

### B) `supabase/functions/mariadb-proxy/index.ts` — action `export_vouchers_report`
Incluir vouchers RM pendentes via `UNION ALL` quando `etapa` ∈ {`all`, `OPERACAO`, `A_PROCESSAR`}:

```sql
SELECT ... FROM dados_dachser.t_vouchers v ... ${whereClause}
UNION ALL
SELECT
  CONCAT('rm_pending_', rm.nd) AS id,
  rm.nd AS numero_spo,
  COALESCE(rm.nome_beneficiario, rm.razao_social) AS fornecedor,
  rm.cnpj AS cnpj_fornecedor,
  rm.valor_nf AS valor,
  COALESCE(rm.moeda, 'BRL') AS moeda,
  rm.data_vencimento AS vencimento,
  CASE WHEN rm.nome_cobranca = 'CLIENTE' THEN 'CLIENTE' ELSE 'DACHSER' END AS cobranca_em_nome_de,
  /* mapear forma_pag para forma_pagamento (BOL→BOLETO, TED→TRANSFERENCIA, etc.) */,
  'NORMAL' AS urgencia_tipo,
  'A_PROCESSAR' AS etapa_atual,
  rm.created_by AS dfv_created_by,
  NULL AS criado_por_username,
  rm.created_at, rm.updated_at, ...
FROM dados_dachser.t_rm rm
LEFT JOIN dados_dachser.t_vouchers v2
  ON TRIM(v2.numero_spo) COLLATE utf8mb4_general_ci = TRIM(rm.nd) COLLATE utf8mb4_general_ci
WHERE v2.id IS NULL
  /* aplicar mesmos filtros de data quando dataInicio/dataFim presentes */
ORDER BY created_at DESC
LIMIT 5000
```

Regras:
- Antes do UNION, descobrir o nome real da tabela RM pendente (provavelmente `dados_dachser.t_rm` ou similar). Vou inspecionar o código existente que carrega `rmPendingResult` em `EsteiraIndex.tsx` para reaproveitar a mesma fonte.
- Aplicar o UNION somente se `etapa` ∈ {`all`, `OPERACAO`, `A_PROCESSAR`}; caso contrário, manter só `t_vouchers`.
- Filtros de `statusBaixa`, `statusIntegracaoRm`, `tipoExecucaoPagamento` não fazem sentido para RM pendentes — quando algum desses estiver ≠ `all`, **não** incluir o UNION.
- Filtros de data (`dataInicio`/`dataFim`) aplicam ao `created_at` da RM também.

### C) `src/components/tabs/ReportsTab.tsx`
- No `mappedVouchers`, garantir `valor: v.valor != null ? Number(v.valor) : null` (defesa em profundidade).
- Sem outras mudanças — os 3 SelectItems novos (A Processar / Ajustes) já estão presentes.

---

## Verificação
1. Após edição, exportar como Excel via UI: confirmar que coluna Valor mostra números corretos e linha TOTAL soma.
2. Filtrar etapa = "A Processar" → exportar → conferir que vouchers RM aparecem.
3. Filtrar etapa = "Todas" → todos (t_vouchers + RM pendentes) aparecem.
4. Conferir visualmente larguras (sem quebras feias).

Sem mudanças no PDF.
