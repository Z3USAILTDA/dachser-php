

## Plano: Siglas UN/LOCODE na Rota + IMO fallback via t_ship_imos

### Objetivo
1. Exibir siglas UN/LOCODE (ex: `THLCH → CNYTN → BRSSZ`) na coluna Rota, resolvendo via `t_ports_world`
2. Adicionar `t_ship_imos` como PRIORIDADE 1B na busca de IMO (antes da API JSONCargo)

### Alterações

| Arquivo | O que muda |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | **(1)** Na query `get_sea_tracking` (~linha 2158): adicionar LEFT JOINs com `t_ports_world` para resolver `origem` e `destino` em UN/LOCODE. Retornar `origem_code` e `destino_code`. **(2)** Criar action `resolve_port_codes` para resolver uma lista de nomes de portos (para escalas). **(3)** Na função `findVesselImo` (~linha 413): inserir bloco PRIORIDADE 1B que consulta `t_ship_imos` por `ship_name` fuzzy match antes da API JSONCargo. |
| `src/pages/ContainerTracking.tsx` | Na coluna Rota (~linha 2487): exibir `origem_code` / `destino_code` como texto principal, com nomes completos no Tooltip. Para escalas, resolver via chamada `resolve_port_codes` ao carregar dados. |

### Detalhes técnicos

**1. Siglas na query `get_sea_tracking`**

Adicionar ao SELECT principal (~linha 2158):
```sql
-- Novos LEFT JOINs após a linha 2238
LEFT JOIN dados_dachser.t_ports_world pw_o 
  ON UPPER(TRIM(pw_o.port_name)) = UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ',', 1)))
LEFT JOIN dados_dachser.t_ports_world pw_d 
  ON UPPER(TRIM(pw_d.port_name)) = UPPER(TRIM(SUBSTRING_INDEX(ts.destino, ',', 1)))

-- No SELECT, adicionar:
MAX(pw_o.un_locode) as origem_code,
MAX(pw_d.un_locode) as destino_code
```

**2. Action `resolve_port_codes`**

Nova action que recebe uma lista de nomes de portos e retorna o mapeamento `nome → un_locode`:
```sql
SELECT port_name, un_locode 
FROM dados_dachser.t_ports_world 
WHERE UPPER(TRIM(port_name)) IN (?, ?, ...)
```

Chamada uma vez no frontend ao carregar os dados, para resolver as escalas (`transshipment_port`).

**3. IMO — PRIORIDADE 1B via `t_ship_imos`**

Na função `findVesselImo`, após o bloco PRIORIDADE 1 (linha 413) e antes da PRIORIDADE 2 (linha 415), inserir:

```typescript
// PRIORIDADE 1B: buscar IMO na tabela dedicada t_ship_imos
try {
  const lookupShipImos = async (client: any) => {
    const rows = await client.query(`
      SELECT imo FROM dados_dachser.t_ship_imos 
      WHERE UPPER(TRIM(ship_name)) = ?
         OR UPPER(TRIM(ship_name)) LIKE CONCAT('%', ?, '%')
         OR ? LIKE CONCAT('%', UPPER(TRIM(ship_name)), '%')
      LIMIT 1
    `, [normalizedName, normalizedName, normalizedName]);
    return rows?.[0]?.imo || null;
  };

  let shipImo = dbClient 
    ? await lookupShipImos(dbClient) 
    : /* mesma lógica de conexão temporária */;

  if (shipImo) {
    vesselImoCache.set(normalizedName, shipImo);
    console.log(`[findVesselImo] Found IMO ${shipImo} for "${vesselName}" from t_ship_imos`);
    return shipImo;
  }
} catch (err) {
  console.warn(`[findVesselImo] t_ship_imos lookup failed:`, err.message);
}
```

Fluxo final de busca IMO:
1. **Cache** em memória
2. **PRIORIDADE 1**: `t_tracking_sea.vessel_imo`
3. **PRIORIDADE 1B**: `t_ship_imos` (tabela dedicada) — **NOVO**
4. **PRIORIDADE 2**: API JSONCargo (último recurso)

**4. Frontend — Rota com siglas**

Na coluna Rota (~linha 2503), substituir:
- `mbl.origem` → `mbl.origem_code || mbl.origem` (preferir sigla)
- `mbl.destino` → `mbl.destino_code || mbl.destino`
- Escalas: usar mapeamento do `resolve_port_codes` (cacheado)
- Tooltip mantém nomes completos para referência

