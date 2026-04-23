
## Ajuste no fluxo pós-aprovação do Supervisor

Hoje, quando um voucher **URGENTE_REAL** é aprovado pelo Supervisor (via UI ou e-mail), ele vai automaticamente para **FINANCEIRO**, ignorando a escolha de "Necessita Fiscal?". A nova regra é: após aprovação, respeitar a escolha:

- **Sim** (`DACHSER`) → **FISCAL**
- **Não** (`CLIENTE`) → **FINANCEIRO**

A flag `urgencia_tipo = URGENTE_REAL` continua gravada (badges e filtros preservados).

## Arquivos a alterar

### 1. `supabase/functions/supervisor-email-action/index.ts`
No bloco de aprovação (`action === "approve"`), buscar o voucher antes do update e decidir:
- Se `cobranca_em_nome_de === 'CLIENTE'` → `etapa_atual: "FINANCEIRO"` + dispara `insert_dados_rm` (mantém comportamento atual)
- Se `cobranca_em_nome_de === 'DACHSER'` → `etapa_atual: "FISCAL"` + **não** dispara `insert_dados_rm` (será disparado quando sair do Fiscal)
- Ajustar `toStage` no e-mail de confirmação `URGENCIA_APROVADA` conforme o destino real.

### 2. `src/components/esteira/VoucherSupervisorActions.tsx` (ou equivalente que executa aprovação na UI)
Localizar o handler `handleAprovar` e aplicar a mesma matriz:
- `CLIENTE` → `FINANCEIRO` (chamar `insertDadosRmOnFinanceiro`)
- `DACHSER` → `FISCAL`

### 3. Rejeição — sem mudança
Rejeição continua devolvendo para `AJUSTE_OPERACAO`, independentemente do "Necessita Fiscal".

## O que NÃO muda

- Roteamento na criação/envio (já corrigido nas mudanças anteriores).
- Badges `URGENTE_REAL`, filtros, exports, schema.
- Fluxo de e-mails (templates, links, validação de token).
- Rejeição pelo Supervisor.

## Detalhes técnicos

- 2 arquivos, ~10 linhas alteradas.
- Edge function `supervisor-email-action` faz fetch via `get_voucher_for_rm` (já existe) para ler `cobranca_em_nome_de` antes de decidir a etapa.
- Vouchers urgentes já aprovados e em `FINANCEIRO` permanecem onde estão; a regra só afeta novas aprovações.
