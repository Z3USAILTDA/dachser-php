

## Plano: Voucher Master — Exibir vouchers vinculados nos detalhes + corrigir nome do Master

### Problema 1: Detalhes do Master não mostram vouchers vinculados
A página `VoucherDetailsView.tsx` não possui nenhuma seção para buscar e exibir os vouchers filhos quando o voucher é um Master. O endpoint `get_voucher_filhos` já existe no backend mas nunca é chamado na view de detalhes.

### Problema 2: Nome do Master na tela inicial
A tabela exibe `nomeMaster` apenas quando `voucher.isMaster && voucher.nomeMaster` (linha 513). Alguns masters têm `nome_master` como `null` no banco (ex: `MASTER-SQKBFLA9`), logo o nome não aparece. Isso é parcialmente um problema de dados, mas podemos melhorar a exibição.

---

### Alterações

**1. `src/components/esteira/VoucherDetailsView.tsx`**
- Adicionar seção "Vouchers Vinculados" que aparece quando `voucher.isMaster === true`
- Ao montar, chamar `get_voucher_filhos` com `master_id = voucher.id`
- Exibir tabela simples com: SPO, Fornecedor, Valor, Vencimento, Etapa
- Cada linha clicável para navegar ao detalhe do filho (`/fin/esteira/voucher/{id}`)

**2. `src/components/esteira/VoucherTable.tsx`** (linha 513)
- Alterar condição de exibição do `nomeMaster`:
  - Se `isMaster` e `nomeMaster` existe → mostrar `nomeMaster`
  - Se `isMaster` e `nomeMaster` é null → mostrar "Master" (já coberto pelo badge)
  - Manter o badge Master sempre visível

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `src/components/esteira/VoucherDetailsView.tsx` | Seção "Vouchers Vinculados" com fetch de filhos |
| `src/components/esteira/VoucherTable.tsx` | Nenhuma mudança necessária (badge já funciona, `nomeMaster` null é dado faltante) |

