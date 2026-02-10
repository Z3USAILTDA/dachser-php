

# Ajustes na Esteira de Vouchers/SPO

## 1. Voucher CONCLUIDO sai da tela apos 24h sem retorno de comprovante

**Problema:** Quando um voucher atinge a etapa CONCLUIDO, ele permanece visivel na tela principal indefinidamente. O comportamento correto e: apos 24 horas sem que o status do comprovante seja alterado para "PENDENTE", o voucher deve sair da tela principal e aparecer apenas no historico de baixas.

**Solucao:** Filtrar na query `get_vouchers_ativos` e `get_vouchers_esteira` os vouchers CONCLUIDO com mais de 24h de `updated_at` sem status_comprovante = "PENDENTE". Vouchers CONCLUIDO com menos de 24h ou com comprovante PENDENTE continuam visiveis.

**Arquivos:**
- `supabase/functions/mariadb-proxy/index.ts` -- Nas actions `get_vouchers_esteira` e `get_vouchers_ativos`, adicionar filtro: excluir vouchers onde `etapa_atual = 'CONCLUIDO' AND updated_at < NOW() - INTERVAL 24 HOUR AND (status_comprovante IS NULL OR status_comprovante != 'PENDENTE')`

---

## 2. Corrigir id_rm na t_dados_rm (preenchido com numero_spo em vez de id_rm)

**Problema:** Ao inserir em `t_dados_rm`, o campo `id_rm` esta recebendo o `numero_spo` do voucher em vez do valor real de `id_rm` (que vem da tabela `t_dados_financeiro_voucher`). Isso acontece porque o mapeamento `mapVoucherFromDB` (linha 714 de EsteiraIndex.tsx) NAO inclui o campo `idRm` a partir de `v.id_rm`. O campo so e preenchido para vouchers pendentes do RM. Resultado: `voucher.idRm` e sempre `undefined`, e o fallback `voucher.idRm || voucher.numeroSPO` sempre usa `numeroSPO`.

**Solucao:** Adicionar `idRm: v.id_rm || null` ao mapeamento `mapVoucherFromDB` em `EsteiraIndex.tsx`.

**Arquivos:**
- `src/pages/esteira/EsteiraIndex.tsx` -- Na funcao `mapVoucherFromDB` (linha ~714), adicionar o campo `idRm: v.id_rm || null` ao objeto retornado

---

## Secao Tecnica

### Filtro 24h para CONCLUIDO (item 1)

Nas queries `get_vouchers_esteira` e `get_vouchers_ativos`, adicionar condicao WHERE:

```text
AND NOT (
  v.etapa_atual = 'CONCLUIDO' 
  AND v.updated_at < NOW() - INTERVAL 24 HOUR 
  AND (v.status_comprovante IS NULL OR v.status_comprovante != 'PENDENTE')
)
```

Isso garante que:
- Vouchers CONCLUIDO com menos de 24h continuam visiveis (janela para retornar comprovante a pendente)
- Vouchers CONCLUIDO com comprovante retornado a PENDENTE permanecem visiveis independente do tempo
- Vouchers CONCLUIDO com mais de 24h e comprovante nao-pendente desaparecem da tela e ficam apenas no historico de baixas

### Correcao id_rm (item 2)

Na funcao `mapVoucherFromDB` falta o campo `idRm`. Adicionar entre as linhas existentes:

```text
idRm: v.id_rm || null,
```

Isso faz com que o valor correto de `id_rm` (vindo de `t_vouchers.id_rm`, que por sua vez veio de `t_dados_financeiro_voucher.id_rm`) seja propagado para o frontend e usado corretamente ao inserir em `t_dados_rm`.

