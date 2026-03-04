

# Adicionar opção ROD (Rodoviário) na Origem do Processo

## Alterações necessárias

### 1. `src/components/esteira/CreateVoucherDialog.tsx`
- Linha 87: Adicionar `"ROD"` ao enum do zod: `z.enum(["AIR", "SEA", "CHB", "ROD"])`
- Linha 135: Adicionar ao type: `type OrigemProcesso = "AIR" | "SEA" | "CHB" | "ROD"`
- Linha 271: Adicionar `"ROD"` ao array de modais válidos do RM
- Linha 901: O array já será atualizado pelo type, mas precisa adicionar o ícone para ROD (usaremos `Truck` do lucide-react)

### 2. `src/components/esteira/ProcessoOrigemCard.tsx`
- Adicionar entrada `ROD` no `ORIGEM_CONFIG` com ícone `Truck`, label "Rodoviário" e estilo visual distinto

### 3. `src/types/voucher.ts`
- Se houver type de `origemProcesso`, adicionar `"ROD"` (campo é string livre, sem impacto)

Nenhuma alteração de banco é necessária — o campo `origem_processo` é texto livre no MariaDB.

