# Corrigir erro "Nenhum OCR persistido pôde ser relido"

## Causa

Em `analyze-chb-documents/index.ts` o fluxo atual é estritamente dependente da releitura de `t_chb_file_extractions`:

1. `persistRawOcrForFiles(...)` extrai o OCR em memória e grava 1 linha por arquivo (logs confirmam: "Persisted raw OCR for 6 file(s)" e `insertId` retornado pelo proxy).
2. Logo depois, `get_chb_extractions` faz um JOIN com subquery `MAX(id) GROUP BY file_id` para pegar a versão mais recente — e nesse momento retornou **0 linhas** ("Read back 0 raw_ocr_text rows").
3. Como o código aborta sempre que a releitura retorna vazio, o usuário vê o erro "Nenhum OCR persistido pôde ser relido de t_chb_file_extractions" e a análise é cancelada.

O OCR já foi extraído e está disponível em memória (`persistRawOcrForFiles` o computa antes de gravar). Descartar essa cópia e abortar é frágil — qualquer hiccup na releitura (latência de replicação, GROUP BY ignorando `file_id NULL`, etc.) interrompe análises válidas.

## Solução (cirúrgica, apenas em `analyze-chb-documents/index.ts`)

Manter a persistência como hoje (auditoria), mas usar o OCR em memória como **fonte primária** e a releitura do banco como **confirmação opcional**.

### 1. `persistRawOcrForFiles` (linha ~2052)
Mudar o retorno para também devolver o texto OCR computado:

```ts
persisted.push({
  filename: file.name,
  extractionId: ins.extractionId ?? null,
  status: hasRawOcr ? 'OK' : 'PARCIAL',
  rawOcrText: hasRawOcr ? rawOcr : '',
});
```

Tipar o array de retorno com o novo campo `rawOcrText: string`.

### 2. Bloco "FLUXO ÚNICO" (linhas ~2371-2412)
Substituir a lógica que aborta quando a releitura volta vazia:

- Primeiro, montar `dbOcrByFilename` a partir do retorno de `persistRawOcrForFiles` (em memória).
- Em seguida, tentar `get_chb_extractions`. Se trouxer linhas com `raw_ocr_text`, sobrescrever as entradas correspondentes (banco vence quando disponível).
- Abortar **somente** se, depois das duas fontes combinadas, ainda restarem **zero** arquivos com texto utilizável.
- Logar de forma clara qual fonte foi usada por arquivo (`memory` vs `db`) e quando a releitura voltou vazia (apenas warning, não erro).

### 3. Mensagem de erro final
Trocar o texto de erro residual para algo mais útil quando realmente não houver OCR algum:
`"Nenhum OCR pôde ser extraído dos arquivos enviados."`

## O que NÃO muda
- Continua gravando em `t_chb_file_extractions` (auditoria intacta).
- `persistRawOcrForFiles` continua falhando alto se a gravação no banco falhar.
- Nenhuma mudança em `mariadb-proxy`, no schema, no prompt, no resto do pipeline ou no frontend.

## Validação
- Reenviar os mesmos documentos do processo 135: a análise deve concluir mesmo se `get_chb_extractions` voltar 0 linhas.
- Logs devem mostrar "Using in-memory OCR for N file(s)" e a análise progredir normalmente.
- O toast de erro só aparece se nenhum arquivo conseguir produzir OCR.
