

## Plano: Busca por nº do voucher vinculado e nome do Master

### Problema
O filtro de busca atual (linhas 1260-1265 de `EsteiraIndex.tsx`) só compara com `voucher.numeroSPO` e `voucher.nomeMaster`. Quando o usuário digita o SPO de um voucher filho, o Master correspondente não aparece nos resultados.

### Solução

**`src/pages/esteira/EsteiraIndex.tsx`**

1. Antes do `filterVouchers`, criar um `useMemo` que monta um `Map<string, string[]>` de `masterId → [child SPOs]` a partir da própria lista de vouchers (usando `voucherMasterId`):
```
masterChildSPOs: Map onde key = id do master, value = array de numeroSPO dos filhos
```

2. No bloco de busca (linhas 1260-1265), além de `spoMatch` e `masterNameMatch`, adicionar:
   - Se o voucher é Master (`voucher.isMaster`), verificar se algum SPO filho contém/começa com o texto buscado (consultando o map)
   - Resultado: buscar "SPO-123" encontra tanto o voucher filho quanto o Master que o contém

### Arquivo alterado
| Arquivo | Alteração |
|---------|-----------|
| `src/pages/esteira/EsteiraIndex.tsx` | `useMemo` para map de filhos + lógica de busca expandida |

### Lógica de match atualizada
```
spoMatch || masterNameMatch || childSPOMatch
```
Onde `childSPOMatch` = voucher é master E algum SPO filho começa com o texto buscado.

