## Problema

Na análise CHB do item 124, a linha **"Valor Total Frete"** aparece como 🟨 Alerta mesmo com valores idênticos entre documentos:
- Coluna A: `EUR 220,00`
- Coluna B: `220,00 EUR`

Numericamente iguais (220.00 EUR em ambos), apenas com posição diferente da sigla da moeda.

## Causa raiz

Em `supabase/functions/analyze-chb-documents/index.ts`, a função `applyDivergenceStatusOverrides` (linha 1774) é **unidirecional**:

```ts
const newStatus = cells[0].replace(/✅/g, '🟨').replace(/Conforme/gi, 'Alerta');
```

Ela só promove Conforme→Alerta quando `checkDivergence` retorna `true`. Não existe caminho reverso: quando o LLM marca a linha como Alerta mas os valores normalizados batem, a marcação permanece incorreta.

## Plano de correção (cirúrgico)

Editar **apenas** `supabase/functions/analyze-chb-documents/index.ts` na função `applyDivergenceStatusOverrides` (linhas ~1786–1804):

1. Após coletar `docValues` e antes do `return row`, calcular `isDivergent = checkDivergence(docValues, spec.type)`.
2. Manter o comportamento atual quando `isDivergent === true` (Conforme→Alerta).
3. **Adicionar caminho reverso**: quando `isDivergent === false` E `docValues.length >= 2` E a célula de status atual contém `🟨` ou `Alerta`, rebaixar para `✅ Conforme`:
   - `cells[0].replace(/🟨/g, '✅').replace(/Alerta/gi, 'Conforme')`
4. Limitar o rebaixamento aos campos numéricos/texto já listados em `fieldSpecs` (Peso Bruto, Peso Líquido, Valor Mercadoria, Valor Total Frete, NCM, Incoterm, CNPJ Consignee) — não afeta outras linhas que o LLM marcou como Alerta por motivo diferente (ex.: campo ausente).
5. **Salvaguarda**: só rebaixar se TODAS as colunas de documento na linha tiverem valor preenchido (sem `ND`/`—`/`-`). Se houver valor ausente, manter Alerta — a divergência "presente vs ausente" é legítima.
6. Redeploy de `analyze-chb-documents`.

## Validação

Rodar nova análise no item 124 e confirmar que a linha "Valor Total Frete" com `EUR 220,00` / `220,00 EUR` aparece como ✅ Conforme. Confirmar que linhas com valores realmente diferentes (>1% ou >R$ 1) continuam como Alerta.

## Escopo

Nenhuma mudança no prompt do LLM, no banco, ou em outros arquivos. Apenas ~6 linhas adicionadas em `applyDivergenceStatusOverrides`.
