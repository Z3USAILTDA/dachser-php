

## Diagnóstico: Voucher 20261881179 Duplicado

### O que aconteceu
Nos logs de rede, o botão de importação disparou **duas chamadas consecutivas** para `import_voucher_from_rm` com o mesmo ND `20261881179`, em um intervalo de ~4 segundos:
- **19:44:43** → criou `e39ce75b-...` (OPERACAO)
- **19:44:47** → criou `96060be6-...` (OPERACAO)

Depois, apenas o segundo (`96060be6`) foi editado (tipo_documento alterado para SPO, enviado para FISCAL). Por isso aparecem dois registros com etapas diferentes.

### Causa raiz
O handler `import_voucher_from_rm` no `mariadb-proxy` **não verifica se já existe um voucher com o mesmo `numero_spo`** na tabela `t_vouchers` antes de inserir. Cada chamada gera um novo UUID e insere incondicionalmente.

### Correção proposta

**1. Backend — Adicionar verificação de duplicata no `import_voucher_from_rm`**

Antes do INSERT, consultar `t_vouchers` por `numero_spo = nd` com `sync_status = 'ATIVO'`. Se já existir, retornar o voucher existente em vez de criar um novo:

```sql
SELECT id FROM t_vouchers 
WHERE numero_spo = ? AND sync_status = 'ATIVO' 
LIMIT 1
```

Se encontrar, retornar `{ success: true, voucherId: existente, numeroSPO: nd, alreadyExists: true }`.

**2. Frontend — Desabilitar botão durante importação (debounce)**

Nos componentes `EsteiraIndex.tsx` e `BacklogTab.tsx`, adicionar um estado `importing` que desabilita o botão enquanto a chamada está em andamento, prevenindo duplo-clique.

**3. Limpeza — Remover o voucher duplicado**

Executar a exclusão do voucher órfão `e39ce75b-0763-46a9-bce3-b0d034eb95cc` (o que ficou em OPERACAO sem edições) e seus logs associados.

### Arquivos afetados
- `supabase/functions/mariadb-proxy/index.ts` — check de duplicata no handler `import_voucher_from_rm`
- `src/pages/esteira/EsteiraIndex.tsx` — debounce no botão de importar
- `src/components/esteira/BacklogTab.tsx` — debounce no botão de importar

