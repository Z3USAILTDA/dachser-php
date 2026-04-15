

## Plano: Redesign do cabeçalho KPI — layout mosaico assimétrico

### Estrutura atual
- Grid `1fr 1fr` com hero card à esquerda e 3 MiniKpiCards empilhados verticalmente à direita
- Hero card com `py-4 px-6`
- MiniKpiCards são barras horizontais com `py-3 px-4`

### Nova estrutura

```text
┌──────────────────────────────────┬─────────────────────────────┐
│                                  │ Processos   │  Var. vs mês  │
│   FATURAMENTO TOTAL              │  Faturados  │   anterior    │
│   R$ 12,3M                       ├─────────────┴───────────────┤
│   +5.2% vs mar/2025              │       Maior Cliente         │
│                                  │       R$ 2,1M — ACME Corp   │
└──────────────────────────────────┴─────────────────────────────┘
```

### Alterações

**Arquivo: `src/pages/olimpo/OlimpoFaturamento.tsx`**

**1. Grid principal (L300)**
- Mudar de `grid-cols-[1fr_1fr]` para `grid-cols-[3fr_2fr]` (~60/40)

**2. Hero card (L302-336)**
- Aumentar padding para `px-8 py-6`
- Valor principal de `text-4xl` para `text-5xl`
- Label de `text-[10px]` para `text-[11px]`
- Adicionar borda inferior dourada sutil com gradiente
- Ícone de `w-11 h-11` para `w-12 h-12`
- Adicionar sombra interna dourada sutil

**3. Bloco direito (L339-364)**
- Substituir `grid-cols-1 gap-3` por layout mosaico:
  - Linha superior: `grid-cols-2 gap-3` com 2 mini cards
  - Linha inferior: 1 card "Maior Cliente" full-width
- O bloco deve usar `flex flex-col gap-3` para organizar as duas linhas

**4. MiniKpiCard (L562-590)**
- Aumentar padding para `px-5 py-4`
- Rounded de `rounded-xl` para `rounded-2xl`
- Adicionar sombra sutil `boxShadow: '0 4px 20px rgba(0,0,0,0.3)'`
- Borda mais definida `rgba(255,255,255,0.08)`

**5. Card "Maior Cliente"**
- Usar estilo diferenciado: padding `px-5 py-4`, full-width
- Borda dourada sutil `rgba(242,160,7,0.1)`
- Valor e subtitle na mesma linha para economizar altura

### O que NÃO muda
- Dados, lógica, cores, modais, gráficos abaixo do cabeçalho

