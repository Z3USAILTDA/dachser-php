

## Plano: Serviço de Alerta E-mail — Transições Aéreas (DEP)

### Resumo
Criar edge function `air-dep-transition-alert` que monitora AWBs paradas em BKD/RCF/MAN sem evoluir para DEP, enviando alertas por e-mail. A tabela de deduplicação ficará no **MariaDB `dados_dachser`** (não no Supabase).

### Arquivos

#### 1. Novo: `supabase/functions/air-dep-transition-alert/index.ts`

Seguindo o padrão do `firecrawl-monitor-alert`:

- **Conexão**: MariaDB `dados_dachser` via `connectWithRetry`
- **Query principal**:
```sql
SELECT awb, hawb, `destinatário`, origem, destino, `último_status`, `última atualização`
FROM dados_dachser.t_status_aereo
WHERE (
  (`último_status` = 'BKD' AND `última atualização` < DATE_SUB(NOW(), INTERVAL 12 HOUR))
  OR (`último_status` = 'RCF' AND `última atualização` < DATE_SUB(NOW(), INTERVAL 6 HOUR))
  OR (`último_status` = 'MAN' AND `última atualização` < DATE_SUB(NOW(), INTERVAL 3 HOUR))
)
AND `último_status` NOT IN ('DLV','POD','FINALIZADO','DEP')
```

- **Tabela de deduplicação** (criada via `CREATE TABLE IF NOT EXISTS` na própria function, mesmo padrão do firecrawl):
```sql
CREATE TABLE IF NOT EXISTS dados_dachser.t_air_dep_transition_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  awb VARCHAR(50) NOT NULL,
  status_when_alerted VARCHAR(10) NOT NULL,
  hours_stuck DECIMAL(6,1) NOT NULL,
  alerted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at DATETIME DEFAULT NULL,
  INDEX idx_awb (awb),
  INDEX idx_resolved (resolved)
)
```

- **Deduplicação**: Antes de enviar, verifica se já existe alerta aberto (`resolved = FALSE`) para aquela AWB+status. Se sim, pula.
- **Resolução**: AWBs que saíram da query (evoluíram para DEP ou outro status) e tinham alerta aberto → marca `resolved = TRUE, resolved_at = NOW()`
- **E-mail**: Via Resend para `larissa@z3us.ai` e `devs@z3us.ai`, template HTML no padrão Z3US com:
  - Lista das AWBs paradas agrupadas por status (BKD/RCF/MAN)
  - Horas parado, cliente, rota
  - Link para `/air/tracking`
- **Modos**: `test` (sempre envia) e normal (com deduplicação)

#### 2. Cron (pg_cron)

Agendar execução a cada 30 minutos via migration SQL.

### Detalhes técnicos
- Reutiliza `RESEND_API_KEY` e `MARIADB_*` secrets já configurados
- Template HTML segue o mesmo visual do `firecrawl-monitor-alert` (fundo escuro, logo Z3US, badges coloridos)
- Um único e-mail consolidado por execução (não um por AWB)

