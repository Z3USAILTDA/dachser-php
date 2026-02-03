import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

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

const TEST_RECIPIENTS = ['larissa@z3us.ai'];
const PRODUCTION_RECIPIENTS = [
  'larissa@z3us.ai',
  'rodrigo@z3us.ai',
  'ana.tozzo@dachser.com',
  'danilo.pedroso@dachser.com',
  'herbert@z3us.ai'
];

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

function formatDateTime(date: Date): string {
  return date.toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatNumber(num: number): string {
  return num.toLocaleString('pt-BR');
}

function getStatusLabel(status: 'healthy' | 'warning' | 'critical'): string {
  switch (status) {
    case 'healthy': return 'Atualizado';
    case 'warning': return 'Verificar';
    case 'critical': return 'Ação Necessária';
  }
}

const LOGO_URL = 'https://finktakbjcfmurqeiubz.supabase.co/storage/v1/object/public/maritime-files/email-assets/logo-z3us.png';

// ========== PDF GENERATION FOR CRITICAL ALERT ==========
function generateCriticalAlertPdf(criticalTables: TableStats[], timestamp: Date): Uint8Array {
  const formattedDate = formatDateTime(timestamp);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 0;

  // Colors
  const criticalRed = [239, 68, 68];
  const darkText = [30, 30, 35];
  const grayText = [107, 114, 128];
  const yellowColor = [245, 184, 67];
  const lightGray = [243, 244, 246];
  const borderGray = [229, 231, 235];

  const setColor = (rgb: number[], type: 'fill' | 'text' | 'draw' = 'fill') => {
    if (type === 'fill') doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    else if (type === 'text') doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    else doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  };

  // ========== HEADER ==========
  setColor(criticalRed, 'fill');
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('🚨 ALERTA CRÍTICO - BANCO DE DADOS', margin, 15);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema Z3US.AI - DACHSER', margin, 22);

  doc.setFontSize(9);
  doc.text(`Gerado em: ${formattedDate}`, margin, 29);

  y = 45;

  // ========== RESUMO ==========
  setColor(lightGray, 'fill');
  setColor(criticalRed, 'draw');
  doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin, y + 10);
  
  setColor(darkText, 'text');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TABELAS EM ESTADO CRÍTICO', margin + 5, y + 7);
  y += 18;

  // Warning box
  setColor([254, 226, 226], 'fill');
  setColor(criticalRed, 'draw');
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 3, 3, 'FD');

  setColor(criticalRed, 'text');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${criticalTables.length} tabela${criticalTables.length > 1 ? 's' : ''} sem atualização há mais de 60 minutos`, margin + 8, y + 9);

  setColor([153, 27, 27], 'text');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Ação imediata necessária para garantir a continuidade dos processos.', margin + 8, y + 17);

  y += 32;

  // ========== TABLE DETAILS ==========
  setColor(lightGray, 'fill');
  setColor(criticalRed, 'draw');
  doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin, y + 10);
  
  setColor(darkText, 'text');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHES DAS TABELAS AFETADAS', margin + 5, y + 7);
  y += 16;

  // Table header
  setColor(borderGray, 'draw');
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 2, 2, 'S');

  setColor(grayText, 'text');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TABELA', margin + 5, y + 7);
  doc.text('SEM ATUALIZAÇÃO', pageWidth / 2, y + 7, { align: 'center' });
  doc.text('APLICAÇÕES', pageWidth - margin - 5, y + 7, { align: 'right' });
  y += 14;

  // Table rows
  criticalTables.forEach((table) => {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }

    setColor(borderGray, 'draw');
    doc.roundedRect(margin, y, pageWidth - margin * 2, 14, 2, 2, 'S');

    // Red indicator
    setColor(criticalRed, 'fill');
    doc.circle(margin + 7, y + 7, 2.5, 'F');

    setColor(darkText, 'text');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(table.displayName, margin + 14, y + 8);

    setColor(criticalRed, 'text');
    doc.setFont('helvetica', 'bold');
    doc.text(formatMinutes(table.minutesSinceUpdate), pageWidth / 2, y + 8, { align: 'center' });

    setColor(yellowColor, 'text');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(table.applications.join(', '), pageWidth - margin - 5, y + 8, { align: 'right' });

    y += 18;
  });

  y += 8;

  // ========== RECOMMENDATIONS ==========
  if (y > pageHeight - 60) {
    doc.addPage();
    y = 20;
  }

  setColor(lightGray, 'fill');
  setColor(yellowColor, 'draw');
  doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin, y + 10);
  
  setColor(darkText, 'text');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('📋 RECOMENDAÇÕES', margin + 5, y + 7);
  y += 15;

  const recommendations = [
    'Verificar conectividade do job de sincronização',
    'Verificar processos travados no servidor',
    'Consultar logs do sistema para identificar erros',
    'Contatar equipe de infraestrutura se necessário'
  ];

  recommendations.forEach((rec) => {
    setColor(grayText, 'text');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`• ${rec}`, margin + 5, y);
    y += 6;
  });

  // ========== FOOTER ==========
  y = pageHeight - 15;
  setColor(borderGray, 'draw');
  doc.setLineWidth(0.3);
  doc.line(margin, y - 5, pageWidth - margin, y - 5);

  setColor(grayText, 'text');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema Z3US.AI • Alerta Crítico de Monitoramento • DACHSER', pageWidth / 2, y, { align: 'center' });

  const pdfOutput = doc.output('arraybuffer');
  return new Uint8Array(pdfOutput);
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
                            Z3US.AI • Verificação a cada 1 hora
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

    // Ensure the alerts table exists with recovered_at column
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS ai_agente.t_db_monitor_alerts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          alert_type VARCHAR(50) NOT NULL,
          table_name VARCHAR(100),
          tables_affected JSON,
          sent_to JSON,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          recovered_at TIMESTAMP NULL DEFAULT NULL,
          INDEX idx_type_table_sent (alert_type, table_name, sent_at),
          INDEX idx_type_table_recovered (alert_type, table_name, recovered_at)
        )
      `);
    } catch (err) {
      const createError = err as Error;
      console.warn('Could not create alerts table (may already exist):', createError.message);
    }

    // Ensure recovered_at column exists (for existing tables)
    try {
      await client.execute(`
        ALTER TABLE ai_agente.t_db_monitor_alerts 
        ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMP NULL DEFAULT NULL
      `);
    } catch (err) {
      // Column may already exist - ignore error
      console.log('recovered_at column check completed');
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

    // First, mark any recovered tables (tables that were critical but are now healthy)
    // This ensures we track the recovery state before checking for new alerts
    for (const tableConfig of TABLES_CONFIG) {
      const isCurrentlyCritical = criticalTables.some(t => t.name === tableConfig.name);
      
      if (!isCurrentlyCritical) {
        // Table is now healthy - mark any unresolved alerts as recovered
        try {
          const updateResult = await client.execute(`
            UPDATE ai_agente.t_db_monitor_alerts 
            SET recovered_at = NOW()
            WHERE alert_type = 'critical_alert' 
              AND table_name = ?
              AND recovered_at IS NULL
          `, [tableConfig.name]);
          
          if (updateResult.affectedRows && updateResult.affectedRows > 0) {
            console.log(`Marked table ${tableConfig.name} as RECOVERED`);
          }
        } catch (err) {
          const updateError = err as Error;
          console.warn(`Could not mark ${tableConfig.name} as recovered:`, updateError.message);
        }
      }
    }

    // Check if there are NEW critical tables (no active unresolved alert)
    const newCriticalTables: TableStats[] = [];

    if (forceAlert) {
      console.log('Force mode enabled - treating all critical tables as new');
      newCriticalTables.push(...criticalTables);
    } else {
      for (const table of criticalTables) {
        try {
          // Find the most recent alert for this table that hasn't recovered
          const checkQuery = `
            SELECT id, sent_at, recovered_at 
            FROM ai_agente.t_db_monitor_alerts 
            WHERE alert_type = 'critical_alert' 
              AND table_name = ?
              AND recovered_at IS NULL
            ORDER BY sent_at DESC
            LIMIT 1
          `;
          
          const unresolvedAlerts = await client.query(checkQuery, [table.name]);
          
          if (unresolvedAlerts.length === 0) {
            // No unresolved alert - this is a NEW critical state (either first time or recovered and critical again)
            newCriticalTables.push(table);
            console.log(`Table ${table.name} is NEW in critical status (no active unresolved alert)`);
          } else {
            // Already has an active (unrecovered) alert - don't send again
            console.log(`Table ${table.name} still in critical status (alert from ${unresolvedAlerts[0].sent_at}, not recovered)`);
          }
        } catch (err) {
          const checkError = err as Error;
          // If check fails, consider it new to be safe
          console.warn(`Could not check unresolved alerts for ${table.name}:`, checkError.message);
          newCriticalTables.push(table);
        }
      }
    }

    // Only send alert if there are NEW critical tables
    if (newCriticalTables.length === 0) {
      await client.close();
      console.log('No NEW critical tables detected. All critical tables were already alerted recently.');
      return new Response(JSON.stringify({
        success: true,
        message: 'No new critical tables - all were already alerted',
        criticalCount: criticalTables.length,
        newCriticalCount: 0,
        alertedCount: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${newCriticalTables.length} NEW critical table(s). Will send alert with ALL ${criticalTables.length} critical tables.`);

    // When there are new critical tables, send alert with ALL critical tables (not just new ones)

    // Generate and send email with ALL critical tables
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    
    const emailHtml = generateCriticalAlertHtml(criticalTables, now);
    
    // Generate PDF attachment
    const pdfBuffer = generateCriticalAlertPdf(criticalTables, now);
    console.log('Generated critical alert PDF buffer length:', pdfBuffer.length);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = new Resend(resendApiKey);

    const tableNames = criticalTables.map(t => t.displayName).join(', ');
    
    // Create attachments array with PDF
    const attachments = [
      {
        filename: `alerta-critico-${dateStr}-${timeStr}.pdf`,
        content: Array.from(pdfBuffer),
      },
    ];

    console.log('Sending critical alert email with attachments:', attachments.map(a => ({ filename: a.filename, contentLength: a.content.length })));

    const emailResponse = await resend.emails.send({
      from: 'Z3US Monitor <noreply@hermes.z3us.ai>',
      to: recipients,
      subject: `🚨 ALERTA CRÍTICO - Banco de Dados: ${tableNames}`,
      html: emailHtml,
      attachments: attachments,
    });

    console.log('Critical alert email sent successfully with PDF attachment:', emailResponse);

    // Log the alerts to database - only log the NEW critical tables
    for (const table of newCriticalTables) {
      try {
        await client.execute(`
          INSERT INTO ai_agente.t_db_monitor_alerts (alert_type, table_name, tables_affected, sent_to)
          VALUES ('critical_alert', ?, ?, ?)
        `, [table.name, JSON.stringify(criticalTables.map(t => t.name)), JSON.stringify(recipients)]);
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
      newCriticalCount: newCriticalTables.length,
      alertedTables: criticalTables.map(t => ({ name: t.name, minutesSinceUpdate: t.minutesSinceUpdate })),
      newTables: newCriticalTables.map(t => t.name),
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
