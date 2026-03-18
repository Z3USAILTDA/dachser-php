

## Correção: Tela Preta no Olimpo (Movimentação Global)

### Causa raiz

O componente `Olimpo` exporta diretamente a função sem `ErrorBoundary`. As páginas que já tiveram esse problema (FinanceiroDisputa, ReguaCobranca) foram corrigidas com o padrão:

```typescript
export default function Page() {
  return (
    <ErrorBoundary>
      <PageContent />
    </ErrorBoundary>
  );
}
```

O Olimpo nunca recebeu essa proteção. Além disso, falta `dedupe` no `vite.config.ts` para evitar instâncias duplicadas de React (mesma causa raiz do problema do Voucher).

### Plano

1. **Adicionar `dedupe` no `vite.config.ts`** — Forçar instância única de React/React-DOM para evitar crash silencioso por dispatcher duplicado.

2. **Envolver Olimpo em ErrorBoundary** — Extrair o conteúdo atual para `OlimpoContent`, exportar o default com ErrorBoundary wrapper (mesmo padrão de FinanceiroDisputa/ReguaCobranca).

3. **Proteger `JSON.parse` do localStorage** — Linha 228 (`JSON.parse(localStorage.getItem("user") || "{}")`) pode crashar com JSON corrompido. Adicionar try-catch.

4. **Proteger inicialização do Mapbox** — Envolver `new mapboxgl.Map()` em try-catch para não derrubar a árvore React se WebGL falhar.

### Arquivos alterados
- `vite.config.ts` — adicionar `resolve.dedupe`
- `src/pages/Olimpo.tsx` — ErrorBoundary wrapper + try-catch em pontos críticos

