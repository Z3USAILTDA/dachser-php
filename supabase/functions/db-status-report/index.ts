import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TableStats {
  name: string;
  displayName: string;
  businessName: string;
  businessDescription: string;
  applications: string[];
  lastUpdate: Date | null;
  totalRecords: number;
  recentInserts: number;
  minutesSinceUpdate: number;
  status: 'healthy' | 'warning' | 'critical';
}

const TABLES_CONFIG = [
  { 
    name: 't_master_dados', 
    displayName: 'Master Dados', 
    businessName: 'Dados Operacionais',
    businessDescription: 'Processos de importação e exportação (aéreo e marítimo) - CCT, Tracking, Olimpo',
    applications: ['AIR', 'SEA', 'CCT', 'TRACKING', 'OLIMPO'] 
  },
  { 
    name: 't_dados_financeiro_nfs', 
    displayName: 'Financeiro NFs', 
    businessName: 'Notas Fiscais',
    businessDescription: 'Dados de faturamento para régua de cobrança automática',
    applications: ['REGUA'] 
  },
  { 
    name: 't_dados_financeiro_voucher', 
    displayName: 'Financeiro Voucher', 
    businessName: 'Vouchers/SPO',
    businessDescription: 'Solicitações de pagamento e despesas operacionais',
    applications: ['ESTEIRA'] 
  },
  { 
    name: 'tbaixas', 
    displayName: 'Baixas', 
    businessName: 'Baixas Financeiras',
    businessDescription: 'Comprovantes de pagamento processados pelo robô financeiro',
    applications: ['ESTEIRA'] 
  },
];

const PRODUCTION_RECIPIENTS = ['larissa@z3us.ai'];
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
  if (minutes > 60) return 'critical';
  if (minutes > 5) return 'warning';
  return 'healthy';
}

function getStatusLabel(status: 'healthy' | 'warning' | 'critical'): string {
  switch (status) {
    case 'healthy': return 'Atualizado';
    case 'warning': return 'Verificar';
    case 'critical': return 'Ação Necessária';
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

const LOGO_URL = 'https://finktakbjcfmurqeiubz.supabase.co/storage/v1/object/public/maritime-files/email-assets/logo-z3us.png';

// ========== PDF GENERATION (HTML) ==========
function generatePdfHtml(stats: TableStats[], timestamp: Date): string {
  const healthyCount = stats.filter(s => s.status === 'healthy').length;
  const warningCount = stats.filter(s => s.status === 'warning').length;
  const criticalCount = stats.filter(s => s.status === 'critical').length;
  const totalInserts = stats.reduce((sum, s) => sum + s.recentInserts, 0);

  const formattedDate = formatDateTime(timestamp);

  const getStatusBadgeClass = (status: 'healthy' | 'warning' | 'critical'): string => {
    switch (status) {
      case 'healthy': return 'status-green';
      case 'warning': return 'status-yellow';
      case 'critical': return 'status-red';
    }
  };

  const areaCardsHTML = stats.map((stat) => `
    <div class="area-card">
      <div class="area-info">
        <div class="area-name">${stat.businessName}</div>
        <div class="area-update">Última atualização: ${stat.lastUpdate ? formatMinutes(stat.minutesSinceUpdate) : 'Nunca'}</div>
      </div>
      <div class="area-right">
        <div class="status-badge ${getStatusBadgeClass(stat.status)}">${getStatusLabel(stat.status)}</div>
        <div class="area-inserts">+${formatNumber(stat.recentInserts)} processados</div>
      </div>
    </div>
  `).join("");

  const descriptionsHTML = stats.map((stat) => `
    <div class="desc-item">
      <span class="desc-name">• ${stat.businessName}:</span>
      <span class="desc-text">${stat.businessDescription}</span>
    </div>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Relatório de Monitoramento - DACHSER</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Segoe UI', Arial, sans-serif; 
        padding: 0; color: #333; background: #fff; line-height: 1.5;
      }
      .page { max-width: 800px; margin: 0 auto; padding: 40px; }
      .header { 
        background: #FFC800; color: #1E1E23; padding: 25px 40px; margin: 0 0 30px 0;
      }
      .header-title { font-size: 22px; font-weight: bold; margin-bottom: 5px; }
      .header-subtitle { font-size: 14px; opacity: 0.8; }
      .header-date { font-size: 12px; margin-top: 8px; opacity: 0.7; }
      .section-title {
        font-weight: bold; font-size: 14px; margin: 30px 0 15px 0;
        background: #f3f4f6; padding: 12px 15px; border-left: 4px solid #FFC800; color: #1E1E23;
      }
      .summary-grid { display: flex; gap: 20px; margin-bottom: 10px; }
      .summary-card {
        flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;
      }
      .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; }
      .summary-value { font-size: 28px; font-weight: bold; color: #22c55e; }
      .status-list { margin-top: 5px; }
      .status-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px; }
      .status-dot { width: 12px; height: 12px; border-radius: 50%; }
      .dot-green { background: #22c55e; }
      .dot-yellow { background: #f59e0b; }
      .dot-red { background: #ef4444; }
      .area-card {
        border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; margin-bottom: 12px;
        display: flex; justify-content: space-between; align-items: center; background: #fff;
      }
      .area-info { flex: 1; }
      .area-name { font-weight: 600; font-size: 15px; color: #1E1E23; margin-bottom: 4px; }
      .area-update { font-size: 13px; color: #6b7280; }
      .area-right { text-align: right; }
      .area-inserts { font-size: 13px; color: #22c55e; font-weight: 500; margin-top: 6px; }
      .status-badge { display: inline-block; padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; }
      .status-green { background: #dcfce7; color: #166534; }
      .status-yellow { background: #fef3c7; color: #92400e; }
      .status-red { background: #fee2e2; color: #991b1b; }
      .desc-item { padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
      .desc-item:last-child { border-bottom: none; }
      .desc-name { font-weight: 600; color: #1E1E23; }
      .desc-text { color: #6b7280; }
      .legend-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; font-size: 13px; }
      .legend-label { font-weight: 600; min-width: 120px; }
      .legend-desc { color: #6b7280; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
      @media print {
        body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { padding: 20px 30px; }
        .header { margin: -20px -30px 25px -30px; padding: 20px 30px; }
        .area-card, .summary-card { break-inside: avoid; page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="header-title">RELATÓRIO DE MONITORAMENTO DE DADOS</div>
      <div class="header-subtitle">Sistema Z3US.AI - DACHSER</div>
      <div class="header-date">Gerado em: ${formattedDate}</div>
    </div>
    
    <div class="page">
      <div class="section-title">RESUMO EXECUTIVO</div>
      
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Processados nas últimas 24h</div>
          <div class="summary-value">+${formatNumber(totalInserts)}</div>
        </div>
        
        <div class="summary-card">
          <div class="summary-label">Situação das Áreas</div>
          <div class="status-list">
            <div class="status-row">
              <div class="status-dot dot-green"></div>
              <span>${healthyCount} OK</span>
            </div>
            <div class="status-row">
              <div class="status-dot dot-yellow"></div>
              <span>${warningCount} Atenção</span>
            </div>
            <div class="status-row">
              <div class="status-dot dot-red"></div>
              <span>${criticalCount} Crítico</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="section-title">SITUAÇÃO POR ÁREA</div>
      ${areaCardsHTML}
      
      <div class="section-title">O QUE CADA ÁREA REPRESENTA</div>
      ${descriptionsHTML}
      
      <div class="section-title">LEGENDA DE STATUS</div>
      <div class="legend-item">
        <div class="status-dot dot-green"></div>
        <span class="legend-label">Atualizado</span>
        <span class="legend-desc">Dados recebidos nos últimos 5 minutos</span>
      </div>
      <div class="legend-item">
        <div class="status-dot dot-yellow"></div>
        <span class="legend-label">Verificar</span>
        <span class="legend-desc">Sem atualização entre 5 e 60 minutos</span>
      </div>
      <div class="legend-item">
        <div class="status-dot dot-red"></div>
        <span class="legend-label">Ação Necessária</span>
        <span class="legend-desc">Sem atualização há mais de 60 minutos</span>
      </div>
      
      <div class="footer">
        Sistema Z3US.AI • Monitoramento de Dados • DACHSER
      </div>
    </div>
  </body>
</html>
  `;
}

// ========== EXCEL GENERATION ==========
function generateExcelBuffer(stats: TableStats[], timestamp: Date): Uint8Array {
  const healthyCount = stats.filter(s => s.status === 'healthy').length;
  const warningCount = stats.filter(s => s.status === 'warning').length;
  const criticalCount = stats.filter(s => s.status === 'critical').length;
  const totalInserts = stats.reduce((sum, s) => sum + s.recentInserts, 0);

  const formattedDate = formatDateTime(timestamp);

  const wb = XLSX.utils.book_new();

  const data: (string | number)[][] = [
    ["RELATÓRIO DE MONITORAMENTO DE DADOS - DACHSER", "", "", "", ""],
    [`Sistema Z3US.AI  •  Gerado em: ${formattedDate}`, "", "", "", ""],
    ["", "", "", "", ""],
    ["RESUMO EXECUTIVO", "", "", "", ""],
    ["", "", "", "", ""],
    ["Processados nas últimas 24h", `+${formatNumber(totalInserts)}`, "", "Situação das Áreas", ""],
    ["", "", "", `${healthyCount} OK  •  ${warningCount} Atenção  •  ${criticalCount} Crítico`, ""],
    ["", "", "", "", ""],
    ["SITUAÇÃO POR ÁREA", "", "", "", ""],
    ["Área", "Status", "Última Atualização", "Processados (24h)", ""],
    ...stats.map((stat) => [
      stat.businessName,
      getStatusLabel(stat.status),
      stat.lastUpdate ? formatDateTime(stat.lastUpdate) : 'Nunca atualizado',
      `+${formatNumber(stat.recentInserts)}`,
      "",
    ]),
    ["", "", "", "", ""],
    ["O QUE CADA ÁREA REPRESENTA", "", "", "", ""],
    ...stats.map((stat) => [
      `• ${stat.businessName}`,
      stat.businessDescription,
      "",
      "",
      "",
    ]),
    ["", "", "", "", ""],
    ["LEGENDA DE STATUS", "", "", "", ""],
    ["Atualizado", "Dados recebidos nos últimos 5 minutos", "", "", ""],
    ["Verificar", "Sem atualização entre 5 e 60 minutos", "", "", ""],
    ["Ação Necessária", "Sem atualização há mais de 60 minutos", "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 28 },
    { wch: 45 },
    { wch: 25 },
    { wch: 18 },
    { wch: 5 },
  ];

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 4 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Monitoramento");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Uint8Array(buffer);
}

// ========== EMAIL HTML ==========
function generateEmailHtml(stats: TableStats[], timestamp: Date): string {
  const healthyCount = stats.filter(s => s.status === 'healthy').length;
  const warningCount = stats.filter(s => s.status === 'warning').length;
  const criticalCount = stats.filter(s => s.status === 'critical').length;

  const formattedDate = formatDateTime(timestamp);

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
        ${stat.businessName}
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

  const statusBadge = criticalCount > 0 
    ? '<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Atenção Necessária</span>'
    : '<span style="background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Sistema Operacional</span>';

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Relatório de Status - Z3US.AI</title>
  <style type="text/css">
    body, html { margin: 0 !important; padding: 0 !important; background-color: #050608 !important; }
    table { border-collapse: collapse !important; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 16px !important; }
    }
  </style>
</head>
<body bgcolor="#050608" style="margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #050608 !important;">
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050608" style="background-color: #050608 !important; width: 100%; margin: 0; padding: 0;">
    <tr>
      <td bgcolor="#050608" style="background-color: #050608 !important;">
        
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050608" style="background-color: #050608 !important;">
          <tr>
            <td align="center" bgcolor="#050608" style="padding: 24px; background-color: #050608 !important;">
              
              <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width: 640px; width: 100%;">
                <tr>
                  <td>
                    
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0a0c10; border: 1px solid rgba(245, 184, 67, 0.2); border-radius: 24px; overflow: hidden;">
                      
                      <tr>
                        <td align="center" style="background: linear-gradient(180deg, rgba(245, 184, 67, 0.12) 0%, transparent 100%); padding: 40px 32px 24px; border-bottom: 1px solid rgba(245, 184, 67, 0.1);">
                          <img src="${LOGO_URL}" alt="Z3US.AI" width="120" style="height: 48px; margin-bottom: 20px; display: block;" />
                          <p style="margin: 0 0 8px 0; color: #F5B843; font-size: 13px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Relatório de Status
                          </p>
                          <p style="margin: 0 0 16px 0; color: #ffffff; font-size: 22px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Monitoramento de Banco de Dados
                          </p>
                          ${statusBadge}
                          <p style="margin: 16px 0 0 0; color: #888888; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            ${formattedDate} • São Paulo
                          </p>
                        </td>
                      </tr>
                      
                      <tr>
                        <td style="padding: 24px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding: 12px; width: 33%;">
                                <p style="margin: 0; font-size: 28px; font-weight: 700; color: #22c55e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${healthyCount}</p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Saudáveis</p>
                              </td>
                              <td align="center" style="padding: 12px; width: 33%; border-left: 1px solid rgba(255, 255, 255, 0.08); border-right: 1px solid rgba(255, 255, 255, 0.08);">
                                <p style="margin: 0; font-size: 28px; font-weight: 700; color: #F5B843; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${warningCount}</p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Atenção</p>
                              </td>
                              <td align="center" style="padding: 12px; width: 33%;">
                                <p style="margin: 0; font-size: 28px; font-weight: 700; color: #ef4444; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${criticalCount}</p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Críticas</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <tr>
                        <td style="padding: 0 16px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <tr style="border-bottom: 1px solid rgba(245, 184, 67, 0.15);">
                              <th style="padding: 16px; text-align: left; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Área</th>
                              <th style="padding: 16px; text-align: center; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Atualização</th>
                              <th style="padding: 16px; text-align: right; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Total</th>
                              <th style="padding: 16px; text-align: right; font-weight: 600; color: #F5B843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">24h</th>
                            </tr>
                            ${tableRows}
                          </table>
                        </td>
                      </tr>
                      
                      <tr>
                        <td style="padding: 24px 32px; border-top: 1px solid rgba(255, 255, 255, 0.06);">
                          <p style="margin: 0 0 8px 0; color: #888888; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            📎 Anexos incluídos: <strong style="color: #F5B843;">Relatório PDF</strong> e <strong style="color: #F5B843;">Relatório Excel</strong>
                          </p>
                        </td>
                      </tr>
                      
                      <tr>
                        <td align="center" style="padding: 32px;">
                          <a href="https://stellar-route-hub.lovable.app/admin/database-monitor" 
                             style="display: inline-block; background-color: #F5B843; color: #050608; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Abrir Dashboard
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding: 24px;">
                          <p style="margin: 0; font-size: 12px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Alerta automático do sistema de monitoramento
                          </p>
                          <p style="margin: 8px 0 0 0; font-size: 12px; color: #666666; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            Z3US.AI • Enviado a cada 30 minutos
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
    const testMode = body.test_mode === true;

    console.log(`Running db-status-report in ${testMode ? 'TEST' : 'PRODUCTION'} mode`);

    const recipients = testMode ? TEST_RECIPIENTS : PRODUCTION_RECIPIENTS;

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
          businessName: tableConfig.businessName,
          businessDescription: tableConfig.businessDescription,
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
          businessName: tableConfig.businessName,
          businessDescription: tableConfig.businessDescription,
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

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');

    // Generate attachments
    const pdfHtml = generatePdfHtml(stats, now);
    const excelBuffer = generateExcelBuffer(stats, now);

    console.log('Generated PDF HTML length:', pdfHtml.length);
    console.log('Generated Excel buffer length:', excelBuffer.length);

    // Generate email HTML
    const emailHtml = generateEmailHtml(stats, now);

    // Send email via Resend with attachments
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = new Resend(resendApiKey);

    // Convert HTML string to Uint8Array for PDF attachment
    const pdfEncoder = new TextEncoder();
    const pdfBytes = pdfEncoder.encode(pdfHtml);

    // Create attachments array with proper format for Resend
    // Resend accepts content as Buffer, ArrayBuffer, or base64 string
    const attachments = [
      {
        filename: `relatorio-monitoramento-${dateStr}-${timeStr}.html`,
        content: Array.from(pdfBytes),
      },
      {
        filename: `relatorio-monitoramento-${dateStr}-${timeStr}.xlsx`,
        content: Array.from(excelBuffer),
      },
    ];

    console.log('Sending email with attachments:', attachments.map(a => ({ filename: a.filename, contentLength: a.content.length })));

    const emailResponse = await resend.emails.send({
      from: 'Z3US Monitor <noreply@hermes.z3us.ai>',
      to: recipients,
      subject: `📊 Relatório de Status - Banco de Dados - ${now.toLocaleDateString('pt-BR')}`,
      html: emailHtml,
      attachments: attachments,
    });

    console.log('Email sent successfully with attachments:', emailResponse);

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
      message: 'Status report sent successfully with PDF and Excel attachments',
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
