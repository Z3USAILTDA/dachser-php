

## Plano: Exigir gate-out para gerar pré-fatura

### Problema
A edge function `demurrage-auto-invoice` gera pré-faturas para qualquer container com free time excedido (`excedente_dias > 0`), mesmo que o container ainda não tenha passado pelo evento de gate-out. Isso resulta em pré-faturas prematuras.

### Alteração

**Arquivo:** `supabase/functions/demurrage-auto-invoice/index.ts`

Adicionar filtro `data_gate_out IS NOT NULL` na query SQL principal (linha 87-99) que seleciona os containers elegíveis:

```sql
WHERE active = 1 
  AND risk_status IN ('exceeded', 'critical')
  AND excedente_dias > 0
  AND (pre_invoice_number IS NULL OR pre_invoice_number = '')
  AND data_gate_out IS NOT NULL   -- NOVO: só fatura após gate-out
```

Também adicionar `data_gate_out` ao SELECT e ao interface `Container` para log/auditoria, e incluir um contador `skipped_no_gate_out` nos resultados.

### Resultado
- Containers sem gate-out registrado não terão pré-fatura gerada
- Containers que já passaram pelo gate-out continuam sendo faturados normalmente
- O log mostrará quantos containers foram ignorados por falta de gate-out

