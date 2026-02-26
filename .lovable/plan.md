

## Correcao: 4 Problemas no Resultado da Analise Manifest x HBL

### Problemas Identificados

Analisei o resultado que voce compartilhou e identifiquei 4 problemas distintos:

**Problema 1: Peso total errado (4,038 kg em vez de 11,291 kg)**

O codigo em `index.ts` (linha 1305) calcula `reference_weight_kg` assim:
```text
weighed_weight > 0 ? weighed_weight : gross_weight
```
Muitos itens tem `weighed_weight_kg = 0` (nao foram pesados ainda), mas o total somado (4,038 kg) e maior que 0, entao o sistema usa esse valor parcial. O correto seria usar `gross_weight_kg` (11,291 kg) quando a pesagem esta incompleta.

**Correcao**: Verificar se a maioria dos exportadores tem `weighed_weight_kg = 0`. Se mais de 30% dos itens tem peso aferido = 0, usar `gross_weight_kg` para todos (total e por exportador). So usar `weighed_weight_kg` quando a pesagem esta substancialmente completa.

**Problema 2: Comparacoes por item ainda aparecendo com "not individually specified"**

O LLM ignora a instrucao de usar formato AGGREGATE e continua gerando comparacoes por item (Item 1, Item 2...) com "HBL: not individually specified". O prompt tem dois caminhos (PER-ITEM e AGGREGATE) que confundem o modelo.

**Correcao**: Remover completamente o caminho PER-ITEM do prompt. Forcar SEMPRE o formato AGGREGATE — listar itens do Manifest apenas como referencia, comparar numericos SOMENTE nos Subtotais. O caso PER-ITEM e tao raro que nao justifica a complexidade.

**Problema 3: Subtotais CBM/Volumes sem valores do HBL**

O LLM conseguiu preencher peso nos subtotais (parcialmente funcionou), mas CBM e Volumes continuam "not individually specified". O HBL JSON tem esses dados no array `exporters`.

**Correcao**: Ja coberta pela simplificacao do Problema 2. Com formato unico e claro, o LLM vai buscar TODOS os campos do JSON do HBL (peso, cbm, packages_qty).

**Problema 4: Invoice References com DIVERGENCE falso**

O campo `invoice_ref` no item do Manifest e na verdade o **delivery note** (ex: 78069472), enquanto `invoice_numbers` no exporter e a lista real de invoices (ex: 7500744709). O LLM compara delivery_note com invoice numbers do HBL, gerando divergencias falsas.

**Correcao**: Adicionar instrucao no prompt esclarecendo que `invoice_ref` nos items do Manifest e o delivery note, NAO o numero de invoice. A comparacao de invoices deve ser feita entre `invoice_numbers` do exporter (Manifest) e as invoices listadas no HBL, NAO entre `invoice_ref` de items individuais.

---

### Alteracoes Tecnicas

**Arquivo 1: `supabase/functions/sea-submit-analysis/index.ts`** (linhas 1302-1315)

Substituir logica de `reference_weight_kg`:
- Contar quantos exportadores tem `weighed_weight_kg > 0`
- Se menos de 70% dos exportadores tem peso aferido, usar `gross_weight_kg` para todos
- Adicionar log indicando qual peso foi escolhido

**Arquivo 2: `supabase/functions/sea-submit-analysis/prompts.ts`** (linhas 1328-1434)

1. Remover bloco PER-ITEM vs AGGREGATE inteiro (linhas 1328-1358)
2. Remover caminho "IF HBL HAS PER-ITEM BREAKDOWN" (linhas 1373-1381)
3. Manter apenas formato AGGREGATE:
   - Items do Manifest listados como referencia (sem comparacao numerica)
   - Subtotais obrigatorios com valores do HBL JSON
4. Adicionar regra sobre `invoice_ref`: "O campo `invoice_ref` nos items do Manifest e o delivery note, NAO o numero de invoice. Para comparacao de Invoice References por exporter, use o campo `invoice_numbers` do exporter no Manifest, NAO o `invoice_ref` dos items individuais."
5. Manter proibicao de "not individually specified"
6. Manter todas as outras regras (NCM, seal, container, peso x1000)

### O que NAO sera alterado
- pdfExtractor.ts (extrai corretamente)
- xlsxExtractor.ts (extrai corretamente)
- resultFormatter.ts
- deterministicCompare.ts
- UI frontend
- Comparacao HBL x MBL e Invoice x HBL

### Arquivos Modificados
1. `supabase/functions/sea-submit-analysis/index.ts` -- Corrigir logica reference_weight_kg para pesagem incompleta
2. `supabase/functions/sea-submit-analysis/prompts.ts` -- Simplificar formato, remover PER-ITEM, corrigir invoice_ref vs invoice_numbers
