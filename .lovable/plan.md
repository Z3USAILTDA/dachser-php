## Ajustes na Esteira de Vouchers

### 1. Moeda — Select fixo + flag "moeda estrangeira" + Badge

**Formulário (Criar / Editar / Master):**
- Mantém o **select fixo atual** (BRL / USD / EUR).
- Adiciona ao lado um **checkbox** `Moeda estrangeira (não especificada)`.
  - Quando marcado: o select de moeda é desabilitado e o valor persistido vira `XXX` (ISO 4217 reservado para "sem moeda específica").
  - Quando desmarcado: usa a moeda escolhida no select normalmente.
- Quando a moeda final ≠ BRL (USD, EUR ou XXX), o formulário exibe automaticamente o campo `Valor Pago (BRL)` (opcional na criação; obrigatório na Baixa).

**Persistência (MariaDB):**
- Coluna `moeda` (já existe) aceita `BRL`, `USD`, `EUR`, `XXX`.
- Migration adicionando em `dados_dachser.t_vouchers`: `valor_pago_brl DECIMAL(15,2) NULL`.
- Atualizar actions do `mariadb-proxy`: `import_voucher_from_rm`, `create_voucher`, `create_voucher_master`, `update_voucher_esteira`, `register_baixa`, `get_voucher_by_id` para gravar/ler `valor_pago_brl` e aceitar `XXX`.

**Badge `MoedaBadge` (novo componente):**
- `moeda === 'BRL'` → não renderiza nada.
- `moeda === 'XXX'` (flag de moeda estrangeira marcado) → badge gold/warning com **apenas o ícone `Globe`**, tooltip `"Moeda estrangeira"`.
- `moeda ∈ {USD, EUR}` → badge gold/warning com **apenas o código** (`USD` ou `EUR`), sem ícone, sem texto adicional.
- Renderizado **ao lado do `Nº SPO`** em todos os pontos:
  - `EsteiraVoucherDetails` (header) e `VoucherDetailsView`
  - `VoucherTable` (lista principal)
  - `PagamentosTab`, `ComprovantesTab`, `HistoricoBaixasTab`, `BacklogTab`, `RoboTab`
  - `EsteiraDashboard`
  - `VoucherMasterForm` (filhos selecionados)
  - Templates de e-mail (Supervisor/cliente) — texto `[USD]` / `[Moeda estrangeira]` ao lado do SPO

**Ajustes nos totais (PagamentosTab):**
- Linha do voucher: continua usando `Intl.NumberFormat` com `currency: pag.moeda` quando moeda ∈ {BRL, USD, EUR}; para `XXX`, exibe apenas o número formatado sem símbolo, com badge ao lado.
- Cards de totais e soma de selecionados: somam `valor_pago_brl ?? valor` apenas quando `moeda === 'BRL'`, ou `valor_pago_brl` quando definido (qualquer moeda). Vouchers em moeda ≠ BRL sem `valor_pago_brl` ficam fora do total e aparecem em indicador adicional "X em moeda estrangeira".
- `HistoricoBaixasTab`: coluna adicional `Valor Pago (BRL)` quando `moeda !== 'BRL'`.

### 2. Voucher Master vai direto para a próxima etapa

Em `mariadb-proxy/index.ts` action `create_voucher_master` (linha ~13320), substituir o hard-coded `'OPERACAO'` pela mesma regra usada no import em lote (linha ~19633):

```text
URGENCIA_TIPO = 'URGENTE_REAL'      -> SUPERVISOR
COBRANCA_EM_NOME_DE = 'CLIENTE'     -> FINANCEIRO
caso contrário                       -> FISCAL
```

Usar `urgencia_tipo` herdado do filho de referência + `cobranca_em_nome_de` do form. Adicionar registro em `t_voucher_logs` indicando a etapa de destino.

### 3. Edição unificada (sem modal de salvar)

#### 3a. Tela de Detalhes — `VoucherDetailsView.tsx`
- Remover dependência do `EditVoucherDialog` para edição interna.
- Cada `InfoItem` vira célula editável quando `etapaAtual ∈ {A_PROCESSAR, OPERACAO, AJUSTE_OPERACAO}` e o usuário tem permissão.
- Espelhar **todos** os campos do `CreateVoucherDialog` (Dados do Voucher/SPO, Forma de Pagamento, Filial, Tipo Documento, Cobrança em Nome de, Urgência, Origem do Processo, Chave PIX, Comentários, Moeda + flag estrangeira + Valor Pago BRL). Campos hoje ausentes ganham linha nova nas seções correspondentes.
- **Autosave por campo (onBlur)** via novo hook `useVoucherInlineSave(voucherId)`:
  - Chama `mariadb-proxy.update_voucher_esteira` apenas com o campo alterado.
  - Toast discreto + revalida com `loadVoucher()`.
  - Indicador inline (spinner → check) ao lado do campo.
- Sem botões "Editar"/"Salvar" no fluxo interno.

#### 3b. Tela inicial — modal `EditVoucherDialog`
- Permanece existindo (acesso pelo menu de ações da lista).
- Refatorar conteúdo para **espelhar 1:1** os campos e validações do `CreateVoucherDialog` (mesmas seções, select de moeda fixo + checkbox `Moeda estrangeira`, Valor Pago BRL, Origem do Processo, Chave PIX, Comentários, etc.).
- Mantém botão Salvar (modal pontual da lista).

### 4. Criar a partir do RM — Valor bloqueado

Em `CreateVoucherDialog.tsx` (`FormField name="valor"`, linha ~1162):
- `disabled={isRmMode && rmDataLoaded && rmData.valor != null}`.
- Mesmo tratamento para `Moeda` e checkbox `Moeda estrangeira` (vêm do RM).
- Ícone de cadeado + tooltip "Valor obtido do RM — não editável".

---

### Arquivos a alterar

- `supabase/migrations/<novo>.sql` — coluna `valor_pago_brl`.
- `supabase/functions/mariadb-proxy/index.ts` — actions citadas + roteamento do master + aceitar `XXX`.
- `src/types/voucher.ts` — `valorPagoBrl?: number`; tipo `Moeda` inclui `'XXX'`.
- `src/components/esteira/CreateVoucherDialog.tsx`, `EditVoucherDialog.tsx`, `VoucherMasterForm.tsx`, `VoucherDetailsView.tsx`, `HistoricoBaixasTab.tsx`, `PagamentosTab.tsx`, `ComprovantesTab.tsx`, `BacklogTab.tsx`, `RoboTab.tsx`.
- `src/components/esteira/MoedaBadge.tsx` (novo).
- `src/components/voucher/VoucherTable.tsx`, `src/components/voucher/VoucherDetailsView.tsx`.
- `src/pages/esteira/EsteiraVoucherDetails.tsx`, `EsteiraDashboard.tsx`.
- `src/hooks/useVoucherInlineSave.ts` (novo).

### Não vou alterar

- Lógica de SLA / roteamento de etapas existente (apenas reuso da regra do batch import).
- Anexos / pagamentos / robô (matching, parser, baixa).
- RLS (mantém permissivo).