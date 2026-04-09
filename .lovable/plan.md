

## Plano: Diferenciar erro de extração vs. boleto não anexado

### Problema
Na aba de Pagamentos, quando a forma de pagamento é BOLETO e não há `linha_digitavel`, o badge mostra genericamente "Erro Extração". Porém, o problema real pode ser que nenhum arquivo de boleto foi anexado — informação diferente e mais acionável.

### Solução

**1. Backend — `mariadb-proxy/index.ts` (action `list_pagamentos`)**
- Adicionar subquery na consulta SQL para verificar se existe um anexo do tipo BOLETO/BOLETO_INSTRUCOES:
```sql
(SELECT COUNT(*) FROM dados_dachser.t_voucher_anexos a 
 WHERE a.voucher_id = v.id AND a.tipo IN ('BOLETO', 'BOLETO_INSTRUCOES')) AS has_boleto_anexo
```

**2. Frontend — `PagamentosTab.tsx`**
- Adicionar `has_boleto_anexo` na interface `PagamentoItem`
- Alterar o badge na linha 966-969 para:
  - Se `isBoleto && !linha_digitavel && !has_boleto_anexo` → Badge **"Boleto não anexado"** (laranja/warning)
  - Se `isBoleto && !linha_digitavel && has_boleto_anexo` → Badge **"Erro Extração"** (vermelho, como já está)

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | Adicionar `has_boleto_anexo` na query `list_pagamentos` |
| `src/components/esteira/PagamentosTab.tsx` | Interface + lógica condicional do badge |

