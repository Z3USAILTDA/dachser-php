
# Sistema de Alertas de Monitoramento de Banco de Dados

## Visão Geral

Criar um sistema de alertas por email para o monitoramento de tabelas do banco de dados `dados_dachser`, com dois cenários distintos:

1. **Relatório de Status (a cada 30 minutos)**: Envio periódico do status de todas as tabelas monitoradas
2. **Alerta Crítico (verificação a cada 30 minutos)**: Notificação quando uma tabela permanece sem atualização por 60+ minutos

## Configuração de Destinatários

| Cenário | Destinatários (Teste) | Destinatários (Produção) |
|---------|----------------------|--------------------------|
| Relatório de Status | larissa@z3us.ai | larissa@z3us.ai |
| Alerta Crítico | larissa@z3us.ai | larissa@z3us.ai, rodrigo@z3us.ai, herbert@z3us.ai |

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/db-status-report/index.ts` | Edge function para relatório de status |
| `supabase/functions/db-critical-alert/index.ts` | Edge function para alertas críticos |

## Detalhes Técnicos

### Edge Function 1: `db-status-report`

Esta função será executada a cada 30 minutos e enviará um relatório completo do status das tabelas.

**Lógica:**
1. Conectar ao MariaDB (com retry igual ao `fetch-database-stats`)
2. Consultar estatísticas de cada tabela monitorada
3. Gerar HTML do email no padrão visual Z3US
4. Enviar via Resend para `larissa@z3us.ai`

**Template do Email:**
- Header com logo Z3US e badge de status geral
- Tabela resumo com: nome da tabela, última atualização, total de registros, inserções 24h
- Indicador visual de saúde (verde/amarelo/vermelho)
- Timestamp do relatório

### Edge Function 2: `db-critical-alert`

Esta função verificará se alguma tabela está há 60+ minutos sem atualização e enviará alertas quando necessário.

**Lógica:**
1. Conectar ao MariaDB
2. Verificar última atualização de cada tabela
3. Identificar tabelas com 60+ minutos sem atualização
4. Verificar no banco se já foi enviado alerta para essa situação (evitar spam)
5. Se houver novas tabelas críticas ou tabelas que continuam críticas após 30 min, enviar alerta
6. Registrar alerta enviado no banco

**Controle de Duplicatas:**
- Criar tabela `ai_agente.t_db_monitor_alerts` para rastrear alertas enviados
- Campos: `id`, `table_name`, `alert_type`, `status_at_alert`, `sent_at`
- Lógica: só envia novo alerta se:
  - Tabela acabou de ficar crítica (não tinha alerta nos últimos 60 min)
  - Ou se a tabela continua crítica após 30 min (re-alerta)

**Template do Email:**
- Header com badge "ALERTA CRÍTICO"
- Lista de tabelas afetadas com tempo sem atualização
- Aplicações impactadas por cada tabela
- Recomendações de ação

### Configuração de Cron Jobs

Ambos os jobs rodarão de 30 em 30 minutos (`:00` e `:30` de cada hora):

```sql
-- Relatório de Status a cada 30 minutos
SELECT cron.schedule(
  'db-status-report-30min',
  '*/30 * * * *', -- A cada 30 minutos
  $$
  SELECT net.http_post(
    url := 'https://finktakbjcfmurqeiubz.supabase.co/functions/v1/db-status-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [ANON_KEY]'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verificação de alertas críticos a cada 30 minutos
SELECT cron.schedule(
  'db-critical-alert-30min',
  '*/30 * * * *', -- A cada 30 minutos
  $$
  SELECT net.http_post(
    url := 'https://finktakbjcfmurqeiubz.supabase.co/functions/v1/db-critical-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [ANON_KEY]'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Estrutura das Tabelas Monitoradas

| Tabela | Aplicações |
|--------|------------|
| `t_master_dados` | AIR, SEA, CCT, TRACKING, OLIMPO |
| `t_dados_financeiro_nfs` | REGUA |
| `t_dados_financeiro_voucher` | ESTEIRA |
| `tbaixas` | ESTEIRA |

### Tabela de Controle de Alertas

```sql
CREATE TABLE IF NOT EXISTS ai_agente.t_db_monitor_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_type ENUM('status_report', 'critical_alert') NOT NULL,
  tables_affected JSON,
  sent_to JSON,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type_sent (alert_type, sent_at)
);
```

### Modo de Teste

Ambas as funções terão um parâmetro `test_mode`:
- `{ "test_mode": true }`: Envia apenas para `larissa@z3us.ai` (comportamento inicial)
- `{ "test_mode": false }`: Usa destinatários de produção

Para o deploy inicial, o código virá com `test_mode = true` por padrão.

### Estrutura do Email - Relatório de Status

```text
┌─────────────────────────────────────────────────────────────────┐
│                        [LOGO Z3US]                              │
│                                                                 │
│                 📊 RELATÓRIO DE STATUS - BANCO DE DADOS         │
│                 30/01/2026 15:30 (São Paulo)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Resumo Geral:                                                  │
│  ✅ 3 tabelas saudáveis | ⚠️ 1 tabela em atenção               │
│                                                                 │
│  ┌─────────────────┬───────────────┬──────────┬─────────────┐   │
│  │ Tabela          │ Última Atual. │ Registros│ 24h         │   │
│  ├─────────────────┼───────────────┼──────────┼─────────────┤   │
│  │ 🟢 t_master     │ há 3 min      │ 245.832  │ +1.234      │   │
│  │ 🟢 t_fin_nfs    │ há 8 min      │ 12.543   │ +89         │   │
│  │ 🟡 t_fin_voucher│ há 45 min     │ 8.721    │ +23         │   │
│  │ 🟢 tbaixas      │ há 2 min      │ 5.234    │ +156        │   │
│  └─────────────────┴───────────────┴──────────┴─────────────┘   │
│                                                                 │
│  [Ver Dashboard de Monitoramento]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Estrutura do Email - Alerta Crítico

```text
┌─────────────────────────────────────────────────────────────────┐
│                        [LOGO Z3US]                              │
│                                                                 │
│                 🚨 ALERTA CRÍTICO - BANCO DE DADOS              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  As seguintes tabelas estão sem atualização há mais de         │
│  60 minutos e requerem atenção:                                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🔴 t_dados_financeiro_voucher                           │   │
│  │     Sem atualização há: 1h 23min                         │   │
│  │     Aplicações afetadas: ESTEIRA                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Recomendações:                                                 │
│  • Verificar conectividade do job de sincronização             │
│  • Verificar se há processos travados                          │
│  • Consultar logs do sistema                                   │
│                                                                 │
│  [Ver Dashboard de Monitoramento]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/config.toml` | Adicionar configuração `verify_jwt = false` para as novas funções |

## Resumo de Implementação

1. **Criar** `supabase/functions/db-status-report/index.ts`
   - Template de email HTML no padrão Z3US
   - Consulta MariaDB para estatísticas
   - Envio via Resend

2. **Criar** `supabase/functions/db-critical-alert/index.ts`
   - Verificação de tabelas críticas
   - Controle de duplicatas via tabela de alertas
   - Template de email para alertas

3. **Atualizar** `supabase/config.toml`
   - Adicionar configurações das novas funções

4. **Criar Cron Jobs** (via SQL insert tool após aprovação)
   - Job para relatório de status a cada 30 min
   - Job para verificação de alertas críticos a cada 30 min
