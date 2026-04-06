

## Plano: Corrigir coluna "VALOR" / "TOTAL EM ATRASO" no Excel do Aging

### Problema

A célula do "TOTAL EM ATRASO" exibe `############` porque a largura da coluna K (índice 10) está definida como `wch: 14`, insuficiente para o valor formatado com prefixo "R$ " em fonte bold tamanho 12.

### Solução

**Arquivo: `supabase/functions/regua-send-aging/index.ts`** — linha 265

Aumentar a largura da coluna de índice 10 (VALOR) de `14` para `22`:

```
// Antes (linha 265):
{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 28 }, { wch: 14 },

// Depois:
{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 28 }, { wch: 22 },
```

Mudança de 1 número. Nenhum outro arquivo alterado.

