## Problema

No AWB/HAWB em **português** (estrutura "Totais na moeda de origem"), o LLM está capturando a linha **"Por Peso"** (EUR 25,00 — frete parcial) em vez da linha **"Total"** do rodapé (EUR 220,00 — frete + impostos + outros serviços).

A causa é que a Seção 14B do prompt em `supabase/functions/analyze-chb-documents/index.ts` só ensina os rótulos em inglês (Weight Charge, Total Collect, Total Prepaid). Quando o AWB é emitido em português, o LLM não reconhece a linha "Total" como equivalente a "Total Collect" e acaba usando "Por Peso" como fallback.

## Mudança (cirúrgica, só prompt)

Arquivo: `supabase/functions/analyze-chb-documents/index.ts`, Seção 14B (linhas ~869-898).

Adicionar mapeamento explícito da estrutura de charges em **português** (AWB BR), reforçando que apenas a linha **"Total"** do rodapé da coluna Prepaid/Collect deve ser usada:

```
ESTRUTURA EM PORTUGUÊS (AWB/HAWB BR — "Totais na moeda de origem"):
  | Linha                              | Prepaid | Collect |
  | Por Peso                           |    -    |  25,00  | ← PARCIAL, NÃO USAR
  | Por Valor                          |    -    |    -    | ← PARCIAL, NÃO USAR
  | Impostos                           |    -    |    -    | ← PARCIAL, NÃO USAR
  | Outros Serviços (Agente de Carga)  |    -    |    -    | ← PARCIAL, NÃO USAR
  | Outros Serviços (Transportador)    |    -    |    -    | ← PARCIAL, NÃO USAR
  | Total                              |    -    | 220,00  | ✅ USAR ESTE VALOR

MAPEAMENTO PT → EN:
  • "Por Peso"                          ≡ Weight Charge        (parcial)
  • "Por Valor"                         ≡ Valuation Charge     (parcial)
  • "Impostos"                          ≡ Tax                  (parcial)
  • "Outros Serviços (Agente de Carga)" ≡ Other Charges Agent  (parcial)
  • "Outros Serviços (Transportador)"   ≡ Other Charges Carrier(parcial)
  • "Total" (rodapé)                    ≡ Total Prepaid / Total Collect ✅
```

Adicionar à regra crítica:
- ❌ ERRADO: pegar "Por Peso" / "Por Valor" / "Impostos" como Valor Total Frete
- ✅ CORRETO: sempre a linha **"Total"** do rodapé da coluna Prepaid ou Collect (consolidado)

## Fora de escopo
- UI, schema, pós-processamento, regex fallback, regras de validação Incoterm × Prepaid/Collect.

## Validação
Após editar, rodar nova conferência no processo atual (AWB com "Por Peso = 25" e "Total = 220") e confirmar que `Valor Total Frete` agora retorna **EUR 220,00**.
