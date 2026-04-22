

## Diagnóstico
A detecção de discrepância para o prefixo 996 carrega 21 AWBs candidatos mas detecta **0 discrepâncias** (`[996-DISC] Added/enriched 0 discrepancy records`). O AWB `996-14374662` mostra claramente uma divergência real (26 peças → 1 peça entre eventos), mas o badge não acende.

## Causa raiz
O formato real do uxtracking visto na timeline é `Pcs/Wt: 1/27,3` ou `Pcs/Wt: 26/710,7` — **sem sufixo `KGS`/`LBS`/`K`** e com **vírgula decimal** no peso. Os regex atuais em `extractPieces996` (linha 420 de `fetch-tracking-aereo/index.ts`) e em `extractPiecesFromDesc` (`mariadb-proxy/index.ts`) exigem `(KGS?|LBS?|K)\b` como sufixo, então **não capturam nada**:

```ts
// Atual — não bate em "Pcs/Wt: 1/27,3"
/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/
```

Resultado: zero peças extraídas → `piecesValues.length === 0` → bloco `continue` na linha 482 → nenhuma discrepância registrada.

## Correção (cirúrgica)

### 1. `supabase/functions/fetch-tracking-aereo/index.ts` — `extractPieces996` (linha ~412)
Adicionar regex **prioritário** específico para o padrão `Pcs/Wt:` (com ou sem espaços, vírgula decimal aceita), antes do regex genérico `KGS|LBS|K`:

```ts
// Pattern: "Pcs/Wt: 10/27,3" (uxtracking real format, no unit suffix)
const pcsWtMatch = upper.match(/PCS\s*\/\s*WT\s*[:=]?\s*(\d+)\s*\/\s*[\d.,]+/);
if (pcsWtMatch) {
  const v = parseInt(pcsWtMatch[1], 10);
  if (v > 0) return v;
}
```

Manter os regex existentes como fallback. A ordem importa: `Pcs/Wt` primeiro, depois `KGS|LBS|K`, depois `PIECES`/`QTY`.

### 2. `supabase/functions/mariadb-proxy/index.ts` — `extractPiecesFromDesc` (linha ~7947)
Aplicar a mesma correção: adicionar o regex `Pcs/Wt:` como primeira tentativa, garantindo paridade entre lista (badge) e modal (alerta amarelo de discrepância).

### 3. Memória persistente
Atualizar `mem://air/tracking/forced-discrepancy-locking-logic` adicionando: "Formato real do uxtracking nos eventos 996 é `Pcs/Wt: <peças>/<peso>` (sem unidade KGS/LBS, com vírgula decimal). O regex `/PCS\s*\/\s*WT\s*[:=]?\s*(\d+)\s*\/\s*[\d.,]+/` é a fonte primária; `KGS|LBS|K` é apenas fallback genérico."

## Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — +5 linhas em `extractPieces996`
- `supabase/functions/mariadb-proxy/index.ts` — +5 linhas em `extractPiecesFromDesc`
- `mem://air/tracking/forced-discrepancy-locking-logic` — atualização

## Validação pós-deploy
1. `supabase--edge_function_logs fetch-tracking-aereo` → confirmar `[996-DISC] Added/enriched N` com N > 0 (esperado próximo de metade dos 21 candidatos).
2. Abrir `/air/tracking-aereo` e localizar AWB `996-14374662` → badge "Discrepância Peças" deve acender (26 ≠ 1).
3. Abrir o modal de timeline do mesmo AWB → barra amarela `⚠ Discrepância de peças detectada: valores encontrados 1 e 26` deve aparecer.
4. Confirmar que os outros 32 prefixos (não-996) seguem inalterados.

## Riscos e mitigações
- **Falsos positivos**: regex `PCS/WT:` é muito específico do uxtracking — risco baixo de bater em outros prefixos. Mesmo se batesse, exige ≥2 valores distintos para acusar discrepância.
- **Sem regressão**: regex novo é adicionado **antes** dos existentes; se não bater, fluxo cai nos fallbacks atuais.

