

## Plano: Forçar discrepância para AWB 045-13300630

### Contexto
A timeline do mariadb-proxy detecta discrepância de peças (11 vs 50) para este AWB, mas o `fetch-status-aereo` não a detecta porque o filtro de ETD-5 dias ou a lógica de resolução por delivery a suprime. O mecanismo `force_discrepancy` já existe no código de aplicação de overrides (linhas 2574-2579).

### Ações

1. **Atualizar tipo do MANUAL_OVERRIDES** em `supabase/functions/fetch-status-aereo/index.ts` (linha 1457):
   - Adicionar `force_discrepancy?: boolean` e `force_baseline_pieces?: number` ao tipo Record

2. **Adicionar entrada de override** para `045-13300630` no objeto MANUAL_OVERRIDES:
   - `force_discrepancy: true`
   - `force_baseline_pieces: 50` (valor máximo da discrepância — 50 peças no booking original vs 11 nas atuais)

3. **Re-deploy** da edge function para aplicar a mudança em produção

### Resultado
- A tabela principal exibirá o badge de "Discrepância Peças" para este AWB
- O AWB aparecerá no card Crítico
- A timeline continuará mostrando o alerta normalmente

