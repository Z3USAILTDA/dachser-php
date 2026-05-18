## Diagnóstico

A identificação já foi otimizada. O gargalo agora é `processFiles` em `src/components/tabs/RoboTab.tsx` (linha 434), que é **100% sequencial** — `for (const fileMatch of files) { await ... }`. Por arquivo:

1. `storage.upload` (PDF para Supabase Storage)
2. `invoke('save_voucher_anexo')`
3. `invoke('update_voucher_esteira')`
4. `invoke('save_voucher_log COMPROVANTE_ANEXADO')`
5. `invoke('save_voucher_log CONCLUIDO_ROBO')` (quando não estava CONCLUIDO)

São **5 round-trips em série por arquivo, e um arquivo por vez**. Com ~400–700ms por invoke + 1–2s no upload → ~13s/arquivo → ~5–6 min para 25. Bate com o reportado.

## Meta

≤ 4s por comprovante em média (25 arquivos em ≤ ~1min40s, idealmente bem menos com paralelismo).

## Mudanças (cirúrgicas, 1 arquivo)

Arquivo único: `src/components/tabs/RoboTab.tsx`. Nenhuma edge function tocada.

### 1. Worker pool em `processFiles` (mudança principal)

Extrair o corpo do loop em `processOne(fileMatch)` e substituir o `for` sequencial pelo mesmo padrão de worker pool já usado em `handleFilesSelected`:

```ts
const CONCURRENCY = 8;
let cursor = 0;
const next = () => (cursor < files.length ? cursor++ : -1);
const worker = async () => {
  let i: number;
  while ((i = next()) !== -1) await processOne(files[i]);
};
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
```

Contadores `processed`, `successCount`, `errorCount` continuam como `let` simples (JS single-thread → `++` é atômico). `setProgress` é chamado a cada arquivo concluído. Updates `setFiles(prev => prev.map(...))` permanecem (já são imutáveis).

### 2. Paralelizar as 3 chamadas mariadb pós-anexo dentro de cada arquivo

`update_voucher_esteira` e os `save_voucher_log` **não dependem entre si** — só dependem do `save_voucher_anexo` ter gravado. Após o anexo resolver, disparar o resto via `Promise.all`:

```ts
await invoke('save_voucher_anexo', { ... });
const tasks = [
  invoke('update_voucher_esteira', { voucher_id, updates }),
  invoke('save_voucher_log', { acao: 'COMPROVANTE_ANEXADO', ... }),
];
if (!wasConcluded) {
  tasks.push(invoke('save_voucher_log', { acao: 'CONCLUIDO_ROBO', ... }));
}
await Promise.all(tasks);
```

Reduz round-trips serializados por arquivo de **5 → 3** (upload + anexo + bloco paralelo).

## Resultado esperado para 25 comprovantes

| Cenário | Tempo total | Média/arquivo |
|---|---|---|
| Hoje (sequencial) | **05:59** | ~14s |
| Só worker pool (#1) | ~50–60s | ~2,3s |
| Worker pool + Promise.all (#1+#2) | **~35–45s** | **~1,5s** |

Meta de ≤4s/arquivo atendida com folga.

## O que NÃO muda

- Edge functions intactas (zero deploy).
- Ordem lógica preservada: anexo gravado antes de update/logs.
- Regras de matching, fallback CONCLUIDO, badges, toasts, contadores idênticos.
- Memórias [Robo Stage & Attachments](mem://vouchers/robo-stage-and-attachments-v2), [Anexos Master/Filhos](mem://vouchers/anexos-master-children-columns), [Comprovante Robô Matching](mem://vouchers/comprovante-robot-matching-rules) respeitadas.
- Storage e `mariadb-proxy` aguentam tranquilamente 8 concorrentes; se houver throttling no futuro, basta baixar `CONCURRENCY`.
