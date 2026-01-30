
# Suspensão Total da JsonCargo - Todas as Funções

## Resumo

Desativar **todas** as chamadas à API JsonCargo no sistema até segunda ordem. Isso afeta:

| Módulo | Função | Uso da JsonCargo |
|--------|--------|------------------|
| **Olimpo/Sea Tracking** | `sea_seed_smart` | Enriquecimento de containers |
| **Olimpo/Sea Tracking** | `refresh_sea_tracking` | Re-track manual de containers |
| **Olimpo/Sea Tracking** | `jc_container`, `jc_vessel_find`, `jc_vessel_basic`, `jc_port_find` | Endpoints diretos |
| **CRON Marítimo** | `sea-tracking-cron` | Execução automática 2x/semana |
| **Demurrage** | `demurrage-import-jsoncargo` | Importação de MBLs |
| **Demurrage** | `demurrage-fetch-timelines` | Busca de eventos de container |
| **Health Check** | `demurrage-health-check` | Verificação de status da API |

---

## Arquivos a Modificar

### 1. `supabase/functions/olimpo-proxy/index.ts`

**Alteração 1 - Função `jcJson` (linha 268)**

Adicionar flag global no início da função para retornar imediatamente:

```typescript
async function jcJson(url: string, qs: Record<string, string> = {}, timeout = 25000): Promise<any> {
  // FLAG: JsonCargo DESATIVADO temporariamente até segunda ordem
  const JSONCARGO_DISABLED = true;
  if (JSONCARGO_DISABLED) {
    console.log('[jcJson] JsonCargo desativado até segunda ordem');
    return { __curl_error: 'jsoncargo_disabled', disabled: true };
  }
  
  const apiKey = Deno.env.get('JSONCARGO_API_KEY');
  // ... resto do código
}
```

**Impacto:** Todas as chamadas via `jcJson()` retornarão erro "disabled" sem fazer requisição externa. Isso cobre:
- `sea_seed_smart`
- `refresh_sea_tracking`
- `jc_container`
- `jc_vessel_find`
- `jc_vessel_basic`
- `jc_port_find`
- Busca de IMO de navios

---

### 2. `supabase/functions/sea-tracking-cron/index.ts`

**Alteração - Pular Passo 2 (linha 79)**

```typescript
// ===== PASSO 2: Enriquecer containers via sea_seed_smart (múltiplos batches) =====
// FLAG: JsonCargo DESATIVADO temporariamente até segunda ordem
const JSONCARGO_DISABLED = true;

if (JSONCARGO_DISABLED) {
  console.log('[sea-tracking-cron] Passo 2 PULADO: JsonCargo desativado até segunda ordem');
  stats.sea_seed_batches = [{ skipped: true, reason: 'JsonCargo desativado temporariamente' }];
} else {
  const MAX_BATCHES = 5;
  // ... código existente dos batches
}
```

**Impacto:** O CRON de segunda/quarta continuará executando o `olimpo-sync` (sincronização MariaDB) mas não fará chamadas à JsonCargo.

---

### 3. `supabase/functions/demurrage-import-jsoncargo/index.ts`

**Alteração - Retornar erro no início (após linha 42)**

```typescript
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // FLAG: JsonCargo DESATIVADO temporariamente até segunda ordem
  const JSONCARGO_DISABLED = true;
  if (JSONCARGO_DISABLED) {
    return new Response(
      JSON.stringify({ 
        error: "JsonCargo desativado temporariamente", 
        disabled: true,
        message: "A integração com JsonCargo está suspensa até segunda ordem"
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const JSONCARGO_API_KEY = Deno.env.get("JSONCARGO_API_KEY");
  // ... resto do código
```

**Impacto:** Qualquer tentativa de importar MBLs via JsonCargo no módulo de Demurrage retornará erro 503 com mensagem clara.

---

### 4. `supabase/functions/demurrage-fetch-timelines/index.ts`

**Alteração - Retornar erro no início (após linha 222)**

```typescript
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // FLAG: JsonCargo DESATIVADO temporariamente até segunda ordem
  const JSONCARGO_DISABLED = true;
  if (JSONCARGO_DISABLED) {
    return new Response(
      JSON.stringify({ 
        error: "JsonCargo desativado temporariamente", 
        disabled: true,
        processed: 0,
        eventsInserted: 0
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const JSONCARGO_API_KEY = Deno.env.get("JSONCARGO_API_KEY");
  // ... resto do código
```

**Impacto:** A busca de timelines de containers no Demurrage retornará erro 503.

---

### 5. `supabase/functions/demurrage-health-check/index.ts`

**Alteração - Reportar como "disabled" (linha 81)**

```typescript
// FLAG: JsonCargo DESATIVADO temporariamente até segunda ordem
const JSONCARGO_DISABLED = true;

if (JSONCARGO_DISABLED) {
  results.push({
    service: "JSONCARGO",
    status: "disabled",
    latency_ms: 0,
    message: "API desativada até segunda ordem",
    last_checked: new Date().toISOString(),
  });
} else {
  try {
    const response = await fetch("https://api.jsoncargo.com/api/tracking/line/msc/container/MSCU1234567", {
    // ... resto do código
```

**Impacto:** O health check mostrará JsonCargo como "disabled" ao invés de fazer chamada de teste.

---

## Resumo das Alterações

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `olimpo-proxy/index.ts` | 268 | Flag `JSONCARGO_DISABLED = true` em `jcJson()` |
| `sea-tracking-cron/index.ts` | 79 | Flag para pular Passo 2 |
| `demurrage-import-jsoncargo/index.ts` | ~43 | Retorno 503 imediato |
| `demurrage-fetch-timelines/index.ts` | ~223 | Retorno 503 imediato |
| `demurrage-health-check/index.ts` | ~81 | Status "disabled" |

---

## Funcionalidades que Continuam Operando

| Funcionalidade | Status |
|----------------|--------|
| Sincronização MariaDB → t_olimpo_tracking | ✅ Normal |
| Visualização de dados em cache do tracking | ✅ Normal |
| CRON de sincronização (Passo 1) | ✅ Normal |
| Todas as análises HBL/MBL/Manifest | ✅ Normal |
| Demurrage (exceto import/timeline) | ✅ Normal |

## Funcionalidades Suspensas

| Funcionalidade | Status |
|----------------|--------|
| Importação de MBLs via JsonCargo | ❌ Desativado |
| Enriquecimento automático via CRON | ❌ Desativado |
| Re-track manual de containers | ❌ Desativado |
| Busca de eventos/timeline | ❌ Desativado |
| Busca de navio/porto | ❌ Desativado |
| Health check da API | ❌ Mostra "disabled" |

---

## Como Reativar

Quando quiser reativar a JsonCargo, basta alterar todas as flags `JSONCARGO_DISABLED` de `true` para `false` nos 5 arquivos listados acima.

---

## Deploy

Após as alterações, será necessário fazer deploy das seguintes edge functions:
- `olimpo-proxy`
- `sea-tracking-cron`
- `demurrage-import-jsoncargo`
- `demurrage-fetch-timelines`
- `demurrage-health-check`
