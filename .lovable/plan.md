

## Espelhamento total: CCT como reflexo da `t_cct_hawb_api_atual`

### Problema atual

O `get_cct_shipments` aplica 3 filtros que ocultam dados:

1. `WHERE h.data_consulta_sucesso IS NOT NULL AND h.response_http_status = 200` — exclui HAWBs com erro ou ainda não consultados
2. `LIMIT 1000` — corta registros além de 1000
3. O loop de merge itera sobre `rawShipments` (vindo do `t_master_dados`), não sobre `hawbApiMap` — HAWBs sem match no `t_master_dados` são descartados silenciosamente

### Correções no arquivo `supabase/functions/mariadb-proxy/index.ts`

**1. Remover filtros na query principal (linha ~3418-3421)**

```sql
-- DE:
WHERE h.data_consulta_sucesso IS NOT NULL
  AND h.response_http_status = 200
LIMIT 1000

-- PARA:
-- (sem WHERE, sem LIMIT — traz tudo)
```

**2. Inverter a lógica de merge (linhas ~3587-3618)**

Atualmente o loop principal itera sobre `rawShipments` (t_master_dados) e busca dados da API. Inverter: iterar sobre `hawbApiMap` (t_cct_hawb_api_atual) e enriquecer opcionalmente com t_master_dados.

```typescript
// Criar map de t_master_dados por HAWB
const masterDadosMap = new Map();
for (const row of (rawShipments || [])) {
  masterDadosMap.set((row.house || '').trim(), row);
}

// Loop principal: cada HAWB da t_cct_hawb_api_atual
const shipments = [];
for (const [hawbKey, apiInfo] of hawbApiMap) {
  const masterInfo = masterDadosMap.get(hawbKey) || {};
  shipments.push({
    id: masterInfo.id || hawbKey,
    house: apiInfo.hawb || hawbKey,
    master: apiInfo.mawb || masterInfo.master || '',
    cliente: masterInfo.cliente || '',
    nome_analista: masterInfo.nome_analista || null,
    email_analista: masterInfo.email_analista || null,
    emails_cliente: masterInfo.emails_cliente || null,
    tipo_servico: masterInfo.tipo_servico || null,
    // ... todos os campos da apiInfo como antes
  });
}
```

**3. Manter o enriquecimento com `t_cct_shipments` e `t_cct_eventos_historico`** — sem alteração na lógica, apenas agora opera sobre o conjunto completo.

### Resumo

| Filtro removido | Efeito |
|---|---|
| `data_consulta_sucesso IS NOT NULL` | Mostra HAWBs ainda não consultados ou com falha |
| `response_http_status = 200` | Mostra HAWBs com erro de API |
| `LIMIT 1000` | Mostra todos os registros |
| Merge baseado em t_master_dados | HAWBs sem match no t_master_dados aparecem (sem cliente/analista) |

**1 arquivo alterado:** `supabase/functions/mariadb-proxy/index.ts`
**Nenhuma alteração no frontend.**

