

## Plano: Remover cooldowns do cron LeadComex para consulta contínua

### Problema
Atualmente, após uma consulta com sucesso, o HAWB entra em cooldown de 4 horas e não é reconsultado. Para falhas, o cooldown é de 1 hora. O usuário quer monitoramento contínuo ("on time"), sem pausas.

### Alteração

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` (linhas 12594-12612)

Remover os dois blocos `AND NOT EXISTS` que implementam os cooldowns de 4h (sucesso) e 1h (falha). Manter apenas a exclusão de HAWBs com status `ENTREGUE` (que já foram entregues e não precisam mais de monitoramento).

O trecho `extraWhere` quando `prioritizePending=true` passará de:
```text
AND COALESCE(...) != 'ENTREGUE'
AND NOT EXISTS (... success cooldown 4h ...)
AND NOT EXISTS (... failure cooldown 1h ...)
```
Para:
```text
AND COALESCE(...) != 'ENTREGUE'
```

Também atualizar o log de console correspondente para refletir a mudança ("continuous polling, no cooldown").

### Impacto
- HAWBs serão reconsultados a cada ciclo do cron (a cada minuto), exceto os já entregues.
- O `LIMIT 5` do cron continua ativo, então processa 5 HAWBs por minuto em rotação.
- Dados sempre atualizados ("on time").

