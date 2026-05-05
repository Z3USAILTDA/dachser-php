## Problema

O SPO real no banco é **`105-292915 DIM-BY`**, mas o robô de comprovantes:

1. Recebe o arquivo `105-292915.pdf`
2. O parser (`parse-comprovante-pdf`, regex `(\d{3})-(\d{5,7})`) descarta o prefixo de filial e extrai **apenas `"292915"`** como `numeroSPO` (score 95, alta confiança → não chama IA).
3. Chama `find_voucher_by_spo("292915")`. O exact-match falha (real é `"105-292915 DIM-BY"`); o LIKE `%292915%` com `LIMIT 5 ORDER BY created_at DESC` pode não retornar o voucher correto se houver outros SPOs contendo `292915`, ou se o voucher ainda não existia no momento da tentativa.

Resultado: robô não identificou e não anexou o comprovante.

## Correção

### 1. `supabase/functions/parse-comprovante-pdf/index.ts`

No bloco "SPO Manual" (linha 143), além de adicionar `m[2]` (`292915`), adicionar também o par completo **`m[1]-m[2]`** (`105-292915`) como candidato com score igual ou superior, e **promovê-lo a `numeroSPO` principal** quando o nome do arquivo bater no padrão `NNN-NNNNNN`. Idem para o padrão "SPO Remessa" (linha 135).

Assim o frontend tenta primeiro `find_voucher_by_spo("105-292915")`, que casa exatamente com o voucher mesmo havendo o sufixo `" DIM-BY"`.

### 2. `supabase/functions/mariadb-proxy/index.ts` — `find_voucher_by_spo`

Tornar a busca mais robusta para SPOs que contêm sufixo livre (`" DIM-BY"`, etc.):

- Após o exact-match, **antes** do LIKE genérico `%X%`, adicionar uma busca por **prefixo exato com possível sufixo separado por espaço**:
  ```sql
  WHERE numero_spo = ?
     OR numero_spo LIKE CONCAT(?, ' %')
  ```
  Ex: para `"105-292915"`, casa `"105-292915"` e `"105-292915 DIM-BY"` (mas não `"105-2929150"`).

- Manter `LIMIT 5` mas ordenar priorizando match exato de prefixo sobre LIKE genérico.

### 3. (opcional, defensivo) Fluxo no `ComprovanteRobot.tsx`

Se `extractedData.numeroSPO` parecer ser apenas a parte numérica (sem `NNN-`), e `candidatosSPO` contiver uma versão `NNN-NNNNNN` derivada do nome do arquivo, tentar primeiro a versão com prefixo. Já fica coberto pela mudança 1, mas vale uma revisão.

## Resultado esperado

- `105-292915.pdf` → parser extrai `numeroSPO = "105-292915"` (com `"292915"` como candidato secundário)
- `find_voucher_by_spo("105-292915")` → exact-prefix match → retorna `"105-292915 DIM-BY"`
- Robô identifica e anexa o comprovante automaticamente.

Sem alterações em UI ou tabelas, sem migrations.
