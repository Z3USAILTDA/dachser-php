

## Diagnóstico

O processo `045-13002511` aparece como rodoviário no card, mas seu último evento é `BKD` com voo `M3-8485` (sem sufixo `-T`, sem `X/D`, sem `X` ou `D` final). Ou seja, é claramente aéreo.

A causa está em `supabase/functions/fetch-tracking-aereo/index.ts`, função `hasGroundFlightPattern`:

```ts
return /\b[A-Z0-9]{2,4}\s?\d{2,5}-T\b/i.test(clean) || 
       /\b[A-Z0-9]{2,4}\s?\d{2,5}\s*X\s*\/\s*D\b/i.test(clean) || 
       /\b[A-Z0-9]{2,4}\s?\d{2,5}[XD]\b/i.test(clean);  // ← culpado
```

O terceiro regex `\d{2,5}[XD]\b` casa qualquer voo cujo número termine com dígito seguido das letras X **ou D** em qualquer parte da descrição/timeline. Combinado com o **fallback agressivo** que faz `JSON.stringify(timelineRaw)` e roda o regex no payload inteiro, qualquer ocorrência de "...X" ou "...D" em palavras vizinhas (códigos IATA, nomes de cidades, status como "**D**FW", "MA**O**", **"D"**eparted, descrições com "Code DLV") gera falso positivo.

Para `M3-8485` especificamente, a timeline contém substrings tipo `M3 8485` seguidas em algum ponto por palavras com `D` (DEP, DLV, DFW, etc.), e o regex `\d{2,5}[XD]` casa.

## Causa raiz

1. O sufixo legado `[XD]` no fim do número é **ambíguo demais** — qualquer voo terminado em dígito seguido de qualquer letra X/D em outro contexto pode disparar.
2. O fallback `JSON.stringify(timelineRaw)` amplifica o problema rodando o regex sobre o JSON inteiro (descrições, status codes, cidades), não sobre o campo de voo isolado.

## Correção (cirúrgica)

### 1. Restringir `hasGroundFlightPattern` em `fetch-tracking-aereo/index.ts`
Manter **apenas** os dois sinais inequívocos de RFS:

```ts
const hasGroundFlightPattern = (val: string): boolean => {
  const clean = normalizeGroundCandidate(val);
  if (!clean) return false;
  // Só sufixo -T explícito ou notação literal X/D
  if (/\b[A-Z]{2,3}\s?\d{2,5}-T\b/.test(clean)) return true;
  if (/\b[A-Z]{2,3}\s?\d{2,5}\s*X\s*\/\s*D\b/.test(clean)) return true;
  return false;
};
```

Mudanças:
- Remove o regex `\d{2,5}[XD]\b` (fonte do falso positivo).
- Estreita prefixo de companhia para `[A-Z]{2,3}` (não `[A-Z0-9]{2,4}`), evitando casar lixo numérico.

### 2. Remover o fallback `JSON.stringify(timelineRaw)` 
Esse scan cego sobre o JSON inteiro deve ser eliminado. Manter detecção apenas em campos estruturados de voo (`LAST_FLIGHT`, `flight` por evento).

### 3. Espelhar a mesma correção em `fetch-status-aereo/index.ts`
Mesma função `hasGroundFlightPattern` e mesmo fallback existem lá — aplicar idênticas mudanças.

### 4. Atualizar memória
`mem://air/tracking/aereo-monitoring-spec`: documentar que detecção RFS agora exige **`-T` explícito** ou **`X/D` literal** em campo de voo isolado. Sufixo legado `X`/`D` solo foi descontinuado por gerar falsos positivos.

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts`
- `supabase/functions/fetch-status-aereo/index.ts`
- `mem://air/tracking/aereo-monitoring-spec`

## Validação
1. `045-13002511` (BKD M3-8485): deve mostrar **avião** (não caminhão).
2. `045-21167764` e `045-21167904` (RFS reais com `-T`): devem continuar mostrando **caminhão**.
3. Spot-check em processos com voos terminados em dígito + descrições contendo "DEP"/"DLV"/cidades com D ou X: nenhum deve virar RFS por engano.

## Riscos
- **Sem alteração de schema**.
- **Cobertura**: se existir alguma cia que use o sufixo solo `X` ou `D` sem `-T`, ela deixará de ser detectada. Mitigação: a notação moderna padronizada é `-T` ou `X/D`; o sufixo solo é raro e gera mais ruído que sinal.

