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
const PRODUCTION_RECIPIENTS = ['larissa@z3us.ai', 'rodrigo@z3us.ai'];

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

const LOGO_URL = 'https://finktakbjcfmurqeiubz.supabase.co/storage/v1/object/public/maritime-files/email-assets/logo-z3us.png';

function generateCriticalAlertHtml(criticalTables: TableStats[], timestamp: Date): string {
  const formattedDate = timestamp.toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const tableRows = criticalTables.map(table => `
    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
      <td style="padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width: 12px; padding-right: 10px;">
              <div style="width: 10px; height: 10px; border-radius: 50%; background-color: #ef4444;"></div>
            </td>
            <td style="color: #ffffff; font-weight: 500;">
              ${table.displayName}
            </td>
          </tr>
        </table>
      </td>
      <td style="padding: 16px; text-align: center; color: #ef4444; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${formatMinutes(table.minutesSinceUpdate)}
      </td>
      <td style="padding: 16px; text-align: right; color: #F5B843; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${table.applications.join(', ')}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Alerta Crítico - Z3US.AI</title>
  <style type="text/css">
    body, html { margin: 0 !important; padding: 0 !important; background-color: #050608 !important; }
    table { border-collapse: collapse !important; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 16px !important; }
    }
  </style>
</head>
<body bgcolor="#050608" style="margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #050608 !important;">
  
  <!-- Wrapper Table -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050608" style="background-color: #050608 !important; width: 100%; margin: 0; padding: 0;">
    <tr>
      <td bgcolor="#050608" style="background-color: #050608 !important;">
        
        <!-- Outer Padding Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050608" style="background-color: #050608 !important;">
          <tr>
            <td align="center" bgcolor="#050608" style="padding: 24px; background-color: #050608 !important;">
              
              <!-- Content Container -->
              <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width: 640px; width: 100%;">
                <tr>
                  <td>
                    
                    <!-- Main Card -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0a0c10; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 24px; overflow: hidden;">
                      
                      <!-- Header Section -->
                      <tr>
                        <td align="center" style="background: linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, transparent 100%); padding: 40px 32px 24px; border-bottom: 1px solid rgba(239, 68, 68, 0.1);">
                          <img src="${LOGO_URL}" alt="Z3US.AI" width="120" style="height: 48px; margin-bottom: 20px; display: block;" />
                          <p style="margin: 0 0 8px 0; color: #ef4444; font-size: 13px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            🚨 Alerta Crítico
                          </p>
                          <p style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Monitoramento de Banco de Dados
                          </p>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background-color: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                ${criticalTables.length} Tabela${criticalTables.length > 1 ? 's' : ''} Crítica${criticalTables.length > 1 ? 's' : ''}
                              </td>
                            </tr>
                          </table>
                          <p style="margin: 16px 0 0 0; color: #888888; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            ${formattedDate} • São Paulo
                          </p>
                        </td>
                      </tr>
                      
                      <!-- Warning Message -->
                      <tr>
                        <td style="padding: 24px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding: 12px;">
                                <p style="margin: 0; font-size: 14px; color: #cccccc; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                  As seguintes tabelas estão sem atualização há mais de <strong style="color: #ef4444;">60 minutos</strong> e requerem atenção imediata.
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Data Table Section -->
                      <tr>
                        <td style="padding: 0 16px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <tr style="border-bottom: 1px solid rgba(239, 68, 68, 0.15);">
                              <th style="padding: 16px; text-align: left; font-weight: 600; color: #ef4444; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Tabela</th>
                              <th style="padding: 16px; text-align: center; font-weight: 600; color: #ef4444; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Sem Atualização</th>
                              <th style="padding: 16px; text-align: right; font-weight: 600; color: #ef4444; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Aplicações</th>
                            </tr>
                            ${tableRows}
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Recommendations -->
                      <tr>
                        <td style="padding: 24px 32px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;">
                            <tr>
                              <td style="padding: 16px 20px;">
                                <p style="margin: 0 0 12px 0; font-size: 12px; font-weight: 600; color: #F5B843; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                  📋 Recomendações
                                </p>
                                <p style="margin: 0; color: #999999; font-size: 13px; line-height: 1.8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                  • Verificar conectividade do job de sincronização<br/>
                                  • Verificar processos travados no servidor<br/>
                                  • Consultar logs do sistema
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- CTA Button -->
                      <tr>
                        <td align="center" style="padding: 8px 32px 32px;">
                          <a href="https://stellar-route-hub.lovable.app/admin/database-monitor" 
                             style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Abrir Dashboard
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Footer -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding: 24px;">
                          <p style="margin: 0; font-size: 12px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Alerta automático do sistema de monitoramento
                          </p>
                          <p style="margin: 8px 0 0 0; font-size: 12px; color: #666666; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Z3US.AI • Verificação a cada 30 minutos
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
  
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
    const testMode = body.test_mode === true; // Default to production mode
    const forceAlert = body.force === true; // Force send even if recently alerted

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

    // Check which tables need alerts (avoid spam) - unless force is true
    const tablesToAlert: TableStats[] = [];

    if (forceAlert) {
      console.log('Force mode enabled - skipping duplicate check');
      tablesToAlert.push(...criticalTables);
    } else {
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
