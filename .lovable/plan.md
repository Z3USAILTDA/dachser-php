## Régua de Cobrança / Disputa

### 1. Excel exportado da Disputa (`src/utils/disputaExcelExport.ts`)
- Renomear a coluna `"Documento/NF"` para `"ND"`.
- Trocar o valor de `r.nf || r.nd || "-"` por `r.nd || "-"` (segundonumero vindo de `t_dados_financeiro_contas_receber` / view CR — `nd` já é retornado por `get_disputas` e `get_disputas_cr`).
- Garantir que a coluna `Valor (R$)` saia como número formatado em moeda real (já está com `numFmt '"R$"#,##0.00'` — confirmar que `Number(r.valor) || 0` é passado como número e não string). Ajustar o `t: 'n'` na célula para forçar tipo numérico em todas as linhas, igualando o comportamento da linha de Total Valor.

Sem mudanças em backend (campo `nd` já é retornado pelas duas actions).

---

## Olimpo de Cobrança

### 2. Tabela "Brazil Customer Aging Overview" — incluir disputas com indicativo visual
- **Backend (`mariadb-proxy/index.ts`)** — nas actions `get_aging_overview_cr` e `get_aging_by_client_cr`:
  - Remover o `NOT EXISTS (... t_fin_disputas ...)` do `WHERE`, para que faturas em disputa voltem a entrar nos buckets de aging.
  - Adicionar, em paralelo aos `SUM(... valor_nf ...)` por bucket, um `SUM(CASE WHEN <em_disputa> AND <bucket> THEN valor_nf ELSE 0 END) AS disp_<bucket>` e um `disp_total` por linha (product/cliente). O sinal de "em disputa" é o `EXISTS` já usado em `get_client_faturas_cr`.
- **Frontend (`OlimpoCobranca.tsx`)**:
  - Estender o tipo `AgingRow` com `disp_not_due`, `disp_30`, ..., `disp_366_plus`, `disp_total`.
  - Em cada célula de bucket da tabela, quando `disp_<bucket> > 0`, renderizar um pequeno badge/ponto laranja ao lado do valor (Tooltip: "Inclui R$ X em disputa") usando token `text-warning` / `bg-warning`. Sem alterar o número exibido (continua somando tudo).
  - Mesma marcação no totalizador `Total Overdue` quando `disp_total > 0`.

### 3. Remover linha "Bad Debts (> 365)" da tabela visível
- `OlimpoCobranca.tsx`, bloco em `~ linha 820-825`: remover o `<tr>` "Bad Debts summary row". Não mexer no card separado "Bad Debts — Score Rating & Provisão" mais abaixo nem na coluna `aging_366_plus`.

### 4. Detalhamento por CNPJ — valor em disputa no Sheet (`ClientDetailSheet.tsx`)
- **Backend `get_client_cnpj_detail_cr`**: adicionar à query agregada por CNPJ um `SUM(CASE WHEN <em_disputa> THEN t.valor_nf ELSE 0 END) AS disputa_total` e `SUM(CASE WHEN <em_disputa> THEN 1 ELSE 0 END) AS disputa_count`. Adicionar nova action `get_client_cnpj_disputas_cr({ cnpj })` que devolve `[{ nd, numero_nf, valor_nf, data_vencimento }]` filtrando por CNPJ + disputa ativa (mesmo predicado).
- **Frontend `ClientDetailSheet.tsx`**:
  - No bloco de cada CNPJ, quando `cnpj.disputa_total > 0`, mostrar linha: `Em disputa: R$ X (Y faturas)` com um botão "Ver" que abre um `Collapsible` listando ND, NF, valor e vencimento (lazy fetch via `get_client_cnpj_disputas_cr`).
  - Estilizar com token `text-warning` para não criar variante de cor nova.

### 5. Faturas Detalhadas — coluna "Modal" + filtro (`ClientDetailSheet.tsx`)
- Adicionar coluna **Modal** após **ND** (`f.modal` já vem de `get_client_faturas_cr`).
- Adicionar `<Input>` de filtro acima/junto ao cabeçalho da coluna Modal, no padrão usado nos outros filtros do projeto (case-insensitive `includes`). Como a tabela é paginada por backend, o filtro precisa ir como parâmetro:
  - Backend `get_client_faturas_cr`: aceitar `modalFilter?: string` e aplicar `AND t.modal LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci` quando definido (tanto no SELECT quanto no COUNT).
  - Frontend: estado `modalFilter`, debounce de 300ms, reset para `page=1` ao alterar.

### 6. Excel de relatório (`OlimpoCobranca.tsx > handleExportExcel`, aba "Analítico de Clientes")
- **Ordenação**: ordenar `analiticoResp.data` antes do loop por vencidos primeiro (`dias_vencimento DESC`, com `>0` antes de `<=0`). Implementar `rows.sort((a,b)=> (b.dias_vencimento||0) - (a.dias_vencimento||0))`.
- **Nova coluna "Email"** ao final da linha de cabeçalho/dados:
  - Backend `get_aging_analitico_cr`: fazer `LEFT JOIN LATERAL` (ou subquery correlacionada) em `ai_agente.t_cobranca_email_log` (mesma tabela usada por `get_olimpo_email_logs_by_cnpj`) pegando o último envio por `cnpj_clean`, devolvendo `last_email_status` (`enviado` / `falha` / `nao_enviado`) e `last_email_error`.
  - Frontend: adicionar cabeçalho "Email" e gravar valor no formato `Enviado` / `Falha: <mensagem curta>` / `Não enviado`. Ajustar `ws2["!cols"]` e o range de loop `c <= 22` em vez de `c <= 21`, mais a linha de TOTAL (deixar coluna vazia para Email no total).

---

## Técnico
- Validar `ai_agente.t_cobranca_email_log` nome real da tabela de log (action existente `get_olimpo_email_logs_by_cnpj` já usa — reaproveitar mesmo SQL).
- Manter regra `COLLATE utf8mb4_unicode_ci` em todos os novos JOINs/LIKE para evitar erro de collation conhecido.
- Não alterar `t_fin_disputas`, `v_fin_regua_contas_receber` nem `t_financeiro_soft_delete` — apenas leituras adicionais.
- Tudo dentro do escopo Olimpo + Disputa, sem refatoração estrutural (regra "surgical implementation").

## Validação
1. Disputa: gerar Excel — coluna passa a ser `ND` e mostra o `nd` da NF; valor é célula numérica formatada em R$.
2. Olimpo Aging (Product/Client): valor de uma fatura em disputa volta a aparecer no bucket correto, com indicador visual ao lado.
3. Tabela não exibe mais a linha "Bad Debts (> 365)".
4. Sheet de CNPJ mostra "Em disputa: R$ X (N faturas)" e o detalhe lista os NDs corretos.
5. Faturas Detalhadas mostra coluna Modal e o filtro reduz a paginação no backend.
6. Excel de relatório: linhas ordenadas por vencidos primeiro; coluna Email preenchida conforme último log.
