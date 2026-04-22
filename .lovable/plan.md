

## Diagnóstico
Na tela `/fin/esteira` aba **Pagamentos**, o dropdown "Tipo Exec." aparece em branco (placeholder "Pendente") em linhas onde o usuário definiu **Remessa 10h** ou **Remessa 15h**, mesmo após o toast "Tipo de execução atualizado" confirmar o salvamento. Linhas com "MANUAL" e "Pendente" funcionam normalmente.

## Causa raiz
`supabase/functions/mariadb-proxy/index.ts` linhas 9376–9387 (action `set_tipo_execucao_pagamento`) faz um **mapeamento destrutivo** ao salvar:

```ts
const tipoExecMap = {
  'MANUAL': 'MANUAL',
  'REMESSA_10H': 'REMESSA',  // ← perde o "10H"
  'REMESSA_15H': 'REMESSA',  // ← perde o "15H"
  'A_DEFINIR': 'A_DEFINIR',
};
```

O usuário escolhe `REMESSA_10H` no `<Select>`, mas o banco grava apenas `'REMESSA'`. No próximo `loadPagamentos`, o `<Select value="REMESSA">` (linha 1061) **não encontra** nenhum `<SelectItem>` com esse valor (as opções são `A_DEFINIR | MANUAL | REMESSA_10H | REMESSA_15H`) → Radix renderiza o placeholder vazio.

A coluna `tipo_execucao_pagamento` em `t_vouchers` já é `VARCHAR(50)` (alterada na linha 9179 de `list_pagamentos`), portanto **aceita `REMESSA_10H`/`REMESSA_15H` direto** — o mapeamento legado vem de quando a coluna era ENUM antigo (`'MANUAL','REMESSA','TED','PIX'`) e ficou para trás.

Confirmações cruzadas:
- Filtro do header (`list_pagamentos`, linhas 9237–9247) e cards de stats (linhas 9327, 9333) já consultam `IN ('REMESSA_10H','REMESSA_15H')`, ou seja, o resto do sistema **espera** os subtipos preservados — só o setter está corrompendo.
- `batch_set_tipo_execucao` (linhas 9479–9502) **não aplica o map** — salva o valor cru, então a versão em lote já funciona corretamente. A inconsistência entre os dois setters reforça o bug no individual.
- `voucherRmSync.ts` envia `tipo_exec: voucher.tipoExecucaoPagamento || "A_DEFINIR"` para `t_dados_rm` (RM externo) — esse fluxo continua funcionando porque `'REMESSA_10H'`/`'REMESSA_15H'` é uma string aceita lá.

## Correção (cirúrgica)

### 1. `supabase/functions/mariadb-proxy/index.ts` — action `set_tipo_execucao_pagamento` (linhas 9362–9392)
Remover o `tipoExecMap` destrutivo. Salvar o valor cru recebido do frontend (igual ao `batch_set_tipo_execucao`), validando contra a lista permitida:

```ts
const ALLOWED = new Set(['A_DEFINIR', 'MANUAL', 'REMESSA_10H', 'REMESSA_15H']);
if (!ALLOWED.has(tipo_execucao_pagamento)) {
  return new Response(
    JSON.stringify({ error: `tipo_execucao_pagamento inválido: ${tipo_execucao_pagamento}` }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

await client.execute(
  `UPDATE dados_dachser.t_vouchers 
   SET tipo_execucao_pagamento = ?, updated_at = NOW() 
   WHERE id = ?`,
  [tipo_execucao_pagamento, voucherId]
);
```

### 2. Migração one-shot dos vouchers já corrompidos
Executar no MariaDB via action existente para corrigir registros que foram salvos como `'REMESSA'` puro (sem subtipo). Como não temos histórico de qual era o original, usar `REMESSA_15H` como default (regra padrão de remessa do dia útil — alinhar com usuário antes de rodar):

```sql
UPDATE dados_dachser.t_vouchers
SET tipo_execucao_pagamento = 'REMESSA_15H'
WHERE tipo_execucao_pagamento = 'REMESSA';
```

Posso fazer isso via uma action ad-hoc temporária ou um script `code--exec` chamando a edge function. Confirmar com usuário qual subtipo usar como fallback.

### 3. Memória persistente
Atualizar `mem://vouchers/integration-rm-mapping-rules-v4`:
> "A coluna `tipo_execucao_pagamento` em `t_vouchers` armazena o subtipo exato (`REMESSA_10H` ou `REMESSA_15H`). A tradução para a string genérica `'REMESSA'` ocorre **apenas** no consumo (filtros de relatório, downstream `t_dados_rm`), nunca no setter — caso contrário o `<Select>` da UI perde o casamento de valor."

## Arquivos alterados
- `supabase/functions/mariadb-proxy/index.ts` — substituir bloco de map por validação simples (~10 linhas).
- Memória `mem://vouchers/integration-rm-mapping-rules-v4` — atualização.
- Migração one-shot de dados (após confirmação do fallback `REMESSA_10H` vs `REMESSA_15H`).

## Validação pós-deploy
1. Recarregar `/fin/esteira` → aba **Pagamentos**.
2. Selecionar "Remessa 10h" em qualquer linha → toast aparece → recarregar a página → o select deve **continuar mostrando "Remessa 10h"**.
3. Repetir com "Remessa 15h" e "Manual".
4. Conferir os cards do topo: "Em Remessa" e "Prontos Remessa" devem manter contagens corretas (usam `IN ('REMESSA_10H','REMESSA_15H')` — já compatível).
5. Filtro de header "Todos Tipo..." → "Remessa 10h" deve listar apenas as linhas correspondentes.

## Riscos e mitigações
- **Linhas históricas com `'REMESSA'` puro**: tratadas pela migração one-shot do passo 2.
- **Downstream RM (`voucherRmSync`)**: já envia o valor cru — `'REMESSA_10H'` é string aceita; sem regressão.
- **Sem alteração no schema**: a coluna já é `VARCHAR(50)`, suporta os novos valores nativamente.

