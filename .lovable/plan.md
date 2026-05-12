## Diagnóstico

A otimização anterior (`find_voucher_multi`) cobriu **apenas a fase de identificação**. A fase **"Processar"** (`processFiles` em `src/pages/esteira/ComprovanteRobot.tsx`, linhas 259–363) ainda é lenta porque:

1. **Upload sequencial ao storage** — loop `for (const fileMatch of identifiedFiles)` com `await supabase.storage.from("voucher-anexos").upload(...)` um arquivo por vez. Com 30 PDFs de ~200KB-2MB, cada upload leva 0.5–2s → **15–60s só de upload**.
2. O `attach_comprovante_batch` final já é **1 única chamada** ao MariaDB — não é o gargalo.

## Correção (cirúrgica, mesmo padrão da identificação)

### Arquivo único: `src/pages/esteira/ComprovanteRobot.tsx`

**Em `processFiles` (linhas 284–334):** substituir o loop `for...of` sequencial por um pool de uploads concorrentes, reusando o helper `runWithConcurrency` que já existe na fase de identificação.

```ts
const UPLOAD_CONCURRENCY = 6; // storage aguenta bem; mantém UI responsiva

const uploadOne = async (fileMatch: FileMatch) => {
  setFiles(prev => prev.map(f =>
    f.fileName === fileMatch.fileName ? { ...f, status: "processing" } : f
  ));
  try {
    const fileExt = fileMatch.file.name.split(".").pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `comprovantes/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("voucher-anexos").upload(filePath, fileMatch.file);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage
      .from("voucher-anexos").getPublicUrl(filePath);

    setFiles(prev => prev.map(f =>
      f.fileName === fileMatch.fileName ? { ...f, status: "success" } : f
    ));
    return { ok: true, payload: { voucher_id: fileMatch.voucherId!, file_name: ..., file_url: publicUrl, ... } };
  } catch (error: any) {
    setFiles(prev => prev.map(f =>
      f.fileName === fileMatch.fileName ? { ...f, status: "error", error: error.message } : f
    ));
    return { ok: false };
  } finally {
    processed++;
    setProgress((processed / identifiedFiles.length) * 100);
  }
};

const results = await runWithConcurrency(identifiedFiles, UPLOAD_CONCURRENCY, uploadOne);
const comprovantesToUpload = results.filter(r => r.ok).map(r => r.payload);
```

A chamada final `attach_comprovante_batch` permanece intacta.

### Sem mudanças
- Sem alteração no backend (`mariadb-proxy`).
- Sem alteração em `attach_comprovante_batch`.
- Sem alteração na lógica de identificação, RLS, layout, badges ou UI.
- Mesmas mensagens de toast e mesmos estados visuais por arquivo.

## Ganho esperado

- Upload: de **sequencial** para **6 em paralelo** → **~5× mais rápido** na fase de processar.
- 30 arquivos: de ~30–60s → **~6–12s** na fase de upload.
- Combinado com a otimização anterior de identificação, o ciclo completo de 30 comprovantes deve cair de ~13min para **~2–3min**.
