## Objetivo
Reenviar para `t_dados_rm` os dados dos vouchers/SPOs abaixo, que já passaram pela esteira mas não tiveram inserção (ou tiveram inserção incompleta) na tabela:

- 101-292879 DIM-BY
- 101-292880 DIM-BY
- 101-292882 DIM-BY
- 101-292883 DIM-BY
- 101-292884 DIM-BY
- 101-292885 DIM-BY
- 20261566966
- 20262479047
- 20262479046

## Abordagem
Operação única de "replay" do `insert_dados_rm` usando como fonte de verdade `t_vouchers` (mesmo padrão já consolidado no fallback existente em `mariadb-proxy/index.ts`). **Sem mudança de schema, sem mudança de fluxo, sem alterações no front-end.**

### Passos

1. **Criar action `replay_dados_rm`** em `supabase/functions/mariadb-proxy/index.ts` (no mesmo arquivo, ao lado de `insert_dados_rm`):
   - Recebe `{ identifiers: string[] }` (aceita `numero_spo` ou `id_rm` ou `processo_id`).
   - Para cada identificador:
     - `SELECT` em `t_vouchers` (busca por `numero_spo`/`id_rm`/`processo_id` com `COLLATE utf8mb4_unicode_ci`) trazendo: `id_rm`, `numero_spo`, `forma_pagamento`, `fornecedor`, `cnpj_fornecedor`, `linha_digitavel`, `codigo_barras`, `chave_pix`, `tipo_execucao_pagamento`.
     - Verifica em `t_dados_rm` se já existe registro para esse `id_rm`/`nd` — se existir, pula (log) ou regrava (a definir abaixo).
     - Reaproveita a lógica interna de `insert_dados_rm` (boleto/PIX, regra `regras_forma_pag` por banco/Itaú, fallback de boleto/pix em `t_vouchers`).
   - Retorna `{ processed: [...], skipped: [...], errors: [...] }`.

2. **Política para registros já existentes em `t_dados_rm`**: por padrão **NÃO sobrescreve** (apenas insere quando não existe), para não quebrar ajustes manuais que você já fez. A action aceita `force: true` para re-inserir mesmo assim (não usaremos agora).

3. **Executar a action 1 vez** via `supabase--curl_edge_functions` com a lista dos 9 identificadores acima.

4. **Validar** com `SELECT id_rm, nd, forma_pag, voucher_boleto, chave_pix FROM t_dados_rm WHERE id_rm IN (...) OR nd IN (...)` para confirmar todos presentes e com dados corretos.

5. **Reportar** o resultado: lista de processados, pulados (já existiam) e erros (com motivo).

### Detalhes técnicos
- Reaproveita 100% da lógica atual de `insert_dados_rm` (regras de banco, boleto, PIX). Nenhuma duplicação real — fatoramos um helper interno `_doInsertDadosRm(payload)` chamado tanto pela action original quanto pela nova.
- Sem alteração no `voucherRmSync.ts` nem no front. É operação one-off via curl.
- Logs explícitos com prefixo `[replay_dados_rm]` para auditoria.

### Memória
Sem nova memória — a regra já está documentada em `vouchers/insert-dados-rm-fallback.md`. A action `replay_dados_rm` fica como ferramenta administrativa para casos pontuais futuros.