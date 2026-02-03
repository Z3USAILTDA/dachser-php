

# Plano: Configuração de E-mails de Monitoramento de Dados

## Resumo
Atualizar o sistema de monitoramento de dados para:
1. **Frequência**: Enviar e-mails a cada 1 hora (era 30 minutos)
2. **PDF no Alerta**: Incluir anexo PDF no e-mail de alerta crítico
3. **Novos Destinatários**: Adicionar 3 e-mails **apenas no alerta crítico**
4. **Restrição de Horário**: Enviar apenas entre 06h e 22h (São Paulo)

---

## Configuração de Destinatários

| Tipo de E-mail | Destinatários |
|----------------|---------------|
| **Status Report (Relatório)** | `larissa@z3us.ai` (mantém atual) |
| **Critical Alert (Alerta)** | `larissa@z3us.ai`, `rodrigo@z3us.ai`, `ana.tozzo@dachser.com`, `danilo.pedroso@dachser.com`, `herbert@z3us.ai` |

---

## Etapas de Implementação

### 1. Atualizar Edge Function `db-status-report`
- **Manter destinatário atual**: `larissa@z3us.ai`
- **Atualizar texto** no rodapé do e-mail de "a cada 30 minutos" para "a cada 1 hora"

### 2. Atualizar Edge Function `db-critical-alert`
- **Adicionar destinatários** (5 no total):
  - `larissa@z3us.ai` (existente)
  - `rodrigo@z3us.ai` (existente)
  - `ana.tozzo@dachser.com` (novo)
  - `danilo.pedroso@dachser.com` (novo)
  - `herbert@z3us.ai` (novo)
- **Integrar geração de PDF** (reutilizar lógica do status-report)
- **Anexar PDF ao e-mail** de alerta crítico
- **Atualizar texto** no rodapé de "Verificação a cada 30 minutos" para "Verificação a cada 1 hora"

### 3. Atualizar Cron Jobs
Remover os crons antigos e criar novos com horário restrito (06h-22h São Paulo):
- **Schedule**: `0 9-23,0-1 * * *` (UTC, equivale a 06h-22h BRT)
- Isso resulta em **17 execuções diárias**

---

## Detalhes Técnicos

### Conversão de Fuso Horário
```text
┌─────────────────────────────────────────────────────────────┐
│  Horário São Paulo (BRT/UTC-3) → Horário UTC               │
│  ─────────────────────────────────────────────────────────  │
│  06:00 BRT  →  09:00 UTC                                   │
│  22:00 BRT  →  01:00 UTC (dia seguinte)                    │
│                                                             │
│  Cron Schedule: 0 9-23,0-1 * * *                           │
│  - 0 9-23: Executa às 09:00-23:00 UTC (06:00-20:00 BRT)    │
│  - 0 0-1:  Executa às 00:00-01:00 UTC (21:00-22:00 BRT)    │
└─────────────────────────────────────────────────────────────┘
```

### SQL dos Cron Jobs

```sql
-- Passo 1: Remover crons antigos
SELECT cron.unschedule('db-status-report-30min');
SELECT cron.unschedule('db-critical-alert-30min');

-- Passo 2: Criar novos crons (06h-22h São Paulo = 09h-01h UTC)
SELECT cron.schedule(
  'db-status-report-hourly',
  '0 9-23,0-1 * * *',
  $$
  SELECT net.http_post(
    url:='https://finktakbjcfmurqeiubz.supabase.co/functions/v1/db-status-report',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbmt0YWtiamNmbXVycWVpdWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjA2MjcsImV4cCI6MjA4MDQzNjYyN30.SqVlb4HtuPGbn6rRhZrTruR5JHf8XMSjVJfYxxPlT-s"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'db-critical-alert-hourly',
  '0 9-23,0-1 * * *',
  $$
  SELECT net.http_post(
    url:='https://finktakbjcfmurqeiubz.supabase.co/functions/v1/db-critical-alert',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbmt0YWtiamNmbXVycWVpdWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjA2MjcsImV4cCI6MjA4MDQzNjYyN30.SqVlb4HtuPGbn6rRhZrTruR5JHf8XMSjVJfYxxPlT-s"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

### Destinatários por Função

```typescript
// db-status-report/index.ts
const PRODUCTION_RECIPIENTS = ['larissa@z3us.ai'];

// db-critical-alert/index.ts  
const PRODUCTION_RECIPIENTS = [
  'larissa@z3us.ai',
  'rodrigo@z3us.ai', 
  'ana.tozzo@dachser.com',
  'danilo.pedroso@dachser.com',
  'herbert@z3us.ai'
];
```

---

## Resumo das Alterações por Arquivo

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/db-status-report/index.ts` | Atualizar texto do rodapé (1 hora) |
| `supabase/functions/db-critical-alert/index.ts` | Adicionar 3 destinatários, integrar PDF, atualizar texto |
| Cron Jobs (via SQL) | Alterar de `*/30 * * * *` para `0 9-23,0-1 * * *` |

