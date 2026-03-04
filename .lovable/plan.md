

# Alterar Monitor Firecrawl: validar origin/destination nos dados mais recentes

## Problema
Atualmente, o monitor considera o scraper "saudável" apenas verificando se `scraped_at` está recente. Porém, registros podem ser inseridos com `origin` e/ou `destination` vazios, o que indica dados inválidos. O sistema não deve considerá-los como dados válidos nem marcar como "recuperado".

## Solução

Alterar a query principal em ambas as Edge Functions para considerar como "última atualização válida" apenas registros onde `origin` e `destination` estejam preenchidos (não nulos e não vazios).

### 1. `firecrawl-monitor-stats/index.ts`

Alterar a query SQL para buscar o `MAX(scraped_at)` apenas de registros com origin e destination preenchidos:

```sql
SELECT 
  MAX(CASE WHEN origin IS NOT NULL AND origin != '' 
       AND destination IS NOT NULL AND destination != '' 
       THEN scraped_at ELSE NULL END) as lastUpdate,
  COUNT(*) as totalRecords,
  SUM(CASE WHEN scraped_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recentInserts,
  COUNT(DISTINCT CASE WHEN scraped_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN awb ELSE NULL END) as uniqueAwbs
FROM dados_dachser.t_aereo_ws_firecrawl
```

E calcular `minutesSinceUpdate` a partir desse `lastUpdate` filtrado. Adicionalmente, retornar um campo `hasEmptyFields` indicando se o registro mais recente tem campos vazios.

### 2. `firecrawl-monitor-alert/index.ts`

Mesma alteração na query: o `MAX(scraped_at)` e o `TIMESTAMPDIFF` devem considerar apenas registros com `origin` e `destination` preenchidos. Isso garante que o alerta não seja considerado "recuperado" quando dados chegam sem essas colunas.

### 3. `FirecrawlMonitor.tsx` (frontend)

Adicionar indicador visual na interface quando o último registro tem campos vazios, mostrando ao admin que os dados estão incompletos mesmo que `scraped_at` seja recente.

