## Plano

1. **Fortalecer a correção determinística do frete total**
  - Ajustar a função que lê o OCR do CCT/AWB para capturar a linha final `Total` mesmo quando o texto vem em tabela desalinhada ou com colunas `Pré-pago` / `A Cobrar`.
  - Priorizar sempre o maior/último valor da linha `Total` da seção `Totais na moeda de origem`.
  - Bloquear explicitamente `Por Peso`, `Por Valor`, `Impostos` e `Outros Serviços` como origem de `Valor Total Frete`.
2. **Corrigir a contaminação do campo Peso Bruto**
  - Adicionar pós-processamento para o documento `extrato-conhecimento-AUL246698` e similares: se `Peso Bruto` receber valor com moeda (`EUR`, `USD`, `BRL`, `R$`) ou valor igual ao frete total, substituir pelo peso real da linha explícita de peso bruto/Gross Weight no OCR.
  - Garantir que valores monetários nunca sejam gravados como `peso_bruto` no cache extraído.
3. **Corrigir o HTML e o cache persistido**
  - Aplicar a correção antes de salvar `resultHtml` e antes de executar `parseExtractedFields`, para que a tabela exibida e os dados persistidos fiquem consistentes.
  - Melhorar `parseExtractedFields` para não aceitar moeda em campos de peso.
4. **Validar a função**
  - Fazer checagem estática com busca direcionada para confirmar que a correção está no fluxo principal.
  - Implantar a função `analyze-chb-documents` após a alteração para que a próxima análise use a regra corrigida.

## Resultado esperado

Na nova análise, o documento `EXTRATO-CONHECIMENTO-AUL246698...` não deve mais colocar `EUR 220,00` em `Peso Bruto`, e `Valor Total Frete` deve usar o `Total` (`EUR 220,00`) em vez de `Por Peso` (`EUR 25,00`).