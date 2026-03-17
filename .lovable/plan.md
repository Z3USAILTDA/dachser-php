

## Plano: Corrigir e automatizar enriquecimento de coordenadas

### Problema
O `enrich_missing_coords` dá timeout porque faz tudo numa única chamada (query MariaDB + até 15 chamadas API). Além disso, não está integrado no cron.

### Solução

#### 1. Otimizar `enrich_missing_coords` para evitar timeout
- Adicionar parâmetro `limit` (default 50 containers por vez) na query SQL para processar em lotes menores
- Reduzir `MAX_API_CALLS` de 15 para 10 por execução
- Adicionar timeout mais curto na conexão MariaDB

#### 2. Integrar no `sea-tracking-cron`
- Adicionar um **Passo 3** no `sea-tracking-cron` que chama `olimpo-proxy?action=enrich_missing_coords` após o sync e seed
- Executar até 2 batches de enriquecimento por cron run, com delay entre eles

#### 3. Redeploy das funções
- Deploy `olimpo-proxy` (com otimização de timeout)
- Deploy `sea-tracking-cron` (com passo de enriquecimento)

### Arquivos a editar
- `supabase/functions/olimpo-proxy/index.ts` — Adicionar `LIMIT` na query, reduzir API calls, timeout mais curto
- `supabase/functions/sea-tracking-cron/index.ts` — Adicionar passo 3 de enriquecimento de coordenadas

### Resultado esperado
- Enriquecimento funciona sem timeout
- Executa automaticamente nas segundas e quartas às 02:00 UTC junto com o cron
- Containers sem coordenadas são preenchidos gradualmente a cada execução

