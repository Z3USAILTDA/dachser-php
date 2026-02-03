
# Plano: Alterar Frequência do Cron CCT de 10 para 1 Minuto

## Resumo
Alterar o cron job `leadcomex-10min-refresh` para processar dados do CCT a cada **1 minuto** ao invés dos atuais **10 minutos**.

## Situação Atual

| Job | Schedule Atual | Frequência |
|-----|----------------|------------|
| `leadcomex-10min-refresh` | `*/10 * * * *` | 10 minutos |

## Mudança Proposta

| Job | Novo Schedule | Frequência |
|-----|---------------|------------|
| `leadcomex-1min-refresh` | `* * * * *` | 1 minuto |

---

## Etapas de Implementação

### 1. Remover o Cron Job Antigo
Deletar o job existente (jobid: 4) que roda a cada 10 minutos.

### 2. Criar Novo Cron Job
Criar um novo cron job com schedule `* * * * *` (a cada 1 minuto) mantendo a mesma configuração:
- **Função chamada**: `leadcomex-sync`
- **Ação**: `refresh-all-active`
- **Novo nome sugerido**: `leadcomex-1min-refresh`

---

## Considerações Importantes

- **Volume de chamadas API**: A frequência aumentará de 6 para 60 chamadas por hora à API LeadComex
- **Consumo de recursos**: O backend terá 10x mais execuções diárias
- **Benefício**: Dados CCT atualizados quase em tempo real

---

## Detalhes Técnicos

```text
┌─────────────────────────────────────────────────────────────┐
│  Cron Schedule: * * * * *                                   │
│  ┌─────────────┬─────────────────────────────────────────┐  │
│  │ Campo       │ Valor                                   │  │
│  ├─────────────┼─────────────────────────────────────────┤  │
│  │ Minuto      │ * (todos os minutos)                    │  │
│  │ Hora        │ * (todas as horas)                      │  │
│  │ Dia do mês  │ * (todos os dias)                       │  │
│  │ Mês         │ * (todos os meses)                      │  │
│  │ Dia semana  │ * (todos os dias)                       │  │
│  └─────────────┴─────────────────────────────────────────┘  │
│                                                             │
│  Execuções: 1.440 por dia (60 * 24)                        │
└─────────────────────────────────────────────────────────────┘
```

### SQL a ser executado:

```sql
-- Passo 1: Remover cron antigo
SELECT cron.unschedule('leadcomex-10min-refresh');

-- Passo 2: Criar novo cron com frequência de 1 minuto
SELECT cron.schedule(
  'leadcomex-1min-refresh',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://finktakbjcfmurqeiubz.supabase.co/functions/v1/leadcomex-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbmt0YWtiamNmbXVycWVpdWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjA2MjcsImV4cCI6MjA4MDQzNjYyN30.SqVlb4HtuPGbn6rRhZrTruR5JHf8XMSjVJfYxxPlT-s"}'::jsonb,
    body:='{"action": "refresh-all-active"}'::jsonb
  );
  $$
);
```
