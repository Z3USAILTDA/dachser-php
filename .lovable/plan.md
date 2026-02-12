
## Implementar Fluxo Automático: DEP → CCT com Sincronização LeadComex a cada 1 minuto

### Contexto Técnico Atual

O CCT (Controle de Carga Terminal) hoje:
1. **Filtra dados por data hardcoded**: Busca apenas processos com `data_insert >= 2026-01-26 00:00:00 AND < 2026-01-27` do `t_master_dados`
2. **Fonte desatualizada**: Continua usando `t_status_aereo` como base, mas o tracking aereo já migrou para `t_aereo_ws`
3. **Sincronização manual**: LeadComex é chamado sob demanda, não continuamente

Isso significa:
- AWBs que recebem DEP NO TRACKING não aparecem automaticamente no CCT
- Processos que já passaram por DEP e evoluíram para ARR, ATA, RCF, DLV não são mostrados
- Dados não são enriquecidos periodicamente da LeadComex

### Solução Proposta (4 Componentes)

#### 1. **Migrar fonte do CCT para `t_aereo_ws`** (mariadb-proxy)
Atualmente: busca `t_master_dados` filtrando por data
Novo: buscar diretamente de `t_aereo_ws` usando sliding window de 30 dias

- **Step 1** (`get_cct_shipments` linha 2755): 
  - Remover filtro hardcoded `2026-01-26`
  - Substituir por: `data_insert >= NOW() - INTERVAL 30 DAY`
  - Buscar de `t_aereo_ws` HAWBs com status >= DEP (DEP, ARR, ATA, RCF, NFD, AWD, DLV, POD)
  - JOIN com `t_master_dados` para enriquecer (cliente, analista, tratamento)
  - Resultado: **qualquer HAWB que recebeu DEP nos últimos 30 dias aparece no CCT automaticamente**

- **Step 2** (`get_cct_pending_hawbs` linha 11103):
  - Mesmo padrão: remover data hardcoded
  - Usar sliding window de 30 dias
  - Identificar HAWBs com `leadcomex_status = 'pending'` ou não enriquecidos nas últimas 4 horas
  - Resultado: **lista pronta para sincronização de 1 minuto**

#### 2. **Criar Cron Job para LeadComex a cada 1 minuto** (SQL)
Executar via `pg_cron` + `pg_net`:
```sql
SELECT cron.schedule(
  'leadcomex-sync-every-minute',
  '* * * * *',
  $$ SELECT net.http_post(
    url:='https://project.supabase.co/functions/v1/leadcomex-sync',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY"}'::jsonb,
    body:='{"action":"enrich","limit":30,"prioritize_pending":true}'::jsonb
  ) AS request_id; $$
);
```

#### 3. **Otimizar `leadcomex-sync` para alta frequência** (edge function)
Arquivo: `supabase/functions/leadcomex-sync/index.ts`

Adicionar lógica na action `enrich`:
- Limitar a 20-30 HAWBs por execução (em vez de processar tudo)
- Pular HAWBs já enriquecidos com sucesso nas últimas 4 horas
- Priorizar `leadcomex_status = 'pending'`
- Rate limiting para não sobrecarregar API LeadComex

Resultado: **execução rápida, compatível com 1 minuto**

#### 4. **Ajustar visibilidade no CCT Dashboard** (React)
Arquivo: `src/pages/cct/CCTDashboard.tsx`

Hoje filtra por `data_insert >= 2026-01-26`, que vai mudar automaticamente quando o backend usar sliding window.
- O dashboard já terá acesso a processos com status pós-DEP (ARR, ATA, RCF, etc.)
- Nenhuma alteração no componente React necessária

### Sequência de Implementação

1. **Atualizar `mariadb-proxy`** (2 queries):
   - Linha 2758: Substituir `WHERE data_insert >= '2026-01-26 00:00:00' AND data_insert < '2026-01-27 00:00:00'` por `WHERE data_insert >= NOW() - INTERVAL 30 DAY`
   - Linha 11105: Mesma alteração

2. **Criar migration SQL** para cron:
   - Adicionar cron job via `pg_cron`

3. **Otimizar `leadcomex-sync`**:
   - Adicionar batch limit (30 HAWBs)
   - Adicionar skip logic (4h de cooldown)
   - Adicionar flag `prioritize_pending`

### Resultado Final

```
AW Recebe DEP no t_aereo_ws 
    ↓
Imediatamente aparece no CCT (sliding window 30 dias)
    ↓
A cada 1 minuto, LeadComex consulta HAWBs pendentes
    ↓
Dados de peso, volume, CNPJ, status CCT, bloqueios atualizados
    ↓
Processos com status ENTREGUE saem após 48h
```

### Tabela de Mudanças

| Arquivo | Linhas | Mudança |
|---------|--------|---------|
| `supabase/functions/mariadb-proxy/index.ts` | 2758, 11105 | Remover data hardcoded, adicionar sliding window |
| `supabase/functions/leadcomex-sync/index.ts` | action `enrich` | Adicionar batch limit, skip logic, prioritize |
| SQL (migration) | N/A | Criar cron `leadcomex-sync-every-minute` |

