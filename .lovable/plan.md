# Bloqueio de avanço Financeiro→Robô para vouchers manuais sem integração RM

## Regra de negócio
Vouchers criados manualmente que vão **direto para o Financeiro** (regra atual: "contabilização com fiscal = CLIENTE/Não") devem:

1. Aparecer normalmente na etapa **FINANCEIRO**.
2. Exibir **alerta visual** indicando que a integração com o RM ainda não foi concluída.
3. **Bloquear** o botão "Baixar e enviar para Robô" enquanto não houver registro completo em `dados_dachser.t_dados_financeiro_voucher` (mesmo critério já aplicado no Fiscal — match por `nd = numero_spo`, todos os campos principais preenchidos).
4. **NÃO inserir** em `t_dados_rm` no momento da criação (hoje ocorre dentro de `CreateVoucherDialog` quando `etapaAtual === "FINANCEIRO"`). A inserção em `t_dados_rm` só pode acontecer no `handleBaixar` do Financeiro, depois que a integração com RM estiver pronta — o que já é exigido pela checagem.

## Mudanças técnicas

### 1. `src/components/esteira/CreateVoucherDialog.tsx` (linhas ~685-705)
Hoje insere em `t_dados_rm` sempre que o voucher entra direto em FINANCEIRO. Acrescentar condição: pular essa inserção quando o voucher é entrada manual (`entryMode !== "rm" || !idRM`). Justificativa: voucher recém-criado manualmente nunca tem registro em `t_dados_financeiro_voucher`, portanto não deve aparecer em `t_dados_rm` ainda.

### 2. `src/components/esteira/VoucherFinanceiroActions.tsx`
- Novo `useEffect` (ou `useState` + `useEffect`) que, se `voucher.origemCriacao === "MANUAL"`, chama `mariadb-proxy` action `check_voucher_rm_ready` (já existente — implementada na conversa anterior) e armazena `{ ready, missingFields }` em estado local.
- Adicionar **bloco de alerta amber/destructive** no topo do componente (antes do checklist de prontidão), visível apenas quando `origemCriacao === "MANUAL"` e `rmReady === false`:
  > "Integração com RM pendente. Este voucher manual ainda não possui registro completo em `t_dados_financeiro_voucher`. Aguarde a sincronização antes de baixar. Campos faltantes: …"
- Em `handleBaixar`, antes do envio para `insert_dados_rm` / `update_voucher_esteira`, refazer a checagem (defesa em profundidade) e abortar com `toast` destrutivo se `ready === false`. Mensagem padrão alinhada com o Fiscal.
- Botão "Baixar e enviar para Robô" deve ficar **desabilitado** quando manual e `rmReady === false` (mantendo o gate `isProntoParaRobo` atual com lógica AND).

### 3. Backend
Nenhuma alteração — action `check_voucher_rm_ready` já existe em `supabase/functions/mariadb-proxy/index.ts`.

## Comportamento por tipo de voucher
| Origem | Etapa entrada | Inserção em t_dados_rm | Avanço Financeiro→Robô |
|---|---|---|---|
| RM (vinculado a id_rm) | FISCAL ou FINANCEIRO | Imediata na criação (se direto FIN) | Liberado |
| MANUAL (CLIENTE/sem fiscal) | FINANCEIRO | **Não insere** na criação; inserção ocorre no `handleBaixar` quando integração concluída | **Bloqueado** até integração RM completa |
| MANUAL (DACHSER/com fiscal) | FISCAL → FINANCEIRO | Inserido no Fiscal (`insertDadosRmOnFinanceiro`) somente após `check_voucher_rm_ready` aprovar | Já bloqueado no Fiscal |

## Fora de escopo
- Sem alteração de schema.
- Sem alteração no fluxo Robo/Supervisor/Operação.
- Sem mexer na lógica de FORNECEDORES_SEM_FISCAL nem em vouchers urgentes.
