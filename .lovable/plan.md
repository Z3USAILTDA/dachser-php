
# Correcao: `allHeaders` nao declarado causa fallback para extrator legado

## Causa raiz

O `xlsxExtractor.ts` usa a variavel `allHeaders` nas linhas 316 e 463, mas ela nunca foi declarada com `let`. Isso causa um `ReferenceError: allHeaders is not defined` que faz o pipeline estruturado falhar silenciosamente.

O sistema entao cai no pipeline legado (que usa `simpleXlsxReader.ts` do `maritimo-analyze`), e esse extrator antigo ainda le da coluna HS Code. Por isso nenhuma das mudancas no `xlsxExtractor.ts` teve efeito.

Evidencia nos logs:
```
❌ [Structured Pipeline] XLSX extraction failed: ReferenceError: allHeaders is not defined
    at extractXlsxStructured (xlsxExtractor.ts:407)
⚠️ [Pipeline] Structured pipeline failed, falling back to legacy LLM
```

## Mudanca (1 arquivo, 1 linha)

### Arquivo: `supabase/functions/sea-submit-analysis/xlsxExtractor.ts`

Adicionar declaracao de `allHeaders` logo apos a linha 282 (antes do loop de sheets):

```
Adicionar entre as linhas 283-284:
  let allHeaders: string[] = [];
```

Isso e suficiente: a variavel ja e populada na linha 316 e usada na linha 463. Com essa correcao, o pipeline estruturado vai funcionar e usar a logica correta (NCM apenas da coluna NCM, aceitar 4/6/8 digitos).

## Nenhuma outra mudanca necessaria

A logica de extracao ja esta correta:
- Linha 227: filtro aceita 4/6/8 digitos
- Linha 360: le apenas de `colMap.ncm`

O unico problema era o crash que impedia essa logica de rodar.

Deploy automatico do edge function apos a alteracao.
