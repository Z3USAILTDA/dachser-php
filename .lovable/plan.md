

## Plano: Automatizar Status Financeiro e Status Baixa

### Novos valores de status

**Status Financeiro** (atual: PENDENTE, APROVADO, REJEITADO, BAIXADO):
- `PENDENTE` → Estado inicial
- `PROCESSADO` → Quando marcado como pronto (enviado ao Robô)
- `CONCLUIDO` → Quando comprovante é anexado e processado

**Status Baixa** (atual: PENDENTE, BAIXA_MANUAL, BAIXA_REMESSA, BAIXADO_RM):
- `PENDENTE` → Estado inicial
- `BAIXA_SOLICITADA` → Quando comprovante é anexado
- `REALIZADA` → Quando na tbaixas existe a baixa correspondente ao numero_spo
- Manter `BAIXA_MANUAL` e `BAIXA_REMESSA` para compatibilidade

### Pontos de transição no código

| Momento | Status Financeiro | Status Baixa |
|---------|------------------|--------------|
| Criação do voucher | PENDENTE | PENDENTE |
| Financeiro envia ao Robô (`VoucherFinanceiroActions`) | **PROCESSADO** | mantém tipo definido (BAIXA_MANUAL/REMESSA) |
| Comprovante anexado/salvo (`VoucherRoboActions` + `RoboTab`) | **CONCLUIDO** | **BAIXA_SOLICITADA** |
| Baixa confirmada na tbaixas (cron ou integração RM) | CONCLUIDO | **REALIZADA** |

### Arquivos a alterar

1. **`src/types/voucher.ts`** — Atualizar tipos `StatusBaixa` e `StatusFinanceiro`

2. **`src/components/esteira/VoucherFinanceiroActions.tsx`** (~linha 107) — Ao enviar para ROBO, setar `status_financeiro: "PROCESSADO"`

3. **`src/components/esteira/VoucherRoboActions.tsx`** (~linha 263) — Ao salvar comprovante, setar `status_baixa: "BAIXA_SOLICITADA"` e `status_financeiro: "CONCLUIDO"`

4. **`src/components/tabs/RoboTab.tsx`** (~linha 322) — Ao anexar comprovante pelo robô automático, setar `status_baixa: "BAIXA_SOLICITADA"` e `status_financeiro: "CONCLUIDO"`

5. **`supabase/functions/voucher-integrate-rm/index.ts`** (~linha 464) — Ao confirmar baixa no RM, setar `status_baixa: "REALIZADA"` em vez de `BAIXADO_RM`

6. **`supabase/functions/voucher-mariadb-setup/index.ts`** — Atualizar ENUMs (referência, já que a coluna é VARCHAR no MariaDB real)

7. **`supabase/functions/mariadb-proxy/index.ts`** — Atualizar ALTER da coluna `status_baixa` para aceitar os novos valores

8. **Badges/UI** — Atualizar `StatusComprovanteBadge`, filtros em `EsteiraReports` e `ReportsTab` para refletir novos valores

9. **`src/components/esteira/FaturasDoDiaTab.tsx`** — Atualizar referências de `BAIXADO_RM` para `REALIZADA`

10. **Verificação automática de tbaixas** — Criar/atualizar lógica (cron ou na consulta do robô) que checa se o `numero_spo` do voucher existe na `tbaixas` e, se sim, atualiza `status_baixa` para `REALIZADA`

### Compatibilidade
- Vouchers existentes com `BAIXADO_RM` continuarão funcionando (tratados como equivalente a `REALIZADA` onde necessário)
- A coluna `status_baixa` já é VARCHAR no MariaDB real, então aceita os novos valores sem ALTER

