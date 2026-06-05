# Ajustes na Esteira de Vouchers

Duas correções pontuais, sem refatorações estruturais.

## 1) Busca de ND lenta — especialmente com ND completo

**Onde:** `supabase/functions/mariadb-proxy/index.ts`, action `search_vouchers_including_concluded` (linhas 17503-17569).

**Problema:** quando o usuário digita o ND completo (ex.: `12345/2025`), a busca continua demorando porque:
- A query usa `LIKE '%termo%'` em 5 colunas → nenhum índice é usado, mesmo com termo exato;
- O `LEFT JOIN` agrupa **toda** a `t_dados_financeiro_voucher` (`GROUP BY nd`) antes de filtrar pelo termo;
- 3 subqueries correlacionadas em `t_voucher_logs` são executadas para cada linha.

**O que mudar (cirúrgico):**

1. **Detectar "termo completo"** no início da action:
   ```ts
   const looksLikeFullNd = /^[A-Z0-9._\-\/]+$/i.test(rawTerm) && rawTerm.length >= 4;
   const exactNd = looksLikeFullNd ? rawTerm.split(' ')[0] : null;
   ```

2. **Caminho rápido (exato):** quando `exactNd` está presente, rodar primeiro uma query indexada usando igualdade em `SUBSTRING_INDEX(numero_spo,' ',1)` e `SUBSTRING_INDEX(nd,' ',1)` (subselect dfv já pré-filtrado pelo ND exato). Se retornar linhas, devolve direto. Senão, cai para o LIKE.

3. **Pré-filtrar a subconsulta `dfv`** mesmo no caminho LIKE: aplicar `WHERE nd LIKE ? OR numero_processo LIKE ?` **dentro** do subselect antes do `GROUP BY`, eliminando o agrupamento da tabela inteira.

4. **Manter as subqueries de `t_voucher_logs`** (necessárias para exibição) — o ganho vem de chegarem em um conjunto já pequeno.

**Não muda:** assinatura da action, payload de retorno, hook frontend, debounce de 450 ms.

## 2) Filtro de mês não respeitado em etapas ativas

**Onde:** `supabase/functions/mariadb-proxy/index.ts`, action `get_vouchers_combined` (linhas 17409-17416).

**Problema:** o `ativosMonthClause` mantém **todas** as etapas ativas sempre visíveis, ignorando o mês selecionado. Isso polui a tela com processos antigos.

**O que mudar (cirúrgico):**
- Apenas **OPERACAO, RASCUNHO e FINANCEIRO** continuam visíveis independente do mês. Todas as demais etapas (incluindo `A_PROCESSAR`) passam a respeitar o filtro:
  ```sql
  AND (
    v.etapa_atual IN ('RASCUNHO','OPERACAO','FINANCEIRO')
    OR (dfv.data_emissao >= ? AND dfv.data_emissao < ?)
    OR (dfv.data_emissao IS NULL
        AND v.data_emissao_documento >= ? AND v.data_emissao_documento < ?)
  )
  ```
- Etapas `FISCAL`, `SUPERVISOR`, `AJUSTE_OPERACAO`, `AJUSTE_FISCAL`, `PRE_LANCAMENTO`, `CANCELADO`, `ROBO` e `A_PROCESSAR` passam a respeitar o mês via `data_emissao`/`data_emissao_documento`.
- **`get_vouchers_pendentes_rm`** já filtra por mês — os cards virtuais A_PROCESSAR vindos do RM continuam aparecendo apenas dentro do mês selecionado (comportamento já correto).

**Não muda:**
- Frontend, hooks, layout, ou qualquer outra etapa do fluxo.
- Regra de retenção 24 h para `CONCLUIDO`/`CANCELADO`.

## Validação

1. **ND completo:** digitar `12345/2025` → resultado em < 1 s (contra os ~5-10 s atuais).
2. **ND parcial:** digitar `1234` → continua funcionando (cai no caminho LIKE otimizado).
3. **Filtro mês:**
   - OPERACAO, RASCUNHO, FINANCEIRO → aparecem em qualquer mês selecionado.
   - FISCAL, SUPERVISOR, ROBO, AJUSTE_*, A_PROCESSAR → só aparecem quando `data_emissao` cai no mês.

## Deploy

Redeploy de `mariadb-proxy` após as alterações.
