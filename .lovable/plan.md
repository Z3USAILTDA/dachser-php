# Plano: Alerta por E-mail para AWBs com Falha no Rastreio

## Contexto

AWBs com `tracking_failed: true` são identificados no backend (`fetch-status-aereo`) quando não há status final resolvido. O objetivo é enviar um e-mail consolidado para `devs@z3us.ai`, [rodrigo@z3us.ai](mailto:rodrigo@z3us.ai) e `larissa@z3us.ai` listando todos esses AWBs com suas informações e o motivo da falha.

## Abordagem

Criar uma nova edge function `air-tracking-failed-alert` seguindo o mesmo padrão do `air-dep-transition-alert` existente — com deduplicação via tabela MariaDB e envio via Resend.

## Implementação

### 1. Nova Edge Function `air-tracking-failed-alert`

- Consulta `fetch-status-aereo` internamente (ou diretamente `t_status_aereo` + firecrawl) para identificar AWBs com `tracking_failed = true`
- Na prática, o mais simples: invocar `fetch-status-aereo` via HTTP e filtrar os itens onde `tracking_failed === true`
- Para cada AWB com falha, incluir no e-mail: AWB, HAWB, origem, destino, destinatário, último status tentado, última atualização, e o motivo da falha (ex: "Timeline vazia em todas as fontes", "AWB não informado no sistema")
- **Deduplicação**: Criar tabela `t_air_tracking_failed_alerts` no MariaDB para evitar e-mails repetidos para o mesmo AWB
- Resolver alertas automaticamente quando o AWB deixar de ter falha
- E-mail HTML no mesmo estilo visual do alerta DEP (branding Z3US, cores, logo)

### 2. Cron Job (pg_cron)

- Agendar execução a cada 30 minutos, mesmo padrão do DEP alert

### 3. Configuração

- Adicionar entry no `supabase/config.toml` com `verify_jwt = false`
- Deploy da edge function

## Detalhes do E-mail

- **Assunto**: `✈️ X AWB(s) com falha no rastreio`
- **Corpo**: Tabela com colunas: AWB, Cliente, Rota (Origem → Destino), Último Status, Motivo da Falha, Parado há
- **CTA**: Botão "Abrir Monitoramento Aéreo" apontando para `/air/tracking`

## Arquivos Criados/Modificados


| Arquivo                                                 | Ação                         |
| ------------------------------------------------------- | ---------------------------- |
| `supabase/functions/air-tracking-failed-alert/index.ts` | Criar                        |
| `supabase/config.toml`                                  | Adicionar entry (automático) |
| Cron job via SQL                                        | Criar schedule               |
