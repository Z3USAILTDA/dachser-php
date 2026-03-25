

## Plano: Usar FilePreview na aba de Pagamentos

### Problema
Na aba de Pagamentos, o botão de visualizar arquivo usa `window.open(url, "_blank")`, que abre uma nova aba bloqueada pelo navegador. Nos detalhes do voucher e comprovantes, o componente `FilePreview` já faz a visualização inline (PDF, imagem, XML) via dialog modal.

### Correção

**Arquivo: `src/components/esteira/PagamentosTab.tsx`**

1. Importar `FilePreview` de `./FilePreview`
2. Na seção de anexos do dialog expandido (~linha 986-996), substituir o botão `ExternalLink` + `window.open` pelo componente `<FilePreview>`, passando `fileName`, `fileUrl`, `fileType` e `onDownload` — mesmo padrão usado em `VoucherDetailsView.tsx` e `ComprovantesTab.tsx`.

Trecho atual:
```tsx
<Button variant="ghost" size="icon" className="h-7 w-7"
  onClick={() => window.open(anexo.file_url, "_blank")}>
  <ExternalLink className="h-3.5 w-3.5" />
</Button>
```

Substituir por:
```tsx
<FilePreview
  fileName={anexo.file_name || "arquivo"}
  fileUrl={anexo.file_url}
  fileType={anexo.tipo || "OUTROS"}
  onDownload={() => { /* download handler */ }}
/>
```

Nenhuma alteração em outros arquivos.

