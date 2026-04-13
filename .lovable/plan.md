

## Plano: Melhorar visualização de identificação Master vs Individual no Robô

### Problema
Quando o robô identifica um arquivo (ex: `20263776675.pdf`), exibe apenas `SPO 20263776675` sem indicar se encontrou um voucher individual ou se redirecionou para um Master (via filho). Isso confunde o usuário.

### Contexto técnico
O backend (`find_voucher_by_spo`) já retorna `is_master`, `matched_via_child` e `child_spo` quando o match é via filho→master. Porém o frontend ignora esses campos e exibe apenas o badge genérico.

### Solução
Alterar o badge de status em `ComprovanteRobot.tsx` para diferenciar visualmente:

1. **Voucher Individual**: Badge verde `SPO 20263776675` (como hoje)
2. **Voucher Master (match direto)**: Badge azul/roxo `MASTER · SPO 20263776675`
3. **Voucher Master (match via filho)**: Badge azul/roxo `MASTER · SPO 20262478837` com subtexto explicativo: `Identificado via filho 20263776675`

### Alteração

**Arquivo:** `src/pages/esteira/ComprovanteRobot.tsx`

- Na interface `VoucherMatch`, adicionar campos `is_master`, `matched_via_child`, `child_spo` (já vêm do backend)
- Na função `getStatusBadge`, quando `voucherInfo.is_master`:
  - Badge com cor diferenciada (azul/roxo) e prefixo "MASTER"
  - Se `matched_via_child`, mostrar texto adicional indicando o filho usado no match
- Na info abaixo do badge, incluir o `child_spo` quando aplicável

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/esteira/ComprovanteRobot.tsx` | Badge diferenciado para Master vs Individual |

Uma alteração em 1 arquivo, ~15 linhas.

