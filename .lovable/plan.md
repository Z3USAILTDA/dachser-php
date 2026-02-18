
# Manter AWBs com DLV visíveis por 5 dias após a entrega

## Contexto

Atualmente, o status `DLV` (Entregue) **não consta** na lista `allowedStatuses` do `filteredAwbs` (linha 1877 de `Index.tsx`). Isso significa que qualquer AWB com `DLV` desaparece da tela imediatamente ao receber esse status.

O comportamento desejado: AWBs com `DLV` devem permanecer visíveis por **5 dias** após a entrega, e só então sair da tela automaticamente — o mesmo padrão já existente para `ARR`.

---

## Referência: lógica já existente para ARR

O status `ARR` já segue exatamente esse padrão (linhas 1922–1934):

```typescript
if ((lastEventCode === "ARR" || lastEventCode.startsWith("ARR - ")) && !hasAlert) {
  const arrDatetime = (awb as any).arr_datetime;
  if (arrDatetime) {
    const hoursElapsed = (now - new Date(arrDatetime).getTime()) / (1000 * 60 * 60);
    if (hoursElapsed >= ARR_RETENTION_HOURS) {
      return false;
    }
  }
}
```

Para `DLV`, o campo de referência de data será o `last_check` (que mapeia `scraped_at` de `t_aereo_ws`) — ou seja, a data/hora em que o sistema detectou o DLV pela última vez. É a referência mais confiável disponível no frontend sem precisar de alterações no backend.

---

## Alteração: `src/pages/Index.tsx` — única mudança necessária

### Passo 1 — Adicionar `DLV` em `allowedStatuses`

```typescript
// Antes (linha ~1908, não contém DLV):
const allowedStatuses = [
  "BKD", "BKF", "AWB", "RCS", "MAN", "DEP", "FOH", "TFD", "RCT", "RCP", "PRE",
  "LOF", "ARRT", "TDE", "ARR", "ARR - DESTINO", "ARR - CONEXAO", "ARR - CONEXÃO",
  "RCF", "DIS", "OFLD", "NIL", "NIF", "ERRO", "COMPANY_NOT_REGISTERED", "AWB_INVALID",
  "FFM", "AUD",
];

// Depois (adicionar DLV e POD):
const allowedStatuses = [
  "BKD", "BKF", "AWB", "RCS", "MAN", "DEP", "FOH", "TFD", "RCT", "RCP", "PRE",
  "LOF", "ARRT", "TDE", "ARR", "ARR - DESTINO", "ARR - CONEXAO", "ARR - CONEXÃO",
  "RCF", "DIS", "OFLD", "NIL", "NIF", "ERRO", "COMPANY_NOT_REGISTERED", "AWB_INVALID",
  "FFM", "AUD",
  "DLV",  // ← NOVO: mantido por 5 dias após entrega
];
```

### Passo 2 — Adicionar regra de expiração para DLV (logo após o bloco de ARR)

Inserir imediatamente após o bloco `if ((lastEventCode === "ARR" || ...)`:

```typescript
// DLV (Entregue): permanece na tabela por 5 dias após a entrega
const DLV_RETENTION_DAYS = 5;
if (lastEventCode === "DLV" || statusToCheck === "DLV") {
  const dlvDate = awb.last_check ? new Date(awb.last_check).getTime() : null;
  if (dlvDate) {
    const daysElapsed = (Date.now() - dlvDate) / (1000 * 60 * 60 * 24);
    if (daysElapsed >= DLV_RETENTION_DAYS) {
      return false; // Mais de 5 dias desde o DLV → remove da tela
    }
  }
  // Se não tem data de referência ou ainda dentro de 5 dias → mantém na tela
}
```

---

## Impacto nos DashboardCards

Os `DashboardCards` (total monitorados, em trânsito, etc.) excluem `DLV` explicitamente no array `excludedStatuses`. Esse comportamento é **correto e deve ser mantido** — AWBs em DLV com menos de 5 dias aparecem na tabela principal, mas **não contam nos cards de métricas** (não são "ativos" do ponto de vista operacional).

Nenhuma mudança nos DashboardCards é necessária.

---

## Resumo do comportamento

| Situação | Resultado |
|---|---|
| AWB recebe DLV hoje | Aparece na tabela com fundo verde (estilo `isDelivered` já existente) |
| AWB com DLV há 3 dias | Ainda visível na tabela |
| AWB com DLV há 5+ dias | Removido automaticamente da tabela |
| AWB com DLV sem `last_check` | Mantido por segurança (sem remoção) |

## Arquivo a editar

- `src/pages/Index.tsx` — duas alterações cirúrgicas dentro do `filteredAwbs` useMemo
