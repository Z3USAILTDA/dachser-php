

# Historico de ETA nos E-mails de Follow-Up ao Cliente

## Objetivo
Adicionar uma secao "Historico de Alteracoes de ETA" nos e-mails enviados ao cliente (`email_type === 'cliente'`), mostrando todas as variacoes de ETA registradas para aquele container/MBL. Isso atende ao pedido de maior visibilidade e transparencia sobre mudancas de programacao.

## Como funciona hoje
- A edge function `send-container-status-email` recebe dados do container e envia e-mail via Resend
- O e-mail do cliente mostra apenas o ETA atual, sem historico
- A tabela `t_tracking_sea_history` no MariaDB ja armazena o campo `eta` em cada evento, junto com `event_datetime` e `created_at`

## O que sera feito

### Modificacao unica: `supabase/functions/send-container-status-email/index.ts`

1. **Adicionar import do MySQL client** (mesmo padrao de 80+ edge functions existentes):
   ```
   import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
   ```

2. **Criar funcao `fetchEtaHistory`** que conecta ao MariaDB e busca ETAs distintos:
   ```
   SELECT DISTINCT eta,
          MIN(event_datetime) as first_seen
   FROM dados_dachser.t_tracking_sea_history
   WHERE (mbl_id = ? OR container = ?)
     AND eta IS NOT NULL
   GROUP BY eta
   ORDER BY first_seen ASC
   ```

3. **Gerar HTML da secao de historico** - Uma mini-tabela inserida no template do e-mail cliente, entre os dados atuais e a mensagem customizada:

   | Data do Registro | ETA Previsto |
   |---|---|
   | 15/01/2026 | 20/02/2026 |
   | 22/01/2026 | 25/02/2026 |
   | **01/02/2026** | **28/02/2026 (atual)** |

   - Ultima linha destacada em negrito com fundo `#fff5eb`
   - Titulo "Historico de Alteracoes de ETA" com borda esquerda laranja (#FF9933)
   - Se houver apenas 1 ETA (sem alteracoes), exibe "Sem alteracoes de ETA registradas"
   - Se nao houver historico (falha na conexao ou sem dados), a secao nao aparece

4. **Tratamento de erro resiliente** - Se a consulta ao MariaDB falhar, o e-mail e enviado normalmente sem a secao de historico (nao bloqueia o envio)

### Sem alteracoes no payload
O campo `container` (que contem o MBL) e o `mbl` ja existem no request body e serao usados para a consulta.

