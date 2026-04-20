

## Garantir gravação de DLV / ARR-destino-5d em `t_air_process_visibility`

### Diagnóstico
- A função `air-scan-finalized` existe e implementa corretamente as duas regras (DLV + ARR no destino > 5 dias), mas **não tem cron agendado** (verificado em `cron.job`).
- Por isso a tabela só é populada quando alguém invoca a função manualmente — novos processos DLV/ARR ficam de fora e continuam aparecendo na tela.
- A `fetch-tracking-aereo` já lê `t_air_process_visibility` (logs mostram "Loaded 248 visibility records"), então basta manter a tabela atualizada para os processos sumirem da visualização.

### Mudança proposta (mínima, cirúrgica)

**1. Agendar cron horário** para `air-scan-finalized` (escolhido pelo usuário — mais leve no MariaDB que já vive estourando `max_user_connections`):

```sql
SELECT cron.schedule(
  'air-scan-finalized-hourly',
  '0 * * * *',  -- todo minuto 0 de cada hora (UTC)
  $$
  SELECT net.http_post(
    url := 'https://finktakbjcfmurqeiubz.supabase.co/functions/v1/air-scan-finalized',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

**2. Disparar uma execução imediata** logo após o agendamento, para popular agora os processos DLV/ARR-destino-5d que estão pendentes (sem esperar a próxima hora cheia).

### Não muda
- Lógica da função `air-scan-finalized` (regras DLV e ARR-destino-5d permanecem como estão).
- Estrutura da tabela `t_air_process_visibility`.
- Filtragem no `fetch-tracking-aereo`.
- Demais funções aéreas, CCT, marítimo.

### Validação
1. Confirmar em `cron.job` que `air-scan-finalized-hourly` está ativo.
2. Logs da execução manual mostrarão `Found N processes to persist` e `Scan complete: N records inserted/updated`.
3. Recarregar `/air/tracking` e verificar que os processos DLV / ARR-destino-5d sumiram da visualização.
4. Próxima execução automática: minuto 0 da hora seguinte.

