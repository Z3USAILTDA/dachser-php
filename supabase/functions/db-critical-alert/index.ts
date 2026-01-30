import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TableStats {
  name: string;
  displayName: string;
  applications: string[];
  lastUpdate: Date | null;
  minutesSinceUpdate: number;
}

interface AlertRecord {
  table_name: string;
  sent_at: Date;
}

const TABLES_CONFIG = [
  { name: 't_master_dados', displayName: 'Master Dados', applications: ['AIR', 'SEA', 'CCT', 'TRACKING', 'OLIMPO'] },
  { name: 't_dados_financeiro_nfs', displayName: 'Financeiro NFs', applications: ['REGUA'] },
  { name: 't_dados_financeiro_voucher', displayName: 'Financeiro Voucher', applications: ['ESTEIRA'] },
  { name: 'tbaixas', displayName: 'Baixas', applications: ['ESTEIRA'] },
];

const CRITICAL_THRESHOLD_MINUTES = 60;
const REALERT_INTERVAL_MINUTES = 30;

const TEST_RECIPIENTS = ['larissa@z3us.ai'];
const PRODUCTION_RECIPIENTS = ['larissa@z3us.ai', 'rodrigo@z3us.ai', 'herbert@z3us.ai'];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectWithRetry(maxRetries = 3): Promise<Client> {
  const host = Deno.env.get('MARIADB_HOST');
  const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
  const database = Deno.env.get('MARIADB_DATABASE');
  const username = Deno.env.get('MARIADB_USER');
  const password = Deno.env.get('MARIADB_PASSWORD');

  if (!host || !database || !username || !password) {
    throw new Error('MariaDB credentials not configured');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connection attempt ${attempt}/${maxRetries} to ${host}:${port}/${database}`);
      const client = await new Client().connect({
        hostname: host,
        port: port,
        db: database,
        username: username,
        password: password,
      });
      console.log('Connected to MariaDB successfully');
      return client;
    } catch (err) {
      const error = err as Error;
      console.error(`Connection attempt ${attempt} failed:`, error.message);
      const isTransient = error.message.toLowerCase().includes('connection reset') || 
                          error.message.includes('os error 104') ||
                          error.message.toLowerCase().includes('broken pipe') ||
                          error.message.toLowerCase().includes('timed out');
      
      if (isTransient && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Waiting ${delay}ms before retry...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  throw new Error('Failed to connect after all retries');
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function generateCriticalAlertHtml(criticalTables: TableStats[], timestamp: Date): string {
  const formattedDate = timestamp.toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const tableCards = criticalTables.map(table => `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 20px; margin-right: 8px;">🔴</span>
        <strong style="color: #991b1b; font-size: 16px;">${table.displayName}</strong>
      </div>
      <p style="margin: 4px 0; color: #7f1d1d; font-size: 14px;">
        <strong>Sem atualização há:</strong> ${formatMinutes(table.minutesSinceUpdate)}
      </p>
      <p style="margin: 4px 0; color: #7f1d1d; font-size: 14px;">
        <strong>Aplicações afetadas:</strong> ${table.applications.join(', ')}
      </p>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%); border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600; letter-spacing: 2px;">
        Z&#8203;3&#8203;U&#8203;S.AI
      </h1>
      <div style="margin-top: 16px;">
        <span style="background-color: rgba(255,255,255,0.2); color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">
          🚨 ALERTA CRÍTICO - BANCO DE DADOS
        </span>
      </div>
      <p style="margin: 16px 0 0 0; color: #fecaca; font-size: 14px;">
        ${formattedDate} (São Paulo)
      </p>
    </div>

    <!-- Content -->
    <div style="background-color: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <!-- Warning Message -->
      <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 14px; color: #92400e;">
          ⚠️ As seguintes tabelas estão sem atualização há mais de <strong>60 minutos</strong> e requerem atenção imediata:
        </p>
      </div>

      <!-- Critical Tables -->
      ${tableCards}

      <!-- Recommendations -->
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-top: 24px;">
        <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #0369a1;">
          📋 Recomendações:
        </p>
        <ul style="margin: 0; padding-left: 20px; color: #0c4a6e; font-size: 14px;">
          <li style="margin-bottom: 6px;">Verificar conectividade do job de sincronização</li>
          <li style="margin-bottom: 6px;">Verificar se há processos travados no servidor de origem</li>
          <li style="margin-bottom: 6px;">Consultar logs do sistema para identificar erros</li>
          <li>Contatar a equipe de infraestrutura se o problema persistir</li>
        </ul>
      </div>

      <!-- CTA -->
      <div style="text-align: center; margin-top: 24px;">
        <a href="https://stellar-route-hub.lovable.app/admin/database-monitor" 
           style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
          Ver Dashboard de Monitoramento
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
      <p style="margin: 0;">Este é um alerta automático do sistema de monitoramento Z3US.AI</p>
      <p style="margin: 8px 0 0 0;">Verificação realizada a cada 30 minutos</p>
    </div>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const testMode = body.test_mode !== false; // Default to test mode

    console.log(`Running db-critical-alert in ${testMode ? 'TEST' : 'PRODUCTION'} mode`);

    const recipients = testMode ? TEST_RECIPIENTS : PRODUCTION_RECIPIENTS;

    // Connect to MariaDB
    client = await connectWithRetry();

    // Ensure the alerts table exists
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS ai_agente.t_db_monitor_alerts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          alert_type VARCHAR(50) NOT NULL,
          table_name VARCHAR(100),
          tables_affected JSON,
          sent_to JSON,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_type_table_sent (alert_type, table_name, sent_at)
        )
      `);
    } catch (err) {
      const createError = err as Error;
      console.warn('Could not create alerts table (may already exist):', createError.message);
    }

    // Get stats for all tables
    const allStats: TableStats[] = [];

    for (const tableConfig of TABLES_CONFIG) {
      try {
        const query = `
          SELECT 
            MAX(data_insert) as last_update,
            TIMESTAMPDIFF(MINUTE, MAX(data_insert), NOW()) as minutes_since_update
          FROM ${tableConfig.name}
        `;
        
        const result = await client.query(query);
        const row = result[0] || {};
        
        allStats.push({
          name: tableConfig.name,
          displayName: tableConfig.displayName,
          applications: tableConfig.applications,
          lastUpdate: row.last_update ? new Date(row.last_update) : null,
          minutesSinceUpdate: row.minutes_since_update ?? 9999,
        });
      } catch (err) {
        const error = err as Error;
        console.error(`Error querying ${tableConfig.name}:`, error.message);
        allStats.push({
          name: tableConfig.name,
          displayName: tableConfig.displayName,
          applications: tableConfig.applications,
          lastUpdate: null,
          minutesSinceUpdate: 9999,
        });
      }
    }

    // Filter critical tables (60+ minutes without update)
    const criticalTables = allStats.filter(t => t.minutesSinceUpdate >= CRITICAL_THRESHOLD_MINUTES);

    if (criticalTables.length === 0) {
      await client.close();
      console.log('No critical tables found. No alert needed.');
      return new Response(JSON.stringify({
        success: true,
        message: 'No critical tables found',
        criticalCount: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which tables need alerts (avoid spam)
    const tablesToAlert: TableStats[] = [];

    for (const table of criticalTables) {
      try {
        // Check if we sent an alert for this table in the last REALERT_INTERVAL_MINUTES
        const checkQuery = `
          SELECT sent_at 
          FROM ai_agente.t_db_monitor_alerts 
          WHERE alert_type = 'critical_alert' 
            AND table_name = ?
            AND sent_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
          ORDER BY sent_at DESC
          LIMIT 1
        `;
        
        const recentAlerts = await client.query(checkQuery, [table.name, REALERT_INTERVAL_MINUTES]);
        
        if (recentAlerts.length === 0) {
          // No recent alert for this table, should send
          tablesToAlert.push(table);
          console.log(`Table ${table.name} needs alert (no recent alert found)`);
        } else {
          console.log(`Table ${table.name} already alerted recently, skipping`);
        }
      } catch (err) {
        const checkError = err as Error;
        // If check fails, include the table to be safe
        console.warn(`Could not check recent alerts for ${table.name}:`, checkError.message);
        tablesToAlert.push(table);
      }
    }

    if (tablesToAlert.length === 0) {
      await client.close();
      console.log('All critical tables were already alerted recently. No new alert needed.');
      return new Response(JSON.stringify({
        success: true,
        message: 'All critical tables already alerted recently',
        criticalCount: criticalTables.length,
        alertedCount: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate and send email
    const now = new Date();
    const emailHtml = generateCriticalAlertHtml(tablesToAlert, now);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = new Resend(resendApiKey);

    const tableNames = tablesToAlert.map(t => t.displayName).join(', ');
    const emailResponse = await resend.emails.send({
      from: 'Z3US Monitor <noreply@hermes.z3us.ai>',
      to: recipients,
      subject: `🚨 ALERTA CRÍTICO - Banco de Dados: ${tableNames}`,
      html: emailHtml,
    });

    console.log('Critical alert email sent successfully:', emailResponse);

    // Log the alerts to database
    for (const table of tablesToAlert) {
      try {
        await client.execute(`
          INSERT INTO ai_agente.t_db_monitor_alerts (alert_type, table_name, tables_affected, sent_to)
          VALUES ('critical_alert', ?, ?, ?)
        `, [table.name, JSON.stringify([table.name]), JSON.stringify(recipients)]);
      } catch (err) {
        const logError = err as Error;
        console.warn(`Could not log alert for ${table.name}:`, logError.message);
      }
    }

    await client.close();
    client = null;

    return new Response(JSON.stringify({
      success: true,
      message: 'Critical alert sent successfully',
      recipients,
      criticalCount: criticalTables.length,
      alertedCount: tablesToAlert.length,
      tables: tablesToAlert.map(t => ({ name: t.name, minutesSinceUpdate: t.minutesSinceUpdate })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in db-critical-alert:', error);

    if (client) {
      try { await client.close(); } catch (e) { console.error('Error closing connection:', e); }
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
