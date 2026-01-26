

# Plano: Adicionar Regra de Agregação de Peso Bruto por Item na Packlist

## Problema Identificado

O prompt de análise CHB tem regras para peso bruto/líquido nas linhas 599-615, mas **não possui instrução explícita** para:
- Somar os pesos brutos individuais por item quando a Packlist apresenta valores itemizados
- Reportar o total agregado na tabela de comparação

### Comportamento Atual
Quando a Packlist contém:
```text
Item 1: Peso Bruto 50 kg
Item 2: Peso Bruto 30 kg  
Item 3: Peso Bruto 21,5 kg
```

O LLM pode:
- Ignorar os valores e marcar "ND"
- Extrair apenas um valor aleatório
- Não somar para obter o total (101,5 kg)

### Comportamento Esperado
O LLM deve:
1. Identificar que a Packlist tem pesos por item
2. Somar todos os pesos brutos itemizados
3. Reportar o **total agregado** (101,5 kg) na coluna da Packlist
4. Comparar esse total com o peso bruto de outros documentos (CCT, HAWB, Invoice)

## Solução

Adicionar uma **regra explícita de agregação** na seção "5) Regras de PESO" do prompt, logo após a linha 614.

## Alteração Técnica

### Arquivo: `supabase/functions/analyze-chb-documents/index.ts`

**Localização**: Após a linha 614 (dentro da seção de regras de peso)

**Nova regra a ser adicionada**:

```text
   ⚠️ REGRA CRÍTICA — AGREGAÇÃO DE PESO EM PACKING LIST:
   Documentos de Packing List frequentemente apresentam PESO POR ITEM em vez de um total único.
   
   QUANDO IDENTIFICAR PESO ITEMIZADO NA PACKLIST:
   1. Localize TODOS os valores de "Gross Weight" / "Peso Bruto" por linha/item
   2. SOME todos os valores para obter o PESO BRUTO TOTAL
   3. Use o TOTAL SOMADO na coluna da Packlist para comparação
   4. Na seção Observações, indicar: "Peso Bruto na PL calculado a partir da soma de X itens"
   
   EXEMPLO:
   Packlist contém:
   - Item 001: Gross 10,5 kg
   - Item 002: Gross 25,0 kg  
   - Item 003: Gross 15,0 kg
   
   → Coluna "packlist.pdf" para campo "Peso Bruto" = "50,5" (soma: 10,5 + 25,0 + 15,0)
   → Comparar esse total com CCT, HAWB, etc.
   
   MESMA REGRA APLICA PARA:
   - Peso Líquido (Net Weight) por item → somar para total
   - Quantidade de volumes por item → somar para total
   - Valor por item → somar para valor total
   
   ⚠️ NÃO AGREGAR QUANDO:
   - Documento já apresenta linha "Total" ou "Grand Total" explícita
   - Nesse caso, usar o valor total explícito do documento
```

## Resumo

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/analyze-chb-documents/index.ts` | Adicionar regra de agregação de peso por item na seção 5) Regras de PESO (após linha 614) |

## Resultado Esperado

- O LLM irá identificar quando a Packlist tem pesos itemizados
- Somará automaticamente os valores por item
- Usará o total para comparação com outros documentos
- Reduzirá erros de "ND" em campos de peso da Packlist
- Permitirá comparação correta entre Packlist × CCT × HAWB

