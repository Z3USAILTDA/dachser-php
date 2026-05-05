## Reescrever texto do alerta com a redação proposta

Substituir título e descrição do `VoucherDivergenceAlert` pela versão clara solicitada.

### Edit
**`src/utils/voucherDivergence.ts`** — remover o cálculo de `irmaosInfo`/contagens usadas no texto e substituir por título e descrição fixos:

- **Título:** `Atenção à divergência no preenchimento do SPO Master`
- **Descrição:** `Este voucher apresenta uma configuração diferente dos demais itens do mesmo grupo. Enquanto os outros estão marcados para passar pelo Fiscal ("Sim"), este está marcado como "Não" (envio direto ao Financeiro). Como o sistema exige que todos os vouchers de um SPO Master sigam o mesmo fluxo, solicite a revisão do preenchimento.`

`siblings`, `spoBase`, `rule` e `etapaSugerida` permanecem inalterados. Sem mudanças em outras telas, backend ou memória.