

## Plano: Renomear "Vouchers/SPO" e tornar "Origem do Processo" obrigatório

### Alteração 1 — Renomear no menu filho e título da tela

**Locais a alterar:**

1. **`src/pages/Dashboard.tsx`** (linha 135): Mudar `"Voucher/SPO"` para `"Esteira Vouchers/SPO"` — este é o nome do item filho no menu do Dashboard.

2. **`src/pages/esteira/EsteiraIndex.tsx`** (linha 1856): Mudar `"Intelligent Logistics — Vouchers/SPO"` para `"Intelligent Logistics — Esteira Vouchers/SPO"` — este é o subtítulo/título da tela principal.

### Alteração 2 — Campo "Origem do Processo" obrigatório

**Arquivo:** `src/components/esteira/CreateVoucherDialog.tsx`

1. **Validação no submit** (após linha 395, dentro do bloco `!isDraft`): Adicionar verificação:
   ```typescript
   if (!origemProcesso) {
     toast({
       title: "Erro de validação",
       description: "Origem do Processo é obrigatória",
       variant: "destructive",
     });
     return;
   }
   ```

2. **Label visual** (linha 923-924): Adicionar asterisco vermelho ao label para indicar campo obrigatório:
   ```tsx
   <Label className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
     Origem do Processo <span className="text-destructive">*</span>
   </Label>
   ```

### Arquivos alterados
- `src/pages/Dashboard.tsx`
- `src/pages/esteira/EsteiraIndex.tsx`
- `src/components/esteira/CreateVoucherDialog.tsx`

