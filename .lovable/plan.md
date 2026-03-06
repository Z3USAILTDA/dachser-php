

# Plano: LeadComex - Consulta contínua mesmo após falhas

## Diagnóstico

Analisei o fluxo completo do cron `leadcomex-sync-every-minute`. O comportamento **já é** de re-consultar HAWBs que falharam - eles são depriorizados (ordenados por `recent_failures ASC`) mas nunca excluídos permanentemente. A única exclusão é para HAWBs com status `ENTREGUE` ou com enriquecimento **bem-sucedido** nas últimas 4h.

No entanto, há dois ajustes para garantir o comportamento desejado:

## Alterações

### 1. Remover limite de falhas recentes como fator de exclusão implícita

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (action `get_cct_pending_hawbs`)

Atualmente a query com `prioritize_pending` aplica cooldown de 4h apenas para **sucessos**, mas a ordenação por `recent_failures ASC` pode fazer HAWBs com muitas falhas ficarem sempre no final da fila e nunca serem selecionados (já que o `LIMIT 5` pega sempre os com menos falhas).

**Solução**: Adicionar um cooldown de **1h** para falhas também, evitando re-consultar o mesmo HAWB que falhou há poucos minutos, mas garantindo que ele volte à fila na rodada seguinte (~1h depois):

```sql
AND NOT EXISTS (
  SELECT 1 FROM t_leadcomex_enrichment_logs lel
  WHERE lel.hawb = m.hawb
  AND lel.success = 0
  AND lel.created_at >= NOW() - INTERVAL 1 HOUR
)
```

Isso substitui a lógica atual de deprioritização por `fail_count`, tornando o comportamento mais previsível: falhou → espera 1h → tenta de novo.

### 2. UI: Mostrar status "Aguardando retry" em vez de "Não encontrado" permanente

**Arquivo**: `src/components/cct/LeadComexStatusBadge.tsx`

Adicionar um estado `retrying` que mostre "Aguardando nova consulta" quando o status é `failed`, indicando visualmente que o sistema vai tentar novamente.

### 3. Atualizar o hook `useCCTData.ts`

Mapear o `leadcomex_status` para considerar que `failed` não é final - é apenas "ainda não encontrado, vai tentar de novo".

## Arquivos a modificar

1. `supabase/functions/mariadb-proxy/index.ts` - Cooldown de 1h para falhas no `get_cct_pending_hawbs`
2. `src/components/cct/LeadComexStatusBadge.tsx` - Novo visual para retry pendente

