

## Plano: Corrigir mapeamento de `id_rm` e `nd` na `t_dados_rm`

### Problema
Atualmente, quando `id_rm` não existe, o sistema coloca o `numero_spo` no lugar do `id_rm` (`id_rm: voucher.idRm || voucher.numeroSPO`). Além disso, o `numero_spo` não é enviado como parâmetro em nenhum dos chamadores, resultando em `nd` vazio.

**Comportamento errado:**
- `id_rm` = numero_spo (quando id_rm não existe)
- `nd` = NULL (porque numero_spo não é passado)

**Comportamento correto esperado:**
- `id_rm` = id_rm real (se não existir, pode ficar vazio ou o próprio id_rm)
- `nd` = numero_spo (nunca vazio)

### Alterações

**1. Frontend — 3 arquivos** (passar `numero_spo` e corrigir `id_rm`)

| Arquivo | Mudança |
|---------|---------|
| `src/components/esteira/VoucherFinanceiroActions.tsx` | Passar `numero_spo: voucher.numeroSPO` e usar `id_rm: voucher.idRm` (sem fallback para numeroSPO) |
| `src/components/esteira/PagamentosTab.tsx` | Passar `numero_spo: pagamento.numero_spo` e usar `id_rm: pagamento.id_rm` (sem fallback) |
| `src/components/esteira/FaturasDoDiaTab.tsx` | Passar `numero_spo: fatura.numero_spo` e usar `id_rm: fatura.id_rm` (sem fallback) |

**2. Backend — `supabase/functions/mariadb-proxy/index.ts`**

- **Action `insert_dados_rm`** (linha ~8740): Garantir que `nd` recebe `numeroSpoRm` e que `id_rm` não recebe o SPO como fallback. Se `id_rm` não existir, usar o próprio `numero_spo` como `id_rm` apenas se realmente não houver `id_rm`.
- **Action `sync_baixa_remessa_to_dados_rm`** (linha ~8807): Já está correto (`v.id_rm || v.numero_spo` para id_rm e `v.numero_spo` para nd), mas manter consistência.

**Resumo da lógica corrigida:**
```
id_rm  = id_rm real (obrigatório, fallback para numero_spo apenas como último recurso)
nd     = numero_spo (sempre preenchido)
```

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `src/components/esteira/VoucherFinanceiroActions.tsx` | Adicionar `numero_spo`, manter `id_rm` sem fallback SPO |
| `src/components/esteira/PagamentosTab.tsx` | Idem |
| `src/components/esteira/FaturasDoDiaTab.tsx` | Idem |
| `supabase/functions/mariadb-proxy/index.ts` | Validar que `nd` sempre recebe o SPO |

