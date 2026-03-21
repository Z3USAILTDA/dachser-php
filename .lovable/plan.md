

## Plano: Melhorar matching de portos para resolver mais UN/LOCODEs

### Problema
O JOIN atual e o `resolve_port_codes` usam matching **exato** entre `port_name` e os campos `origem`/`destino`/`transshipment_port`. Porém os dados podem conter sufixos de país (ex: `"ITAPOA, BR"`, `"SANTOS, BR"`), variações de nome, ou formatações diferentes do que está na `t_ports_world`.

### Alterações

| Arquivo | O que muda |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | **(1)** Na query `get_sea_tracking`: melhorar os LEFT JOINs com `t_ports_world` — usar `LIKE` bidirecional além do match exato, para capturar variações. **(2)** Na action `resolve_port_codes`: substituir match exato por matching fuzzy (LIKE bidirecional), e também tentar match sem sufixo de país (removendo `, XX` do final). |

### Detalhes técnicos

**1. JOINs melhorados na query `get_sea_tracking`**

Trocar os LEFT JOINs atuais por matching mais flexível:
```sql
LEFT JOIN dados_dachser.t_ports_world pw_o 
  ON (
    UPPER(TRIM(pw_o.port_name)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ',', 1))) COLLATE utf8mb4_unicode_ci
    OR UPPER(TRIM(pw_o.port_name)) COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ',', 1))), '%') COLLATE utf8mb4_unicode_ci
    OR UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ',', 1))) COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', UPPER(TRIM(pw_o.port_name)), '%') COLLATE utf8mb4_unicode_ci
  )
```

Idem para `pw_d` (destino). O `MAX(pw_o.un_locode)` no SELECT já garante que mesmo com múltiplos matches, retorna um resultado.

**2. `resolve_port_codes` com matching fuzzy**

Na query de resolução de escalas, para cada nome de porto:
- Tentar match exato primeiro
- Se não encontrar, tentar LIKE bidirecional
- Remover sufixo `, XX` (código de país) antes do match
- Usar `COLLATE utf8mb4_unicode_ci` em todas as comparações

```sql
SELECT port_name, un_locode, country_code 
FROM dados_dachser.t_ports_world 
WHERE UPPER(TRIM(port_name)) COLLATE utf8mb4_unicode_ci IN (...)
   OR UPPER(TRIM(port_name)) COLLATE utf8mb4_unicode_ci IN (...cleaned names without country suffix...)
```

Alternativamente, fazer uma query por porto com LIKE para melhor cobertura.

