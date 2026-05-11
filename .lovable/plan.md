## Problema

30 comprovantes levaram 13+ minutos para processar 71%. Causa raiz: na fase de **identificação**, cada arquivo dispara **até 14 invocações sequenciais** da edge function `mariadb-proxy` (uma para cada candidato SPO/ND). Cada invocação faz cold-start + nova conexão MariaDB (~1–3s só para conectar, conforme logs). Com `CONCURRENCY=5`, isso vira gargalo dominante.

Hoje em `ComprovanteRobot.tsx > identifyOne`:
- 1× `parse-comprovante-pdf` (LLM, OK)
- 1× `find_voucher_by_spo` (numeroSPO)
- 1× `find_voucher_by_nd` (numeroND)
- 1× `find_voucher_by_nd` (linhaDigitavel)
- até 6× `find_voucher_by_nd` (candidatosND)
- até 6× `find_voucher_by_spo` (candidatosSPO)

Cada `find_voucher_*` ainda roda 4–7 sub-queries internas. Pior caso ≈ 15 invocações × ~3s = **~45s por arquivo**.

## Correção (cirúrgica, mantém regras de match)

### A. Nova action `find_voucher_multi` em `mariadb-proxy/index.ts`

Recebe **todos** os candidatos de UM arquivo em uma única chamada e retorna o primeiro match seguindo a mesma ordem de prioridade do front:

```ts
body: {
  action: "find_voucher_multi",
  spoPrimary?: string,
  ndPrimary?: string,
  linhaDigitavel?: string,
  spoCandidates?: string[],   // já top-N do front
  ndCandidates?: string[],
}
```

Internamente, em uma única conexão MariaDB:
1. Tenta `spoPrimary` reusando exatamente a lógica de `find_voucher_by_spo`.
2. Se nada, `ndPrimary` reusando `find_voucher_by_nd`.
3. Se nada, `linhaDigitavel` (mesmo handler de ND).
4. Loop sequencial pelos `ndCandidates` (curto-circuito ao primeiro match).
5. Loop sequencial pelos `spoCandidates`.

Retorna `{ success, voucher | null, matchedCandidate, tried[] }`.

Implementação refatora os blocos de `find_voucher_by_spo` e `find_voucher_by_nd` para funções helpers internas (`tryFindBySpo(client, spo)` / `tryFindByNd(client, nd)`) e mantém os handlers existentes chamando essas helpers — sem mudar contrato público.

### B. Atualizar `src/pages/esteira/ComprovanteRobot.tsx`

- Substituir o bloco `tryCandidate` + 6 loops sequenciais por **uma única invocação** `mariadb-proxy { action: "find_voucher_multi", ... }`.
- Aumentar `CONCURRENCY` de **5 → 8** (parsing PDF é o limite real do Lovable AI Gateway; mariadb-proxy passa a ser 1 chamada/arquivo).
- Manter `MAX_CANDIDATES_PER_KIND = 6` para não inflar o payload.
- Exibir `matchedCandidate` e `tried` exatamente como hoje.

### Sem mudanças
- Lógica de extração do parser (`parse-comprovante-pdf`) permanece intacta.
- Regras SQL de match permanecem idênticas (apenas movidas para helpers).
- Upload e `attach_comprovante_batch` permanecem.
- Layout, badges, fluxo manual, RLS — tudo intacto.

## Ganho esperado

- Identificação: de ~14 round-trips/arquivo para **1 round-trip/arquivo** → estimativa **5–8× mais rápido** (30 arquivos: de ~10 min para ~1.5–2 min).
- Sem alterar precisão do match (mesma ordem de prioridade).
