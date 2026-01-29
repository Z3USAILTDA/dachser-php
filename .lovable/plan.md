

# Correção dos Problemas de NCM vs HS Code na Análise Documental SEA

## Problemas Identificados

### Problema 1: HS Codes sendo tratados como NCM Codes
O modelo LLM continua extraindo valores de colunas/labels de "HS Code" e comparando-os com valores de colunas "NCM Code", mesmo com instruções parcialmente corrigidas.

**Causa raiz identificada**:
- Os prompts em `maritimo-analyze/prompts.ts` e `sea-submit-analysis/prompts.ts` contêm instruções contraditórias
- A tabela de mapeamento de colunas diz explicitamente: `| HS CODE/NCM | "HS Code" column |` (linha ~985 em ambos arquivos)
- Isso instrui o modelo a extrair da coluna "HS Code" quando deveria extrair APENAS de colunas "NCM Code"
- Há referências mistas como "NCM/HS codes" que confundem o modelo

### Problema 2: Valores marcados como "Extra" quando existem no documento base
Valores que existem no documento base (Manifest) estão sendo marcados como "extras" porque:
- O parsing de colunas NCM pode não estar identificando corretamente todos os valores
- O código de extração em `simpleXlsxReader.ts` já tem lógica correta, mas o modelo está usando instruções conflitantes dos prompts

---

## Solução Proposta

Corrigir os prompts para eliminar referências a "HS Code" como fonte de extração de NCM, mantendo a estrutura visual do resultado inalterada.

### Arquivos a Modificar

1. **`supabase/functions/maritimo-analyze/prompts.ts`**
2. **`supabase/functions/sea-submit-analysis/prompts.ts`**

### Mudanças Específicas

#### 1. Corrigir a Tabela de Mapeamento de Colunas

**Antes** (em ambos os arquivos):
```
| HS CODE/NCM         | "HS Code" column                                         |
```

**Depois**:
```
| NCM CODE            | "NCM Code" or "Código NCM" column ONLY (NEVER "HS Code") |
```

#### 2. Reforçar Instruções de Extração NCM

Adicionar seção explícita nos prompts com exemplos concretos de rejeição:

```
████████████████████████████████████████████████████████████████████████████████
█ CRITICAL: NCM vs HS CODE - THESE ARE DIFFERENT SYSTEMS                        █
████████████████████████████████████████████████████████████████████████████████

★★★ EXTRACTION SOURCE RULES - READ BEFORE EXTRACTING ★★★

FOR MANIFEST/XLSX FILES:
✓ EXTRACT FROM: "NCM Code", "Código NCM", "NCM" columns
✗ NEVER EXTRACT FROM: "HS Code", "HS", "H.S.", "Harmonized System" columns

★★★ CONCRETE REJECTION EXAMPLES ★★★

REJECT (these are HS Codes, NOT NCMs - DO NOT include in NCM list):
- Column header "HS Code" with value "870850" → REJECT
- Column header "H.S." with value "8481" → REJECT
- Label "HS-CODE:" followed by "8708" → REJECT

ACCEPT (these are NCMs - INCLUDE in NCM list):
- Column header "NCM Code" with value "87089900" → ACCEPT
- Column header "Código NCM" with value "84812090" → ACCEPT
- Label "NCM:" followed by "73182900" → ACCEPT

★★★ IF THE COLUMN NAME CONTAINS "HS" - DO NOT USE IT FOR NCM ★★★
★★★ IF THE COLUMN NAME CONTAINS "NCM" - USE IT FOR NCM ★★★
```

#### 3. Remover Referências Ambíguas

Substituir todas as ocorrências de:
- `"NCM/HS codes"` → `"NCM codes"`
- `"NCM/HS Code"` → `"NCM Code"`
- `"HS Code/NCM"` → `"NCM Code"`

#### 4. Atualizar Seção de Extração de Dados Exhaustiva

Na seção "EXHAUSTIVE DATA EXTRACTION" dos prompts, alterar:
```
FROM MANIFEST/XLSX (scan ALL columns, ALL rows):
...
- NCM/HS codes (8-digit and 4-digit)
```

Para:
```
FROM MANIFEST/XLSX (scan ALL columns, ALL rows):
...
- NCM codes ONLY from "NCM Code" or "Código NCM" columns (NEVER from "HS Code" columns)
```

---

## Detalhes Técnicos

### Mudanças em `maritimo-analyze/prompts.ts`

Linhas aproximadas a modificar:
- Linha ~985: Tabela de mapeamento de colunas
- Linhas ~270-280: Seção de extração exhaustiva
- Múltiplas ocorrências de "NCM/HS" ao longo do arquivo

### Mudanças em `sea-submit-analysis/prompts.ts`

Linhas aproximadas a modificar:
- Linha ~969: Tabela de mapeamento de colunas
- Linhas ~248-260: Seção de extração exhaustiva
- Múltiplas ocorrências de "NCM/HS" ao longo do arquivo

### Padrões de Busca e Substituição

| Buscar | Substituir por |
|--------|----------------|
| `NCM/HS codes` | `NCM codes` |
| `NCM/HS Code` | `NCM Code` |
| `HS Code/NCM` | `NCM Code` |
| `"HS Code" column` (na tabela) | `"NCM Code" or "Código NCM" column ONLY` |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Manifest tem coluna "HS Code" com "870850" | Modelo extrai e compara com NCMs | Modelo ignora esta coluna |
| Manifest tem coluna "NCM Code" com "87089900" | Modelo pode ignorar ou misturar | Modelo extrai corretamente |
| Valor existe no Manifest mas marcado como "Extra" | Falso positivo | Comparação correta |

## Impacto na Interface

**Nenhum impacto visual** - Apenas a lógica interna de extração e comparação será corrigida. A estrutura do resultado que o usuário recebe permanece exatamente igual.

