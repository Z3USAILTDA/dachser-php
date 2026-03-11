

## Adicionar latitude e longitude ao t_tracking_sea

### Contexto

A API JSONCargo retorna dados de posição do container via o último evento (`last_movement`) ou via a posição do navio. O `refresh_sea_tracking` (principal action de rastreio) já busca dados de navio mas **não salva coordenadas** no `t_tracking_sea`. A tabela `t_olimpo_tracking` já tem `current_lat`/`current_lon`, mas o `t_tracking_sea` não.

### Alterações

**1. MariaDB — Adicionar colunas ao `t_tracking_sea`**

Executar via action existente ou migration manual:
```sql
ALTER TABLE dados_dachser.t_tracking_sea 
  ADD COLUMN latitude DECIMAL(10,6) DEFAULT NULL,
  ADD COLUMN longitude DECIMAL(10,6) DEFAULT NULL;
```

**2. `supabase/functions/olimpo-proxy/index.ts` — `refresh_sea_tracking`**

Na seção onde a API JSONCargo retorna dados do container (~linha 2680-2848):
- Extrair lat/lon da resposta da API: `data.last_movement?.latitude`, `data.last_movement?.longitude`, ou `data.latitude`, `data.longitude`, ou do último evento com coordenadas
- Adicionar `latitude = ?, longitude = ?` ao UPDATE do `t_tracking_sea` (linha 2816-2848)

**3. `supabase/functions/olimpo-proxy/index.ts` — `sea_seed_smart`**

Na seção de cache (~linha 756-860):
- Extrair lat/lon da resposta do container (mesma lógica)
- Incluir nos resultados retornados

**4. Propagação para siblings**

Onde dados são copiados para containers irmãos (`sibling_synced`), incluir `latitude` e `longitude` na propagação.

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/olimpo-proxy/index.ts` | ALTER TABLE + extrair lat/lon da API + salvar no UPDATE + propagar para siblings |

