
## Reanálise

Você selecionou **"Não"** ao criar o voucher 20261652603, mas ele foi para o Fiscal. Isso significa que o problema **não é o default** — é um bug na lógica de roteamento ou na persistência do campo.

Preciso confirmar a causa raiz antes de aplicar o fix. As hipóteses são:

1. **O valor "Não" não está sendo persistido** no banco (envia `DACHSER` mesmo quando o usuário escolhe `CLIENTE`).
2. **O voucher foi criado via outro fluxo** (ex.: criação automática via robô / master) que ignora a escolha do form.
3. **A lógica de roteamento em `VoucherRascunhoActions.handleEnviar`** está lendo o campo errado ou com fallback para `DACHSER`.

## Plano

### 1. Diagnosticar (consulta direta no MariaDB via mariadb-proxy)

Verificar no voucher 20261652603:
- Valor real de `cobranca_em_nome_de` na `t_voucher_esteira`
- Logs em `t_voucher_esteira_logs` (quem criou, quando foi enviado, transições de etapa)
- Se foi criado como master/child ou voucher simples

### 2. Corrigir o voucher 20261652603

- `UPDATE t_voucher_esteira SET cobranca_em_nome_de='CLIENTE', etapa_atual='FINANCEIRO', status_envio_cliente='AGUARDANDO_CLIENTE' WHERE numero_spo='20261652603'`
- Inserir log `ETAPA_CORRIGIDA` (Fiscal → Financeiro, motivo: bug de roteamento)
- Disparar `insertDadosRmOnFinanceiro` para garantir entrada na `t_dados_rm`

### 3. Corrigir o bug raiz (depende do diagnóstico)

Possíveis fixes em ordem de probabilidade:

**a) Persistência incorreta no `CreateVoucherDialog.tsx`**
Verificar se o payload enviado ao `mariadb-proxy` (action `create_voucher_esteira`) inclui corretamente `cobranca_em_nome_de: formData.cobrancaEmNomeDe` e não está sendo sobrescrito.

**b) Fallback indevido no edge function `mariadb-proxy`**
Inspecionar a action `create_voucher_esteira` para garantir que não há `|| 'DACHSER'` no insert.

**c) Lógica de roteamento em `VoucherRascunhoActions.tsx` (linhas 235-242)**
Já está correta (`CLIENTE → FINANCEIRO`), mas pode haver um caso onde o campo é lido de forma stale (do prop `voucher` em vez de re-fetch após o update).

### 4. Manter o default "Sim" no form

Já que o problema **não é** o default, vou **manter** a pré-seleção "Sim" como você pediu antes. Apenas corrijo o bug que ignora a escolha do usuário.

## Detalhes técnicos

- O diagnóstico exige modo default (chamada à edge function `mariadb-proxy` para `read_query`).
- Se o bug estiver na persistência, o fix será 1-2 linhas em `CreateVoucherDialog.tsx` ou na edge function.
- Se estiver no roteamento, o fix será em `VoucherRascunhoActions.tsx` (re-fetch antes de decidir etapa).
- Nenhuma mudança em UI, badges, exports ou schema.
