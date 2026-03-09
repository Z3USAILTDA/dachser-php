

## Fix: Normalizar aparência dos eventos RFB na timeline

### Problema
Eventos RFB estão renderizados com estilo diferente (borda tracejada, fundo mais apagado) porque têm `nivel_confianca === "COMPLEMENTAR"`. O usuário quer que todos os eventos tenham a mesma aparência visual, diferenciando-se apenas pelo badge de fonte (RFB vs LeadComex).

### Correção
**Arquivo:** `src/components/cct/EventTimeline.tsx` (linhas 218-221)

Remover a condição especial para `COMPLEMENTAR` no card styling, aplicando sempre o estilo padrão com as cores baseadas no código do evento:

```tsx
// Antes:
evento.nivel_confianca === "COMPLEMENTAR" 
  ? "bg-[rgba(255,255,255,0.02)] border-dashed border-[rgba(255,255,255,0.08)]" 
  : cn("bg-[rgba(255,255,255,0.03)]", colors.card)

// Depois:
cn("bg-[rgba(255,255,255,0.03)]", colors.card)
```

Também remover o badge "Complementar" (linhas 231-234) que aparece ao lado do badge de fonte, já que não deve haver diferenciação visual além da fonte.

