

## Plano: Trocar Gauge por Donut e remover brilho

### Mudanças

**1. Reescrever `src/components/charts/GaugeChart.tsx` → `DonutSingleChart.tsx`**
- Substituir o arco semicircular (gauge) por um **donut completo (360°)** usando SVG `circle` com `stroke-dasharray`/`stroke-dashoffset`
- Círculo de fundo em `rgba(255,255,255,0.06)`, círculo preenchido com a cor passada
- Valor grande centralizado no meio do donut
- Label abaixo do valor
- **Sem drop-shadow, sem filter, sem glow** — visual limpo e flat
- Mesmas props: `value`, `label`, `color`, `maxValue?`, `valueFormatter?`

**2. Editar `src/pages/olimpo/OlimpoFaturamento.tsx`**
- Trocar import de `GaugeChart` para o novo `DonutSingleChart`
- Atualizar as 4 referências (linhas ~271, ~334, ~397, ~415) para usar `DonutSingleChart`
- Remover o `boxShadow` com glow dos tooltips customizados (linhas ~62 e ~84): remover a parte `0 0 20px rgba(242,160,7,0.1)` mantendo apenas `0 10px 30px rgba(0,0,0,0.5)`

### Visual
Donut circular completo, espessura ~14px, valor bold no centro, label em muted abaixo. Sem efeitos de brilho em nenhum lugar.

