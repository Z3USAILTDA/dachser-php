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
  totalRecords: number;
  recentInserts: number;
  minutesSinceUpdate: number;
  status: 'healthy' | 'warning' | 'critical';
}

const TABLES_CONFIG = [
  { name: 't_master_dados', displayName: 'Master Dados', applications: ['AIR', 'SEA', 'CCT', 'TRACKING', 'OLIMPO'] },
  { name: 't_dados_financeiro_nfs', displayName: 'Financeiro NFs', applications: ['REGUA'] },
  { name: 't_dados_financeiro_voucher', displayName: 'Financeiro Voucher', applications: ['ESTEIRA'] },
  { name: 'tbaixas', displayName: 'Baixas', applications: ['ESTEIRA'] },
];

const TEST_RECIPIENTS = ['larissa@z3us.ai'];

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

function getStatusColor(minutes: number): 'healthy' | 'warning' | 'critical' {
  if (minutes >= 60) return 'critical';
  if (minutes >= 30) return 'warning';
  return 'healthy';
}

function getStatusEmoji(status: 'healthy' | 'warning' | 'critical'): string {
  switch (status) {
    case 'healthy': return '🟢';
    case 'warning': return '🟡';
    case 'critical': return '🔴';
  }
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `há ${hours}h ${mins}min` : `há ${hours}h`;
}

function formatNumber(num: number): string {
  return num.toLocaleString('pt-BR');
}

const LOGO_URL = 'https://finktakbjcfmurqeiubz.supabase.co/storage/v1/object/public/maritime-files/email-assets/logo-z3us.png';

function generateEmailHtml(stats: TableStats[], timestamp: Date): string {
  const healthyCount = stats.filter(s => s.status === 'healthy').length;
  const warningCount = stats.filter(s => s.status === 'warning').length;
  const criticalCount = stats.filter(s => s.status === 'critical').length;

  const formattedDate = timestamp.toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const getStatusBgColor = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy': return 'rgba(34, 197, 94, 0.15)';
      case 'warning': return 'rgba(245, 184, 67, 0.15)';
      case 'critical': return 'rgba(239, 68, 68, 0.15)';
    }
  };

  const getStatusTextColor = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy': return '#22c55e';
      case 'warning': return '#F5B843';
      case 'critical': return '#ef4444';
    }
  };

  const tableRows = stats.map(stat => `
    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
      <td style="padding: 16px; color: #ffffff; font-weight: 500;">
        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${getStatusTextColor(stat.status)}; margin-right: 10px; box-shadow: 0 0 8px ${getStatusTextColor(stat.status)};"></span>
        ${stat.displayName}
      </td>
      <td style="padding: 16px; text-align: center; color: ${stat.minutesSinceUpdate >= 30 ? '#F5B843' : '#B3B3B3'};">
        ${stat.lastUpdate ? formatMinutes(stat.minutesSinceUpdate) : 'N/A'}
      </td>
      <td style="padding: 16px; text-align: right; color: #B3B3B3; font-family: 'Monaco', 'Menlo', monospace;">
        ${formatNumber(stat.totalRecords)}
      </td>
      <td style="padding: 16px; text-align: right;">
        <span style="background: rgba(34, 197, 94, 0.15); color: #22c55e; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600;">
          +${formatNumber(stat.recentInserts)}
        </span>
      </td>
    </tr>
  `).join('');

  const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';
  const statusBadge = criticalCount > 0 
    ? '<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Atenção Necessária</span>'
    : '<span style="background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Sistema Operacional</span>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #050608;">
  <div style="max-width: 640px; margin: 0 auto; padding: 24px;">
    
    <!-- Header Card -->
    <div style="background: linear-gradient(135deg, #0a0c10 0%, #050608 100%); border: 1px solid rgba(245, 184, 67, 0.2); border-radius: 24px; overflow: hidden; box-shadow: 0 0 60px rgba(245, 184, 67, 0.08);">
      
      <!-- Logo & Title Section -->
      <div style="background: radial-gradient(ellipse at top, rgba(245, 184, 67, 0.12) 0%, transparent 70%); padding: 40px 32px 24px; text-align: center; border-bottom: 1px solid rgba(245, 184, 67, 0.1);">
        <img src="${LOGO_URL}" alt="Z3US.AI" style="height: 48px; margin-bottom: 20px;" />
        <h1 style="margin: 0 0 8px 0; color: #F5B843; font-size: 13px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase;">
          Relatório de Status
        </h1>
        <p style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 600;">
          Monitoramento de Banco de Dados
        </p>
        ${statusBadge}
        <p style="margin: 16px 0 0 0; color: #666666; font-size: 13px;">
          ${formattedDate} • São Paulo
        </p>
      </div>

      <!-- Summary Stats -->
      <div style="padding: 24px 32px; display: flex; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
        <table style="width: 100%;">
          <tr>
            <td style="text-align: center; padding: 12px;">
              <div style="font-size: 28px; font-weight: 700; color: #22c55e;">${healthyCount}</div>
              <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Saudáveis</div>
            </td>
            <td style="text-align: center; padding: 12px; border-left: 1px solid rgba(255, 255, 255, 0.08); border-right: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="font-size: 28px; font-weight: 700; color: #F5B843;">${warningCount}</div>
              <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Atenção</div>
            </td>
            <td style="text-align: center; padding: 12px;">
              <div style="font-size: 28px; font-weight: 700; color: #ef4444;">${criticalCount}</div>
              <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Críticas</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Data Table -->
      <div style="padding: 0 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(245, 184, 67, 0.15);">
              <th style="padding: 16px; text-align: left; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Tabela</th>
              <th style="padding: 16px; text-align: center; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Atualização</th>
              <th style="padding: 16px; text-align: right; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Total</th>
              <th style="padding: 16px; text-align: right; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">24h</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>

      <!-- CTA Button -->
      <div style="padding: 32px; text-align: center;">
        <a href="https://stellar-route-hub.lovable.app/admin/database-monitor" 
           style="display: inline-block; background: linear-gradient(135deg, #F5B843 0%, #FFC800 100%); color: #050608; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 20px rgba(245, 184, 67, 0.3);">
          Abrir Dashboard
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px; color: #444444; font-size: 12px;">
      <p style="margin: 0;">Alerta automático do sistema de monitoramento</p>
      <p style="margin: 8px 0 0 0; color: #333333;">Z3US.AI • Enviado a cada 30 minutos</p>
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

    console.log(`Running db-status-report in ${testMode ? 'TEST' : 'PRODUCTION'} mode`);

    const recipients = TEST_RECIPIENTS; // Always send to test recipients for now

    // Connect to MariaDB
    client = await connectWithRetry();

    const stats: TableStats[] = [];

    for (const tableConfig of TABLES_CONFIG) {
      try {
        const query = `
          SELECT 
            MAX(data_insert) as last_update, 
            COUNT(*) as total_records,
            SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts,
            TIMESTAMPDIFF(MINUTE, MAX(data_insert), NOW()) as minutes_since_update
          FROM ${tableConfig.name}
        `;
        
        const result = await client.query(query);
        const row = result[0] || {};
        
        const minutesSinceUpdate = row.minutes_since_update ?? 9999;
        
        stats.push({
          name: tableConfig.name,
          displayName: tableConfig.displayName,
          applications: tableConfig.applications,
          lastUpdate: row.last_update ? new Date(row.last_update) : null,
          totalRecords: Number(row.total_records) || 0,
          recentInserts: Number(row.recent_inserts) || 0,
          minutesSinceUpdate: minutesSinceUpdate,
          status: getStatusColor(minutesSinceUpdate),
        });
      } catch (err) {
        const error = err as Error;
        console.error(`Error querying ${tableConfig.name}:`, error.message);
        stats.push({
          name: tableConfig.name,
          displayName: tableConfig.displayName,
          applications: tableConfig.applications,
          lastUpdate: null,
          totalRecords: 0,
          recentInserts: 0,
          minutesSinceUpdate: 9999,
          status: 'critical',
        });
      }
    }

    await client.close();
    client = null;

    // Generate email
    const now = new Date();
    const emailHtml = generateEmailHtml(stats, now);

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = new Resend(resendApiKey);

    const emailResponse = await resend.emails.send({
      from: 'Z3US Monitor <noreply@hermes.z3us.ai>',
      to: recipients,
      subject: `📊 Relatório de Status - Banco de Dados - ${now.toLocaleDateString('pt-BR')}`,
      html: emailHtml,
    });

    console.log('Email sent successfully:', emailResponse);

    // Log the alert to MariaDB
    try {
      client = await connectWithRetry();
      await client.execute(`
        INSERT INTO ai_agente.t_db_monitor_alerts (alert_type, tables_affected, sent_to)
        VALUES ('status_report', ?, ?)
      `, [JSON.stringify(stats.map(s => s.name)), JSON.stringify(recipients)]);
      await client.close();
      client = null;
    } catch (err) {
      const logError = err as Error;
      console.warn('Could not log alert to database:', logError.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Status report sent successfully',
      recipients,
      stats: stats.map(s => ({ name: s.name, status: s.status, minutesSinceUpdate: s.minutesSinceUpdate })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in db-status-report:', error);

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
