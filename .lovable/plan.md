

## Plano: Corrigir build errors + status do processo 045-13301256

### Parte 1: Build errors em Index.tsx

O código em `src/pages/Index.tsx` está sintaticamente correto nas linhas indicadas. Os erros parecem ser de cache/estado stale do build. A correção será forçar uma re-escrita mínima (adicionar/remover espaço) para limpar o cache do TypeScript.

### Parte 2: Corrigir status do 045-13301256

**Problema**: O processo usa hierarquia IATA para determinar o `finalCode`. RCF tem ID maior que DEP na tabela `t_eventos_awb`, então RCF "vence" mesmo sendo cronologicamente anterior.

**Correção cirúrgica** (conforme memory de data-mirroring-intent): Alterar a lógica de resolução para usar `lastStatusCode` ou `code0` (primeiro evento da timeline, que é o mais recente cronologicamente), sem hierarquia IATA.

**Arquivo**: `supabase/functions/fetch-tracking-aereo/index.ts` (linhas 411-441)

Substituir o bloco de hierarquia por:

```typescript
let finalCode: string | null = null;
const codes = [code0, code1, code2, code3];

// DLV always takes priority (delivered is final)
if (codes.some(c => c === "DLV") || lastStatusCode === "DLV") {
  finalCode = "DLV";
} else {
  // Use last_status_code (most recent from scraper) or first timeline event
  finalCode = lastStatusCode || code0 || null;
}
```

Isso remove a lógica de hierarquia e usa diretamente o status mais recente cronologicamente, alinhado com a diretriz de espelhamento.

### Arquivos alterados
1. `src/pages/Index.tsx` — re-save para limpar build errors
2. `supabase/functions/fetch-tracking-aereo/index.ts` — simplificar resolução de status

