
## Correcao: 2 Problemas Criticos - Peso Total e Exportadores Nao Encontrados

### Problemas Identificados no Resultado

**Problema 1: Peso total errado (4,038 kg em vez de 11,291 kg)**

A logica no `index.ts` (linhas 1327-1334) calcula o total assim:
```text
if (weighingComplete) {
  totals.reference_weight_kg = totals.weighed_weight_kg > 0 ? totals.weighed_weight_kg : totals.gross_weight_kg
}
```

Com 19 de 26 exportadores pesados (73% > 70%), `weighingComplete = true`. O sistema usa `totals.weighed_weight_kg` direto, que e a soma bruta de TODOS os pesos aferidos (incluindo zeros) = 4,038 kg.

Porem, a logica PER-EXPORTER (linhas 1311-1316) corretamente faz fallback para gross quando weighed=0. Ou seja, cada exporter tem o reference_weight_kg correto, mas o TOTAL nao reflete a soma dos exportadores — usa o valor bruto.

**Correcao**: Calcular `totals.reference_weight_kg` como a SOMA dos `reference_weight_kg` de todos os exportadores, em vez de usar o campo `totals.weighed_weight_kg` diretamente.

---

**Problema 2: Todos os 26 exportadores mostram "exporter not found in HBL JSON"**

O prompt instrui o LLM a "find the matching exporter in the HBL JSON exporters array by name". Mas:
- O Manifest tem nomes como "ZF POLSKA", "Frenzelit GmbH", "Parker Hannifin GmbH"
- O HBL PDF, extraido pelo pdfExtractor, provavelmente tem nomes ligeiramente diferentes (ex: "ZF POLSKA SP. Z O.O.", "FRENZELIT GMBH") ou pode ate ter extraido poucos/nenhum exporter individual

O LLM faz comparacao EXATA de nomes e falha em TODOS os 26. Pedir ao LLM para fazer fuzzy matching com 26 nomes nao e confiavel.

**Correcao**: Fazer o matching PROGRAMATICAMENTE no `index.ts` ANTES de enviar ao LLM. Apos extrair ambos os JSONs (manifest e HBL), comparar nomes com logica de similaridade e inserir os dados do HBL diretamente em cada exporter do manifest. Assim o LLM recebe uma estrutura pre-combinada e so precisa comparar numeros.

---

### Alteracoes Tecnicas

**Arquivo: `supabase/functions/sea-submit-analysis/index.ts`**

1. **Corrigir calculo do peso total** (linhas 1327-1334):
   - Apos calcular `reference_weight_kg` para cada exporter, somar todos para obter o total
   - Substituir: `totals.reference_weight_kg = totals.weighed_weight_kg` por `totals.reference_weight_kg = soma de todos exporters.reference_weight_kg`

2. **Adicionar funcao de matching de exportadores** (antes do Stage 2):
   - Criar funcao `matchExporters(manifestExporters, hblExporters)` que:
     - Normaliza nomes (uppercase, remove pontuacao, trim)
     - Faz matching por substring (se nome A contem nome B ou vice-versa)
     - Para cada exporter do manifest, encontra o melhor match no HBL
     - Insere `hbl_gross_weight_kg`, `hbl_cbm`, `hbl_packages_qty` diretamente no exporter do manifest
   - Chamar esta funcao entre Stage 1A/1B e Stage 2

3. **Atualizar o prompt appendado** (linhas 1086-1094):
   - Adicionar: "Each manifest exporter already contains pre-matched HBL data in fields hbl_gross_weight_kg, hbl_cbm, hbl_packages_qty. Use these values for Subtotals comparison. Do NOT try to match exporter names yourself."

**Arquivo: `supabase/functions/sea-submit-analysis/prompts.ts`**

4. **Atualizar instrucao de Subtotais** (linhas 1336-1342 e 1406-1407):
   - Remover: "you MUST find the matching exporter in the HBL JSON exporters array by name"
   - Substituir por: "Each manifest exporter already has pre-matched HBL values: hbl_gross_weight_kg, hbl_cbm, hbl_packages_qty. Use these directly for the Subtotals comparison."
   - Atualizar template para: `HBL: Y kg (from pre-matched data)`

### O que NAO sera alterado
- pdfExtractor.ts (extrai corretamente)
- xlsxExtractor.ts (extrai corretamente)
- resultFormatter.ts, deterministicCompare.ts
- UI frontend
- Logica de NCM, seal, container
- Comparacao HBL x MBL e Invoice x HBL

### Arquivos Modificados
1. `supabase/functions/sea-submit-analysis/index.ts` — Corrigir peso total + adicionar matching programatico de exportadores
2. `supabase/functions/sea-submit-analysis/prompts.ts` — Atualizar instrucoes para usar dados pre-combinados
