

## Plano: Alinhar visual do Faturamento ao Olimpo Cobrança

### Problemas identificados

1. **Tooltip "R$ NaN"** — O `DarkTooltip` customizado tem bug com valores monetários. No Cobrança, o tooltip usa `contentStyle` inline no componente `<Tooltip>` do Recharts, não um componente custom
2. **Proporções dos gráficos** — Faturamento usa alturas 260/240/220px; Cobrança usa 320px
3. **Estilo do tooltip** — Cobrança: `backgroundColor: "rgba(0,0,0,0.85)"`, `border: "1px solid rgba(255,255,255,0.15)"`, `borderRadius: 8`; Faturamento usa componente custom com classes Tailwind
4. **Donut chart** — Precisa de `labelLine={false}` como no Cobrança
5. **Bar sizes** — Cobrança usa `barSize={28}`; Faturamento usa `maxBarSize` variável

### Alteração — Arquivo único

**`src/pages/olimpo/OlimpoFaturamento.tsx`**

1. **Remover `DarkTooltip`** — Substituir por `contentStyle`/`labelStyle`/`formatter` inline em cada `<Tooltip>`, exatamente como no Cobrança:
   ```tsx
   <Tooltip 
     contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
     labelStyle={{ color: "#fff" }}
     formatter={(v: number) => formatBRL(v)}
   />
   ```

2. **Padronizar alturas** — Todos os gráficos com `height={320}` (como Cobrança)

3. **Donut chart** — Adicionar `labelLine={false}` e ajustar `outerRadius={110}` / `innerRadius={60}` (como Cobrança)

4. **Padronizar barSize** — Usar `barSize={28}` nos gráficos de barras simples

5. **Tooltip do PieChart** — Usar mesmo `contentStyle` + `formatter` do Cobrança

6. **Legend** — Usar `wrapperStyle={{ fontSize: 12 }}` em todos (como Cobrança usa `fontSize: 11-12`)

### Sem alteração
- Tipos de visualização (9 gráficos) permanecem idênticos
- Lógica de fetch/processamento inalterada
- KpiCard e ChartCard já estão no padrão correto

### Resumo
| Arquivo | Ação |
|---------|------|
| `src/pages/olimpo/OlimpoFaturamento.tsx` | Fix tooltip NaN, padronizar alturas/tamanhos ao Cobrança |

