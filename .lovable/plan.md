

## Plano: Nome personalizado do Master + vouchers vinculados como subtítulo

### O que o usuário quer
1. Onde aparece `MASTER-XYFBZRG5` (o `numeroSPO`), mostrar o `nomeMaster` (nome escolhido pelo usuário)
2. Como subtítulo, listar os vouchers filhos vinculados ao master (ex: "SPO-001, SPO-002, SPO-003")
3. Corrigir detalhes para carregar os vinculados (bug `data.filhos` → `data.data`)

### Alterações

**1. `src/components/esteira/VoucherTable.tsx`**
- Linha 490: quando `isMaster && nomeMaster`, exibir `nomeMaster` como texto principal, e `numeroSPO` em parênteses ao lado ou como parte do texto
- Linhas 513-517: substituir o subtítulo atual (que mostra `nomeMaster`) por uma lista dos vouchers filhos vinculados
- Adicionar `useEffect` que, para cada voucher master visível, faz uma chamada `get_voucher_filhos` e armazena no estado local (com cache por `id` para evitar re-fetch)
- Exibir os SPOs dos filhos como subtítulo: ex: `"SPO-123, SPO-456, SPO-789"` truncado se necessário

**2. `src/components/esteira/VoucherDetailsView.tsx`** — linha 51
- Corrigir `data?.filhos` → `data?.data` para que os vouchers vinculados carreguem

### Detalhes técnicos

**Cache de filhos na tabela** — Para evitar N chamadas por render, usar um `useRef<Map>` que guarda os filhos já carregados por `masterId`. Carregar sob demanda apenas para masters visíveis na página atual.

**Exibição na coluna SPO**:
```
┌─────────────────────────────────┐
│ Nome Escolhido pelo Usuário  🟣 Master │
│ ↳ SPO-001, SPO-002, SPO-003           │
└─────────────────────────────────┘
```

Se `nomeMaster` for null, mantém `numeroSPO` como principal (comportamento atual).

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `src/components/esteira/VoucherTable.tsx` | Nome personalizado como título, filhos como subtítulo |
| `src/components/esteira/VoucherDetailsView.tsx` | Fix: `data?.data` em vez de `data?.filhos` |

