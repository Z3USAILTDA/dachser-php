# Bloqueio de avanço do Fiscal para vouchers manuais sem integração RM

## Regra de negócio
Vouchers criados manualmente (origem `MANUAL`) já entram normalmente na etapa **FISCAL**. Porém, ao tentar avançar para a próxima etapa (FINANCEIRO ou SUPERVISOR), o sistema deve **bloquear** se ainda não existir um registro completo em `dados_dachser.t_dados_financeiro_voucher` correspondente — ou seja, enquanto a integração com o RM não tiver sido concluída.

Critério de match: `t_dados_financeiro_voucher.nd = voucher.numero_spo`.

Campos que devem estar **NÃO NULOS / NÃO VAZIOS** no registro encontrado:
`documento, nd, numero_nf, numero_processo, modal, tipo_pag, forma_pag, data_emissao, data_vencimento, valor_nf, cnpj, razao_social`.

Vouchers que NÃO são manuais (Robo, Master, etc.) seguem o fluxo atual sem checagem adicional.

## Comportamento na UI
Quando o Fiscal clicar em **"Aprovar e Enviar para Financeiro"** em um voucher manual:
- Frontend chama uma nova ação backend `check_voucher_rm_ready` antes do `update_voucher_esteira`.
- Se faltar registro ou campos: exibir toast destrutivo:
  > "A integração com o RM não foi concluída para o voucher [SPO]. Aguarde a sincronização com o RM antes de aprovar. Campos faltantes: [lista]."
- Não altera etapa, não grava log de aprovação.
- Se OK: segue exatamente o fluxo atual (incluindo roteamento AJUSTE_FISCAL→solicitante e `insertDadosRmOnFinanceiro`).

A devolução para Operação (`Devolver`) **não** é bloqueada — Fiscal sempre pode devolver.

## Mudanças técnicas

### 1. `supabase/functions/mariadb-proxy/index.ts`
Nova action `check_voucher_rm_ready`:
```sql
SELECT documento, nd, numero_nf, numero_processo, modal, tipo_pag,
       forma_pag, data_emissao, data_vencimento, valor_nf, cnpj, razao_social
FROM dados_dachser.t_dados_financeiro_voucher
WHERE nd COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
LIMIT 1
```
Resposta:
```ts
{ ready: boolean, found: boolean, missingFields: string[] }
```
Considera campo "faltante" quando `null`, `''`, ou (para `valor_nf`) `0`.

### 2. `src/components/esteira/VoucherFiscalActions.tsx`
Em `handleAprovar`, antes do `update_voucher_esteira`:
- Detectar se é voucher manual via `voucher.origemCriacao === "MANUAL"` (preservando exceção de master e do fluxo `AJUSTE_FISCAL` que apenas devolve ao solicitante — neste caso aplicar a mesma checagem).
- Invocar `check_voucher_rm_ready` com `numero_spo`.
- Se `ready === false`: `toast` destrutivo com mensagem padrão + lista de campos, `return`.
- Se `ready === true`: segue fluxo atual.

Nenhuma outra alteração de UI; nenhum novo componente.

## Fora de escopo
- Nenhuma migração de schema (somente leitura de tabela existente).
- Nenhuma alteração no fluxo Robo/Supervisor/Operação.
- Nenhuma alteração no critério de exibição do voucher na esteira (continua aparecendo no Fiscal normalmente).
