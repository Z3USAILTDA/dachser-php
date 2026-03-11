

## Correção: Filtro de etapa não funciona para usuário Operacional

### Problema
O `roleFilteredVouchers` (linha 1196-1201) filtra rigidamente os vouchers para usuários OPERACAO, mostrando apenas processos em `OPERACAO` e `A_PROCESSAR`. Essa filtragem ocorre **antes** do filtro de etapa da UI ser aplicado. Quando o usuário seleciona "Fiscal" no filtro, o resultado é vazio porque os vouchers fiscais já foram removidos.

### Solução
Alterar a lógica de `roleFilteredVouchers` para que, quando o usuário OPERACAO aplicar um filtro de etapa específico (diferente de "all"), o filtro de role não restrinja — permitindo que o `filterVouchers` subsequente cuide da filtragem por etapa. A visão padrão (sem filtro) continua mostrando apenas OPERACAO + A_PROCESSAR.

### Arquivo: `src/pages/esteira/EsteiraIndex.tsx` (linhas 1196-1202)

Alterar de:
```typescript
if (isOperacao) {
  return vouchers.filter(v => 
    v.etapaAtual === "OPERACAO" ||
    v.etapaAtual === "A_PROCESSAR"
  );
}
```

Para:
```typescript
if (isOperacao) {
  // If user has selected a specific etapa filter, show all vouchers (filter will be applied later)
  if (filters.etapa && filters.etapa !== "all") {
    return vouchers;
  }
  // Default view: only OPERACAO and A_PROCESSAR
  return vouchers.filter(v => 
    v.etapaAtual === "OPERACAO" ||
    v.etapaAtual === "A_PROCESSAR"
  );
}
```

Aplicar a mesma lógica para os demais roles (FISCAL, SUPERVISOR) para consistência — quando um filtro de etapa específico é selecionado, todos os vouchers ficam visíveis para aquele role.

