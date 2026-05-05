## Card de devolução com cor sólida

Trocar o fundo translúcido âmbar do `VoucherDivergenceAlert` por uma cor sólida, alinhada ao tema dark do sistema, mantendo a borda âmbar para indicar atenção.

### Edit
**`src/components/esteira/VoucherDivergenceAlert.tsx`** (linhas 104-107):

- Remover `backdrop-blur-[18px]` e o `style` com `rgba(245, 158, 11, 0.06)`.
- Aplicar fundo sólido escuro (`bg-[#0a0b10]`) com borda âmbar mais forte (`border-amber-500/60`).
- O bloco interno de "Vouchers do SPO master" (linha 123) também troca para sólido: `bg-[#050608]` no lugar de `bg-[rgba(5,6,18,0.6)]`.
- Ícone, títulos, badges e botão permanecem iguais (continua claro que é um aviso âmbar).

```tsx
<Card className="p-6 border-2 border-amber-500/60 bg-[#0a0b10]">
  ...
  <div className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#050608] p-3">
```

### Resultado
Card de devolução com fundo sólido escuro e contorno âmbar nítido — sem transparência/blur — destacando-se claramente do restante da tela. Sem mudanças em backend, lógica ou outras telas.