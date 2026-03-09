

## Problema

O status na tabela principal está errado porque o backend (`mariadb-proxy`, linhas 3614-3619) **descarta o status derivado do tracking** (ex: "MANIFESTADA" do DEP, "EM_AREA_TRANSFERENCIA" do RCF) quando o LeadComex não retornou dados, substituindo-o por `'AGUARDANDO_CONSULTA'`. Se a RFB também não tiver dados para aquele MAWB, o status fica incorreto.

A lógica atual é:
1. Tracking → status correto (ex: `MANIFESTADA`)
2. LeadComex não chamado/falhou → **sobrescreve** com `AGUARDANDO_CONSULTA` ❌
3. RFB sem dados → status fica `AGUARDANDO_CONSULTA` ❌

## Solução

### Backend: Preservar status do tracking quando LeadComex não tem dados

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` (linhas 3608-3620)

Alterar a lógica para **nunca descartar** o status derivado do tracking. O LeadComex deve **enriquecer** o status (se tiver algo mais avançado), não substituí-lo por "aguardando":

```tsx
// ANTES (bugado):
let statusCctOficial = row.status_cct_oficial; // ex: 'MANIFESTADA'
if (leadcomexInfo?.success && leadcomexInfo.status_cct) {
  statusCctOficial = leadcomexInfo.status_cct;
} else if (leadcomexInfo && !leadcomexInfo.success) {
  statusCctOficial = 'AGUARDANDO_CONSULTA'; // ← descarta tracking!
} else if (!leadcomexInfo) {
  statusCctOficial = 'AGUARDANDO_CONSULTA'; // ← descarta tracking!
}

// DEPOIS (correto):
let statusCctOficial = row.status_cct_oficial; // Preserva tracking
if (leadcomexInfo?.success && leadcomexInfo.status_cct) {
  // LeadComex tem dados - usar se mais avançado
  const trackingOrder = CCT_STATUS_ORDER[statusCctOficial] || 0;
  const leadcomexOrder = CCT_STATUS_ORDER[leadcomexInfo.status_cct] || 0;
  if (leadcomexOrder > trackingOrder) {
    statusCctOficial = leadcomexInfo.status_cct;
  }
}
// RFB check continua igual (linhas 3622-3629)
```

### Frontend: Simplificar lógica na coluna Status

**Arquivo:** `src/components/cct/ProcessosTable.tsx` (linhas 227-269)

Com o backend retornando o status correto, simplificar a coluna de Status para sempre mostrar o `StatusBadge` com o melhor status disponível (tracking + RFB + LeadComex já consolidados no backend), mostrando `LeadComexStatusBadge` apenas quando o status for literalmente `'AGUARDANDO_CONSULTA'` ou `'AGUARDANDO_MANIFESTACAO'`:

```tsx
const statusOficial = processo.status_atual?.status_cct_oficial || '';
const isAguardando = !statusOficial || 
  statusOficial === 'AGUARDANDO_CONSULTA' || 
  statusOficial === 'AGUARDANDO_MANIFESTACAO';

if (isAguardando) {
  return <LeadComexStatusBadge status={processo.shipment.leadcomex_status || 'pending'} ... />;
}
return <StatusBadge status={statusOficial} />;
```

Isso resolve o problema na raiz: o tracking já sabe que o processo está "MANIFESTADA" (DEP) ou "EM_AREA_TRANSFERENCIA" (RCF), e essa informação não será mais perdida.

