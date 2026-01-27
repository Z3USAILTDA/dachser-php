

# Plano: Ativação do Tracking de Armadores com Automação via Cron Job

## Objetivo
Ativar o tracking de containers para todos os armadores mapeados (COSCO, MSC, Maersk, ZIM, etc.), aumentar o limite de chamadas API por execução de 5 para 10, e criar um cron job que execute sincronização + enriquecimento + rastreamento duas vezes por semana.

## Situação Atual

### Tracking Desativado
```text
// olimpo-proxy/index.ts - linha 537
const SKIP_API_CALLS = true;  // ← Impede chamadas à API JSONCargo
```

### Limite Baixo
```text
// olimpo-proxy/index.ts - linha 692
if (apiCallCount >= 5) {  // ← Limite de 5 chamadas por execução
```

### Cron Jobs Existentes
| Job | Frequência | Função |
|-----|------------|--------|
| anthropic-balance-check-daily | 12h diário | Saldo API |
| leadcomex-enrich-hourly | A cada hora | Enriquecer AWBs |
| leadcomex-10min-refresh | A cada 10min | Refresh HAWBs ativos |

**Não existe cron job para tracking marítimo (SEA).**

## Implementação

### Fase 1: Ativar Tracking e Aumentar Limite

**Arquivo:** `supabase/functions/olimpo-proxy/index.ts`

| Alteração | De | Para |
|-----------|-----|------|
| Flag API | `SKIP_API_CALLS = true` | `SKIP_API_CALLS = false` |
| Limite chamadas | `apiCallCount >= 5` | `apiCallCount >= 10` |

Resultado: A action `sea_seed_smart` passará a fazer até 10 chamadas à API JSONCargo por execução, rastreando containers de qualquer armador mapeado (Hapag, MSC, COSCO, Maersk, ZIM, etc.).

### Fase 2: Criar Edge Function de Orquestração

**Arquivo:** `supabase/functions/sea-tracking-cron/index.ts`

Esta nova edge function orquestra a sequência completa de sincronização:

```text
+---------------------------------------+
|        sea-tracking-cron              |
+---------------------------------------+
| 1. Chama olimpo-sync                  |  → Sincroniza t_olimpo_tracking
|    (aguarda conclusão)                |
+---------------------------------------+
| 2. Chama olimpo-proxy?action=         |  → Enriquece cache com dados
|    sea_seed_smart                     |     de tracking (até 10 por batch)
|    (repetido em batches)              |
+---------------------------------------+
| 3. Retorna estatísticas combinadas    |
+---------------------------------------+
```

Lógica de execução:
- Primeiro sincroniza dados base do MariaDB
- Depois enriquece containers que precisam de atualização
- Executa múltiplos batches se necessário (com limite total)
- Registra logs de execução

### Fase 3: Criar Cron Job - Segunda e Quarta

**Schedule:** `0 2 * * 1,3` (Segunda e Quarta-feira às 02:00 UTC / 23:00 BRT)

| Dia | Cron | Horário UTC | Horário BRT |
|-----|------|-------------|-------------|
| Segunda-feira | 1 | 02:00 | 23:00 (domingo) |
| Quarta-feira | 3 | 02:00 | 23:00 (terça) |

## Fluxo de Execução do Cron

```text
  Segunda/Quarta 02:00 UTC
           │
           ▼
  ┌─────────────────────┐
  │  sea-tracking-cron  │
  └─────────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 1. olimpo-sync      │ ← Sincroniza base SEA + AIR
  │    (sync MariaDB)   │
  └─────────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 2. sea_seed_smart   │ ← Enriquece containers ativos
  │    (batch 1: 10)    │   via JSONCargo API
  └─────────────────────┘
           │
           ▼ (se houver mais)
  ┌─────────────────────┐
  │ 3. sea_seed_smart   │
  │    (batch 2: 10)    │
  └─────────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 4. Retorna stats    │
  │    e logs           │
  └─────────────────────┘
```

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Modificar | Ativar API + aumentar limite para 10 |
| `supabase/functions/sea-tracking-cron/index.ts` | Criar | Orquestrador de sincronização |
| SQL (via insert tool) | Executar | Criar cron job no pg_cron |

## Detalhes Técnicos

### Alterações no olimpo-proxy

**Ativar API:**
```typescript
// ANTES
const SKIP_API_CALLS = true;

// DEPOIS
const SKIP_API_CALLS = false;
```

**Aumentar limite:**
```typescript
// ANTES
if (apiCallCount >= 5) {

// DEPOIS
if (apiCallCount >= 10) {
```

### Nova Edge Function: sea-tracking-cron

Estrutura básica da função orquestradora:

```typescript
serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  const stats = {
    olimpo_sync: null,
    sea_seed_batches: [],
    total_api_calls: 0,
    total_cache_hits: 0
  };

  // Passo 1: Sincronizar dados base
  const syncRes = await fetch(`${supabaseUrl}/functions/v1/olimpo-sync`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supabaseKey}` }
  });
  stats.olimpo_sync = await syncRes.json();

  // Passo 2: Enriquecer containers (múltiplos batches)
  const MAX_BATCHES = 5;  // Até 50 chamadas API total
  for (let i = 0; i < MAX_BATCHES; i++) {
    const seedRes = await fetch(
      `${supabaseUrl}/functions/v1/olimpo-proxy?action=sea_seed_smart`,
      { headers: { 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const seedData = await seedRes.json();
    stats.sea_seed_batches.push(seedData.stats);
    stats.total_api_calls += seedData.stats?.api_calls || 0;
    stats.total_cache_hits += seedData.stats?.cache_hits || 0;
    
    // Se não fez nenhuma chamada API, cache está atualizado
    if ((seedData.stats?.api_calls || 0) === 0) break;
    
    // Delay entre batches para não sobrecarregar
    await new Promise(r => setTimeout(r, 2000));
  }

  return new Response(JSON.stringify(stats));
});
```

### Configuração do Cron Job

```sql
SELECT cron.schedule(
  'sea-tracking-weekly',
  '0 2 * * 1,3',  -- Segunda e Quarta às 02:00 UTC
  $$
  SELECT net.http_post(
    url:='https://finktakbjcfmurqeiubz.supabase.co/functions/v1/sea-tracking-cron',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    ),
    body:='{}'::jsonb
  );
  $$
);
```

## Armadores que Passarão a Ser Rastreados

Com a ativação, todos os armadores mapeados serão rastreados via JSONCargo:

| Armador | Prefixos | Status Atual | Após Ativação |
|---------|----------|--------------|---------------|
| Hapag-Lloyd | HLCU, HBG | ✅ Ativo (API própria) | ✅ Mantém |
| MSC | MEDU, MSCU | ❌ Desativado | ✅ Ativado |
| COSCO | COSU, CSNU | ❌ Desativado | ✅ Ativado |
| Maersk | MAEU, MRKU | ❌ Desativado | ✅ Ativado |
| ZIM | ZIMU | ❌ Desativado | ✅ Ativado |
| ONE | ONEY, NYKU | ❌ Desativado | ✅ Ativado |
| Evergreen | EGLV, EISU | ❌ Desativado | ✅ Ativado |
| CMA CGM | CMAU, CMDU | ❌ Desativado | ✅ Ativado |

## Resultado Esperado

1. **Tracking ativado** para todos os armadores mapeados
2. **10 chamadas API** por batch (dobro do atual)
3. **Cron job automático** - Segunda e Quarta-feira às 02:00 UTC
4. **Sequência garantida**: sync → enrich → track
5. **Logs detalhados** de cada execução para monitoramento

