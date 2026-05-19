# Fase 2B — regua-send-aging migrado para v_fin_regua_contas_receber (revisado)

## Escopo
Alterar **apenas** `supabase/functions/regua-send-aging/index.ts`. Nenhum outro arquivo é tocado (UI, mariadb-proxy, regua-send-emails, endpoints _cr, disputas, Olimpo, layout, textos, permissões, rotas, buckets).

## Problema atual
Endpoint retorna 500 com `SQL syntax error near ') AND COALESCE(sd.active, 1) = 1 AND NOT EXISTS ...`. Causa raiz: tabela antiga `t_dados_financeiro_nfs` vazia → resolução de CNPJs devolve lista vazia → segundo SELECT monta `cnpj IN ()`.

## Mudanças

### 1. Fonte de dados
Substituir queries de `dados_dachser.t_dados_financeiro_nfs` por `dados_dachser.v_fin_regua_contas_receber` (alias `t`). Remover `LEFT JOIN t_dados_nfs` — a view já expõe `processo`, `master`, `house`.

### 2. Campos canônicos (mapeados em `InvoiceRow`)
- `documento` → `t.documento`
- `nd` → `t.nd`
- `referencia_cliente` → `t.ref_cliente`
- `numero_nf` → `t.numero_nf`
- `modal`, `tipo_documento` → idem
- `data_emissao`/`data_vencimento` → `DATE_FORMAT(..., '%d/%m/%Y')`
- **`valor_nf` → `t.valor_nf`** (que na view = `valorpendentebaixa`; valor principal do Aging)
- `razao_social`, `cnpj` → idem
- `numero_processo` → `t.processo`
- `house`, `master` → idem
- `status_fatura` = `'Em atraso'` (constante)
- `responsavel` = `'Financeiro'` (constante)

Não usar `valororiginal` nem `valorliquido` como valor principal.

### 3. Filtros (substituem antigos)
```sql
WHERE DATEDIFF(CURDATE(), t.data_vencimento) >= 1
  AND NOT EXISTS (
    SELECT 1 FROM ai_agente.t_financeiro_soft_delete sd
    WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
      AND sd.active = 0
  )
```
Remover: `LEFT JOIN tbaixas`, `NOT EXISTS (... tbaixas ...)`, `(t.disputa IS NULL OR t.disputa = 0)`, `COALESCE(sd.active,1) = 1`.

### 4. Normalização de CNPJ no SQL (ajuste obrigatório 1)
A view pode conter CNPJ com máscara. Toda comparação `IN (?)` deve usar a forma normalizada nos **dois lados**:

```sql
REPLACE(REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-',''),' ','') IN (?, ?, ...)
```
Os parâmetros enviados ao MariaDB são **somente dígitos** (já normalizados no Deno via `c.replace(/\D/g,'')`).

Aplica-se a:
- Query de busca de faturas
- Qualquer query auxiliar que filtre por CNPJ

### 5. Resolução de CNPJs (com proteção contra `IN ()`)

Fluxo:
1. Ler payload (`cnpj`, `cnpjs`, `razao_base`, `razao_bases`, `cliente`, `email_to`, `custom_text`).
2. **Log sanitizado (ajuste obrigatório 2)** — nunca logar `custom_text` completo nem lista de destinatários. Logar apenas:
   - `mode: razao_base | cnpj`
   - `cliente`
   - `cnpjs_recebidos: N`
   - `razao_bases_recebidas: N`
   - `email_to_informado: sim/não`
   - `custom_text_informado: sim/não`
3. Se `razao_bases`/`razao_base` informados:
   ```sql
   SELECT DISTINCT REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') AS cnpj
   FROM dados_dachser.v_fin_regua_contas_receber
   WHERE SUBSTRING_INDEX(razao_social, ' - ', 1) IN (?, ?, ...)
   ```
   Retorna CNPJs já normalizados.
4. Senão se `cnpjs`/`cnpj`: normalizar dígitos no Deno antes de usar.
5. **Guard rail**: se `allCnpjs.length === 0`, devolver `200`:
   ```json
   { "success": false, "error": "Nenhum CNPJ encontrado para gerar o Aging List." }
   ```
   Nunca emitir SQL com `IN ()`.
6. Log após resolução: `cnpjs_resolvidos: N`.

### 6. Busca de faturas
```sql
SELECT t.documento, COALESCE(t.nd,'') AS nd, COALESCE(t.ref_cliente,'') AS referencia_cliente,
       COALESCE(NULLIF(t.numero_nf,''),'') AS numero_nf, COALESCE(t.modal,'') AS modal,
       t.tipo_documento,
       DATE_FORMAT(t.data_emissao,'%d/%m/%Y') AS data_emissao,
       DATE_FORMAT(t.data_vencimento,'%d/%m/%Y') AS data_vencimento,
       t.valor_nf, t.razao_social, t.cnpj,
       COALESCE(t.processo,'') AS numero_processo,
       COALESCE(t.house,'')    AS house,
       COALESCE(t.master,'')   AS master,
       'Em atraso' AS status_fatura, 'Financeiro' AS responsavel
FROM dados_dachser.v_fin_regua_contas_receber t
WHERE REPLACE(REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-',''),' ','') IN (?, ?, ...)
  AND DATEDIFF(CURDATE(), t.data_vencimento) >= 1
  AND NOT EXISTS (
    SELECT 1 FROM ai_agente.t_financeiro_soft_delete sd
    WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
      AND sd.active = 0
  )
ORDER BY t.cnpj, t.data_vencimento ASC
```
Logs: `titulos_encontrados: N`, `valor_total: R$ X`.

Se `invoices.length === 0`, retornar `200`:
```json
{ "success": false, "error": "Nenhum título vencido encontrado para este cliente." }
```

### 7. Não alterado
- Geração XLSX (`createSheetForCnpj`, estilos, headers, merges)
- Template HTML do e-mail, rodapé legal, remetente, parse de destinatários, fallback `devs@z3us.ai`
- Log em `ai_agente.t_regua_email_log` após envio
- Erro de conexão (503 vs 500), `connectWithRetry`
- Envio via Resend
- Frontend (`ReguaCobranca.tsx` continua chamando `regua-send-aging` igual)

## Validação após deploy (ajuste obrigatório 3 — somente e-mail interno)

Via `supabase--curl_edge_functions` POST `regua-send-aging`:

1. **Teste positivo**: `{ razao_base: "AGCO DO BRASIL SOLUCOES AGRICOLAS LTDA", cliente: "AGCO", email_to: "devs@z3us.ai" }`
   - Status 200, sem SQL syntax error
   - `cnpjs_resolvidos > 0`, `titulos_encontrados > 0`
   - Excel gerado, Resend id presente
2. **Teste negativo (razao_base inexistente)**: `{ razao_base: "ZZZ-INEXISTENTE", cliente: "X", email_to: "devs@z3us.ai" }`
   - 200 com `{ success:false, error:"Nenhum CNPJ encontrado..." }`
3. **Teste negativo (CNPJ sem títulos vencidos)**: CNPJ válido sem títulos atrasados
   - 200 com `{ success:false, error:"Nenhum título vencido..." }`
4. **Logs sanitizados**: confirmar que `custom_text` e lista de destinatários NÃO aparecem nos logs.
5. **Inalterados**: `mariadb-proxy`, `regua-send-emails`, `/fin/regua` permanecem como estão.

Nunca usar e-mail real de cliente nos testes desta fase.

## Rollback
Reverter o único arquivo alterado para a versão anterior.
