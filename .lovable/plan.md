## Ajuste no parser e no merge da importação em lote (SPO)

Atualizar `supabase/functions/mariadb-proxy/index.ts` (bloco do `preview_voucher_batch_import`) para refletir o de‑para da planilha do CHB e dar **prioridade absoluta à planilha** nos campos abaixo, ignorando o que existir em `t_dados_financeiro_voucher` (DFV).

### 1) `parseSheetRow` (linhas ~18240-18286)

- **Valor** → ler de `Valor solicitado` (manter aliases atuais: `Valor Solicitação`/`Valor`/`Valor NF`).
- **Vencimento** → ler de `Data vencimento` (manter `Vencimento`).
- **Tipo de documento** → ler de `Tipo de documento` (já suportado).
- **Forma de pagamento** → ler de `Forma pagto` e mapear códigos curtos:
  - `B` → `BOLETO`
  - `T` → `TRANSFERENCIA`
  - manter os atuais (`BOLETO`, `PIX`, `TRANSFERENCIA`, etc.) para retrocompatibilidade.
- **Necessita fiscal** → ler de `Fiscal` e aceitar:
  - `S` → `DACHSER` (Sim — Fiscal)
  - `N` → `CLIENTE` (Não — Cliente)
  - manter os atuais (`SIM`/`NAO`/`DACHSER`/`CLIENTE`).
- **Origem do processo** → forçar sempre `CHB`, ignorando o que vier (ou ausência) na planilha.

### 2) `mergeWithDfv` (linhas ~18353-18414) — prioridade da planilha

Para os campos abaixo, **NÃO** aplicar o `pick(sheet, dfv)` atual: usar diretamente o valor da planilha (mesmo que o DFV tenha valor diferente) e marcar `field_origin` como `PLANILHA`:

- `valor`
- `vencimento`
- `tipo_documento`
- `forma_pagamento`
- `cobranca_em_nome_de` (já é só da planilha; mantém)
- `origem_processo` (sempre `CHB` da planilha)

Demais campos (`processo`, `cnpj_fornecedor`, `data_emissao`, `filial`, `moeda`, `fornecedor`) mantêm o comportamento atual (DFV preenche quando planilha está vazia; `fornecedor` continua vindo do DFV).

### Escopo / não escopo

- Apenas o bloco do batch import em `mariadb-proxy/index.ts` (`parseSheetRow`, `FORMA_MAP`/aliases e `mergeWithDfv`).
- Sem mudanças no frontend, no schema ou em outras rotas.
- Validações posteriores e promoção de etapa permanecem iguais.

### Arquivos

- `supabase/functions/mariadb-proxy/index.ts` (linhas ~18197-18414).
