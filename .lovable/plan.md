

# Remover ícones "i" (Info) das companhias aéreas

## Problema

Na coluna de status da tabela, AWBs que começam com "577" exibem um ícone azul "i" com tooltip "Rastreio feito por API direta com a companhia." — o usuário quer remover isso.

## Correção — `src/pages/Index.tsx`

### Remover bloco do ícone Info (linhas 2860-2871)

Deletar o bloco condicional `{awb.awb?.startsWith("577") && (...)}` que renderiza o `<TooltipProvider>` com o ícone `<Info>`.

Uma mudança, um arquivo.

