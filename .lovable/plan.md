## Diagnóstico

Hoje, em `src/components/tabs/RoboTab.tsx#handleFilesSelected`, cada comprovante passa por:

1. **Upload do PDF inteiro (base64) para a edge function `parse-comprovante-pdf`** — mesmo que essa função, por regra do projeto ([mem](mem://vouchers/comprovante-robot-matching-rules)), **identifique exclusivamente pelo nome do arquivo** e nunca leia o conteúdo do PDF. O `pdfBase64` é exigido mas nunca usado.
2. **Até 14 chamadas sequenciais** à `mariadb-proxy` (`find_voucher_by_spo` / `find_voucher_by_nd`), uma por candidato, dentro do `for (const t of tries)`.
3. Concorrência limitada a `CONCURRENCY = 5`.

Com 25 arquivos = 5 lotes × (1 upload pesado + até 14 round-trips) → ~13s/arquivo, total 5min29s.

A action `find_voucher_multi` **já existe** em `mariadb-proxy` e aceita arrays `spoCandidates` / `ndCandidates`, fazendo todo o fallback server-side em uma única chamada — mas não está sendo usada pelo RoboTab.

## Mudanças (somente frontend / um único arquivo)

Arquivo: `src/components/tabs/RoboTab.tsx`

### 1. Extrair candidatos do nome do arquivo no cliente
- Replicar a lógica de `extractFromFilename` de `supabase/functions/parse-comprovante-pdf/index.ts` (≈200 linhas de regex puras, sem dependências) em uma nova função local `extractCandidatesFromFilename(fileName)`.
- Eliminar `fileToBase64()` e a chamada `supabase.functions.invoke('parse-comprovante-pdf', …)` — economiza upload de base64 (PDFs de ~500KB–2MB) + cold start + parse.
- Ganho esperado: ~3–6s por arquivo.

### 2. Uma única chamada de lookup por arquivo
- Substituir o loop `for (const t of tries) { searchVoucherBySPO / searchVoucherByND }` por **uma chamada** a `find_voucher_multi`, passando `spoPrimary`, `ndPrimary`, `spoCandidates`, `ndCandidates`.
- Manter `pickVoucher` / `isIdentityMatch` para validação de identidade do retorno (defesa em profundidade).
- Ganho esperado: ~5–7s por arquivo (de até 14 round-trips para 1).

### 3. Aumentar concorrência
- `CONCURRENCY` de **5 → 10**. O gargalo deixa de ser o servidor (1 query por arquivo) e passa a ser a fila do cliente.
- Trocar o padrão "batch-await-batch" por um **worker pool** real (10 workers consumindo uma fila), para não esperar o arquivo mais lento de cada lote.

### 4. Manter UI atual
- Placeholders "identifying", banner de progresso, `setIdentifyProgress` continuam iguais — só o tempo até `done` muda.

## Resultado esperado

- Por arquivo: **~2–4s** (1 lookup + overhead de invoke).
- 25 arquivos com 10 workers: **≤1min** total (vs 5min29s atuais).
- Meta de ≤5s/arquivo atendida com folga.

## O que NÃO muda

- `parse-comprovante-pdf` continua existindo (pode ser usada por outros fluxos) — apenas o RoboTab para de chamá-la.
- `mariadb-proxy` (sem alterações — `find_voucher_multi` já existe).
- Regras de matching, prioridade, normalização de SPO/ND, `pickVoucher`, validação de identidade.
- Comportamento de upload/processamento depois da identificação (fase "Processar").

## Detalhes técnicos

```text
ANTES (por arquivo)
  fileToBase64 → invoke(parse-comprovante-pdf) [PDF ~1MB]
  └─ até 14× invoke(mariadb-proxy: find_voucher_by_spo|nd)

DEPOIS (por arquivo)
  extractCandidatesFromFilename(file.name)   [pure JS, <1ms]
  └─ 1× invoke(mariadb-proxy: find_voucher_multi)
```

Pool de workers (esboço):
```ts
const CONCURRENCY = 10;
let cursor = 0;
const next = () => (cursor < selectedFiles.length ? cursor++ : -1);
const worker = async () => {
  let i;
  while ((i = next()) !== -1) await processOne(selectedFiles[i], baseIndex + i);
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
```
