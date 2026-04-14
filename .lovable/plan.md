

## Plano: Gauge/Velocímetro para dados únicos

### Problema
Quando os 4 gráficos de área (Qtd. Files, Valor Total Mensal, Qtd. por Divisão Modal, Valor por Divisão Modal) possuem apenas 1 ponto de dado, a visualização fica ruim. O BarChart com barra única também não agradou.

### Solução
Criar um componente **GaugeChart** customizado usando SVG puro (arco semicircular) e aplicá-lo como fallback quando `data.length <= 1` nos 4 gráficos.

### Implementação

**1. Criar `src/components/charts/GaugeChart.tsx`**
- Componente SVG com arco semicircular (180°)
- Props: `value`, `label`, `color`, `maxValue` (opcional, default = value * 1.5)
- Arco de fundo em `muted/20`, arco preenchido com a cor do gráfico (amber ou success)
- Valor grande centralizado no meio do arco
- Label abaixo do valor
- Estilo dark theme consistente com o dashboard

**2. Editar `src/pages/olimpo/OlimpoFaturamento.tsx`**
- Importar `GaugeChart`
- Para cada um dos 4 gráficos, envolver com condicional:
  ```tsx
  {data.length <= 1 ? (
    <GaugeChart 
      value={data[0]?.Quantidade ?? 0} 
      label="Quantidade" 
      color={ZEUS_COLORS.amber} 
    />
  ) : (
    <AreaChart ...> {/* existente */} </AreaChart>
  )}
  ```
- Aplicar nas 4 seções: `chartMonthlyCount`, `chartMonthlyValor`, `divisionData` (qtd), `divisionData` (valor)

### Visual
O gauge terá aparência moderna: arco com gradiente sutil, número grande no centro em `font-bold`, sublabel em `text-muted-foreground`. Ocupará o mesmo espaço do gráfico (260px de altura).

