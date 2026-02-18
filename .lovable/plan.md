
## Mostrar "Falha no Rastreio" na linha da tabela e ordenar esses casos por último

### Contexto e diagnóstico

O modal `AwbTimelineModal` determina `tracking_failed` ao chamar `mariadb-proxy` com `get_awb_tracking_events`. O resultado retorna `{ tracking_failed: true }` quando não há nenhum evento válido em nenhuma fonte. Esse dado **só existe dentro do modal** — ele não é armazenado na interface `AWBData` que alimenta a tabela.

Para que a tabela reflita "Falha no Rastreio", precisamos de dois blocos de mudança:

---

### Bloco 1 — Persistir o flag `tracking_failed` em `AWBData`

**Arquivo:** `src/pages/Index.tsx`

1. **Adicionar campo ao tipo** `AWBData` (linha ~373):
   ```ts
   tracking_failed?: boolean;
   ```

2. **Capturar o resultado do modal** — quando o usuário abre o `AwbTimelineModal` e recebe `tracking_failed: true`, atualizar o item correspondente na lista `awbsList` com `tracking_failed: true`. Isso é feito no callback `onOpenChange` do modal, ou mais precisamente via um `onTrackingResult` prop que o modal pode chamar.

   A abordagem mais limpa é: ao fechar o modal (quando `open` passa de `true` para `false`), chamar uma função que recebe `{ awb, trackingFailed }` e atualiza o estado. O `AwbTimelineModal` já tem o resultado do `useQuery` no momento do fechamento.

---

### Bloco 2 — Exibir badge "Falha no Rastreio" na coluna "Último Evento"

**Arquivo:** `src/pages/Index.tsx` — célula da coluna "Último Evento" (linha ~2760)

Antes de renderizar o status code normal, verificar se `awb.tracking_failed === true`. Se sim, renderizar um badge vermelho discreto:

```tsx
{awb.tracking_failed && (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
    <AlertTriangle className="h-3 w-3" />
    Falha no Rastreio
  </span>
)}
```

Isso substitui o conteúdo da célula quando `tracking_failed` está ativo — não mostrar o status code normal nesses casos.

---

### Bloco 3 — Ordenar AWBs com falha de rastreio por último

**Arquivo:** `src/pages/Index.tsx` — função `getStatusPriority` (linha ~1985) e lógica de append (linha ~2097)

Atualmente existem 3 prioridades:
- `1` = tracking funcionando (success statuses)
- `2` = AWB inválido
- `3` = falha de consulta (ERRO, COMPANY_NOT_REGISTERED)

Além disso, `COMPANY_NOT_REGISTERED` é separado em `companyNotRegisteredAwbs[]` e anexado no final.

**Mudança:** Adicionar prioridade `4` (mais baixa) para AWBs com `tracking_failed: true` — eles ficam sempre por último. Isso é feito dentro de `getStatusPriority`:

```ts
// Tracking failed (timeline vazia em todas as fontes) - priority 4 (very last)
if (awb.tracking_failed === true) {
  return 4;
}
```

---

### Bloco 4 — Propagar `tracking_failed` para o `AwbTimelineModal`

**Arquivo:** `src/components/air/AwbTimelineModal.tsx`

Adicionar prop `onTrackingResult?: (awb: string, failed: boolean) => void` ao componente. Após o `useQuery` completar (usando `useEffect` no resultado), chamar essa prop com o resultado.

**Arquivo:** `src/pages/Index.tsx` — onde `AwbTimelineModal` é renderizado

Passar a função `handleTrackingResult` que atualiza `awbsList`:

```ts
const handleTrackingResult = useCallback((awbNumber: string, failed: boolean) => {
  setAwbsList(prev =>
    prev.map(item =>
      item.awb === awbNumber ? { ...item, tracking_failed: failed } : item
    )
  );
}, []);
```

---

### Resumo das mudanças por arquivo

| Arquivo | Tipo de mudança |
|---|---|
| `src/pages/Index.tsx` | (1) Adicionar `tracking_failed?: boolean` em `AWBData`; (2) Badge na célula "Último Evento"; (3) Prioridade 4 em `getStatusPriority`; (4) Handler `handleTrackingResult` + prop passada ao modal |
| `src/components/air/AwbTimelineModal.tsx` | Adicionar prop `onTrackingResult` e disparar via `useEffect` ao obter resultado |

### Technical details

- O campo `tracking_failed` é **efêmero** — só é preenchido após o usuário abrir o modal de timeline do AWB. AWBs que nunca foram abertos não terão o flag.
- `saveToStorage` também persiste `tracking_failed` no `localStorage`, então ao recarregar a página, AWBs já identificados como falha continuam aparecendo no final (até uma nova consulta atualizar o status).
- O `AlertTriangle` já está importado em `AwbTimelineModal.tsx`. Em `Index.tsx` será necessário verificar se `AlertTriangle` já está nos imports do `lucide-react` — e adicionar caso não esteja.
- A ordenação por prioridade já usa `priorityA - priorityB` (linha 2087), então adicionar prioridade `4` funciona sem alterar o comparador.
