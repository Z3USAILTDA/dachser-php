## Objetivo

Corrigir o filtro `roleFilteredVouchers` em `src/pages/esteira/EsteiraIndex.tsx` para que usuários com múltiplos roles (ex.: Cleiciane = `OPERACAO,SUPERVISOR`) vejam a **união** das etapas correspondentes a cada role, e não apenas a do primeiro `if` que casar.

Adicionalmente, inverter a ordem de avaliação para que **SUPERVISOR seja o último** na hierarquia, conforme sua diretriz — assim as etapas operacionais entram primeiro no conjunto de visibilidade.

## Comportamento esperado após a mudança


| Roles do usuário                  | Etapas visíveis (default, sem filtro de etapa)                                 |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `OPERACAO`                        | `OPERACAO`, `A_PROCESSAR`                                                      |
| `FISCAL`                          | `FISCAL`, `AJUSTE_FISCAL` + onde é `responsavelFiscalUserId`                   |
| `SUPERVISOR`                      | `SUPERVISOR` + onde é `responsavelSupervisorUserId`                            |
| `OPERACAO,SUPERVISOR` (Cleiciane) | `OPERACAO`, `A_PROCESSAR`, `SUPERVISOR` + onde é `responsavelSupervisorUserId` |
| `FISCAL,SUPERVISOR`               | `FISCAL`, `AJUSTE_FISCAL`, `SUPERVISOR` + responsabilidades                    |
| `FINANCEIRO` (com ou sem outros)  | continua vendo TODOS (mantém comportamento atual)                              |
| `ADMIN` / `GESTOR_*`              | continua vendo TODOS (mantém comportamento atual)                              |


Quando o usuário escolhe um filtro de etapa específico (`filters.etapa !== "all"`), a restrição por role é desligada, igual hoje.

## Mudança técnica

**Arquivo:** `src/pages/esteira/EsteiraIndex.tsx` — bloco `roleFilteredVouchers` (linhas ~1205-1250).

Substituir os `if` em cascata por **construção de um Set de etapas permitidas** (união) + verificação de responsabilidade direta:

```ts
const roleFilteredVouchers = useMemo(() => {
  const hasSearchQuery = filters.search && filters.search.trim().length > 0;

  // ADMIN / GESTOR / FINANCEIRO / busca ativa → vê tudo
  if (isAdmin || isGestor || isFinanceiro || hasSearchQuery) {
    // FINANCEIRO mantém ordenação priorizando FINANCEIRO/ROBO/SUPERVISOR
    if (isFinanceiro && !isAdmin && !isGestor) { /* sort atual */ }
    return vouchers;
  }

  // Filtro manual de etapa desliga restrição de role
  if (filters.etapa && filters.etapa !== "all") return vouchers;

  // União de etapas (SUPERVISOR avaliado por último)
  const etapasPermitidas = new Set<EtapaAtual>();
  if (isOperacao) { etapasPermitidas.add("OPERACAO"); etapasPermitidas.add("A_PROCESSAR"); }
  if (isFiscal)   { etapasPermitidas.add("FISCAL"); etapasPermitidas.add("AJUSTE_FISCAL"); }
  if (isSupervisor) { etapasPermitidas.add("SUPERVISOR"); }

  // Sem nenhum role conhecido → view-only de tudo
  if (etapasPermitidas.size === 0) return vouchers;

  return vouchers.filter(v =>
    etapasPermitidas.has(v.etapaAtual) ||
    (isFiscal && v.responsavelFiscalUserId === currentUserId) ||
    (isSupervisor && v.responsavelSupervisorUserId === currentUserId)
  );
}, [vouchers, currentUserId, isAdmin, isGestor, isOperacao, isFiscal, isSupervisor, isFinanceiro, filters.etapa, filters.search]);
```

## Memória

Atualizar `mem://vouchers/ui-spec-and-access-v4` registrando:

- Multi-role usa **união** de etapas, não cascata.
- Ordem de avaliação: OPERACAO → FISCAL → FINANCEIRO -> SUPERVISOR (supervisor é o último na hierarquia).
- FINANCEIRO/ADMIN/GESTOR continuam com visão total.

## Validação

Após o ajuste, ao logar como `cleiciane.faconi` em `/fin/esteira`:

- Ela verá os **9 cards `A_PROCESSAR**` (vindos de `t_dados_financeiro_voucher`) imediatamente.
- Quando houver vouchers em SUPERVISOR no futuro, ela verá ambos simultaneamente.
- `test.test3` continua vendo o mesmo (apenas OPERACAO/A_PROCESSAR).