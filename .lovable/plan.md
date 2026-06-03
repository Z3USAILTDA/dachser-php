## Problemas

Na análise CHB exibida em `/chb/conferences/115`:

1. `Valor Total Frete` mostra `EUR 25,00 (Por Peso)` — pega valor parcial e ainda vaza a origem entre parênteses.
2. `Peso Bruto` do `extrato-conhecimento-AUL246698` aparece como `ND`.
3. `Peso Bruto` `7,0 kg` vs `6,7 kg` marcado como **Conforme**.

## Diretriz

Nunca preencher com `ND` quando a correção encontrar um valor inconsistente — sempre **procurar o valor real no OCR do próprio documento** antes de devolver à célula. Só manter o valor anterior se realmente não houver evidência alguma no OCR.

## Plano (somente `supabase/functions/analyze-chb-documents/index.ts`)

### 1. Frete consolidado correto e sem anotação de fonte

- Ampliar `extractAwbPortugueseTotalFreight` para:
  - Capturar `Total`, `Total Geral`, `Totais na moeda de origem`, `Total Prepaid`, `Total Collect` (linha final consolidada).
  - Casar rótulo e valor em janela de até 2 linhas (quando o número vem na linha seguinte).
  - Ignorar componentes parciais (`Por Peso`, `Por Valor`, `Impostos`, `Outros Serviços`).
- Em `applyAwbPortugueseTotalFreightCorrection`:
  - Se a célula vier com `(Por Peso)`, `(Por Valor)`, `(Impostos)`, `(Outros)` ou qualquer anotação parcial entre parênteses → **buscar o total real no OCR** e substituir pelo valor consolidado. Se ainda assim o OCR não tiver um total consolidado, usar a maior soma dos componentes monetários da seção `Totais na moeda de origem` (`Por Peso + Por Valor + Impostos + Outros`).
  - Sempre remover anotações entre parênteses (`(Por Peso)`, `(Total Collect)` etc.) das células de `Valor Total Frete`, `Peso Bruto`, `Peso Líquido` e `Valor Mercadoria`, mantendo apenas o número + moeda/unidade.
- Fortalecer `findColumnIndex` para casar headers truncados (`EXTRATO-CONHECIMENTO-AUL246698…`) com nome de arquivo: normalizar removendo `…`, espaços, extensão; usar prefixo de 15 chars e inclusão recíproca.

### 2. Peso Bruto real do `extrato-conhecimento-AUL246698`

- Ampliar `extractAwbGrossWeight` para reconhecer múltiplos rótulos:
  - `Peso Bruto`, `Peso Bruto Total`, `P. Bruto`, `PB`, `Gross Weight`, `Gross Wt`, `GW`, `Weight (kg)` em blocos após `Cargo Description`/`Mercadoria`.
  - Aceitar valor em **linha separada** (varredura de até 2 linhas abaixo do rótulo).
  - Aceitar unidades `kg`, `kgs`, `quilos`, ou sem unidade (assumindo kg quando o documento já estiver em contexto AWB).
- Quando a coluna do documento tiver `Peso Bruto = ND` ou contiver valor monetário, **substituir pelo valor real extraído do OCR daquele documento** (não usar `ND` como fallback). Só manter o valor original se o OCR realmente não retornar nada.

### 3. Detecção determinística de divergência entre colunas

- Após aplicar as correções acima, varrer as linhas críticas (`Peso Bruto`, `Peso Líquido`, `Valor Mercadoria`, `Valor Total Frete`, `NCM`, `Incoterm`, `CNPJ Consignee`) e comparar valores não vazios entre colunas:
  - Pesos (`kg`): divergência se diferença relativa > 2% (ex.: 7,0 vs 6,7 ≈ 4,3% → alerta).
  - Monetários: divergência se diferença absoluta > 1,00 ou relativa > 1%.
  - Texto (Incoterm/NCM/CNPJ): divergência se valores normalizados forem diferentes.
- Quando houver divergência, trocar o ícone da coluna `STATUS` daquela linha de `✅` para `🟨` (Alerta). Recontar `criticalCount`/`warningCount`/`okCount` para atualizar tags e summary — garantindo que essa substituição aconteça **antes** da 2ª passada `extractHtmlAndTags`.

### 4. Deploy e validação

- Redeployar `analyze-chb-documents`.
- Rodar nova análise no item 115 e validar:
  - `Valor Total Frete` da coluna OERLIKON exibe `EUR 220,00` (sem `(Total Collect)`) e a coluna `EXTRATO-CONHECIMENTO-AUL246698` exibe o total real extraído do OCR (sem `(Por Peso)`).
  - `Peso Bruto` do `EXTRATO-CONHECIMENTO-AUL246698` aparece com o peso real lido do PDF.
  - Linha `Peso Bruto` com `7,0 kg` vs `6,7 kg` exibe badge **Alerta**.

## Resultado esperado

Nenhum campo é zerado para `ND` quando o OCR contém a informação; anotações de fonte entre parênteses desaparecem das células; valores divergentes entre documentos nunca são marcados como Conforme.
