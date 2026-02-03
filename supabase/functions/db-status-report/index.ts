import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

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

// ========== PDF GENERATION (Real PDF using jsPDF) ==========
function generatePdfBuffer(stats: TableStats[], timestamp: Date): Uint8Array {
  const healthyCount = stats.filter(s => s.status === 'healthy').length;
  const warningCount = stats.filter(s => s.status === 'warning').length;
  const criticalCount = stats.filter(s => s.status === 'critical').length;
  const totalInserts = stats.reduce((sum, s) => sum + s.recentInserts, 0);

  const formattedDate = formatDateTime(timestamp);

  // Create PDF document (A4 size)
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
  const dachserYellow = [255, 200, 0];
  const darkText = [30, 30, 35];
  const grayText = [107, 114, 128];
  const greenColor = [34, 197, 94];
  const yellowColor = [245, 158, 11];
  const redColor = [239, 68, 68];
  const lightGray = [243, 244, 246];
  const borderGray = [229, 231, 235];

  // Helper functions
  const setColor = (rgb: number[], type: 'fill' | 'text' | 'draw' = 'fill') => {
    if (type === 'fill') doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    else if (type === 'text') doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    else doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  };

  const getStatusColor = (status: 'healthy' | 'warning' | 'critical'): number[] => {
    switch (status) {
      case 'healthy': return greenColor;
      case 'warning': return yellowColor;
      case 'critical': return redColor;
    }
  };

  // ========== HEADER ==========
  setColor(dachserYellow, 'fill');
  doc.rect(0, 0, pageWidth, 35, 'F');

  setColor(darkText, 'text');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE MONITORAMENTO DE DADOS', margin, 15);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema Z3US.AI - DACHSER', margin, 22);

  doc.setFontSize(9);
  doc.text(`Gerado em: ${formattedDate}`, margin, 29);

  y = 45;

  // ========== RESUMO EXECUTIVO ==========
  // Section title
  setColor(lightGray, 'fill');
  setColor(dachserYellow, 'draw');
  doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin, y + 10);
  
  setColor(darkText, 'text');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO EXECUTIVO', margin + 5, y + 7);
  y += 18;

  // Summary cards
  const cardWidth = (pageWidth - margin * 2 - 10) / 2;

  // Card 1: Processados
  setColor(borderGray, 'draw');
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, cardWidth, 28, 3, 3, 'S');

  setColor(grayText, 'text');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('PROCESSADOS NAS ÚLTIMAS 24H', margin + 5, y + 8);

  setColor(greenColor, 'text');
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`+${formatNumber(totalInserts)}`, margin + 5, y + 22);

  // Card 2: Status
  const card2X = margin + cardWidth + 10;
  setColor(borderGray, 'draw');
  doc.roundedRect(card2X, y, cardWidth, 28, 3, 3, 'S');

  setColor(grayText, 'text');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('SITUAÇÃO DAS ÁREAS', card2X + 5, y + 8);

  // Status indicators
  const statusY = y + 14;
  doc.setFontSize(10);

  // Green dot
  setColor(greenColor, 'fill');
  doc.circle(card2X + 7, statusY, 2, 'F');
  setColor(darkText, 'text');
  doc.setFont('helvetica', 'normal');
  doc.text(`${healthyCount} OK`, card2X + 12, statusY + 1);

  // Yellow dot
  setColor(yellowColor, 'fill');
  doc.circle(card2X + 35, statusY, 2, 'F');
  setColor(darkText, 'text');
  doc.text(`${warningCount} Atenção`, card2X + 40, statusY + 1);

  // Red dot
  setColor(redColor, 'fill');
  doc.circle(card2X + 7, statusY + 8, 2, 'F');
  setColor(darkText, 'text');
  doc.text(`${criticalCount} Crítico`, card2X + 12, statusY + 9);

  y += 38;

  // ========== SITUAÇÃO POR ÁREA ==========
  setColor(lightGray, 'fill');
  setColor(dachserYellow, 'draw');
  doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin, y + 10);
  
  setColor(darkText, 'text');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SITUAÇÃO POR ÁREA', margin + 5, y + 7);
  y += 16;

  // Area cards
  stats.forEach((stat) => {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }

    setColor(borderGray, 'draw');
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 18, 2, 2, 'S');

    // Area name
    setColor(darkText, 'text');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(stat.businessName, margin + 5, y + 7);

    // Last update
    setColor(grayText, 'text');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Última atualização: ${stat.lastUpdate ? formatMinutes(stat.minutesSinceUpdate) : 'Nunca'}`, margin + 5, y + 14);

    // Status badge
    const statusColor = getStatusColor(stat.status);
    const statusLabel = getStatusLabel(stat.status);
    const badgeX = pageWidth - margin - 55;

    // Badge background
    const badgeBgColor = stat.status === 'healthy' ? [220, 252, 231] :
                         stat.status === 'warning' ? [254, 243, 199] : [254, 226, 226];
    setColor(badgeBgColor, 'fill');
    doc.roundedRect(badgeX, y + 2, 50, 7, 2, 2, 'F');

    // Badge text
    const badgeTextColor = stat.status === 'healthy' ? [22, 101, 52] :
                           stat.status === 'warning' ? [146, 64, 14] : [153, 27, 27];
    setColor(badgeTextColor, 'text');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(statusLabel, badgeX + 25, y + 7, { align: 'center' });

    // Inserts count
    setColor(greenColor, 'text');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`+${formatNumber(stat.recentInserts)} processados`, badgeX + 25, y + 14, { align: 'center' });

    y += 22;
  });

  y += 5;

  // ========== O QUE CADA ÁREA REPRESENTA ==========
  if (y > pageHeight - 60) {
    doc.addPage();
    y = 20;
  }

  setColor(lightGray, 'fill');
  setColor(dachserYellow, 'draw');
  doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin, y + 10);
  
  setColor(darkText, 'text');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('O QUE CADA ÁREA REPRESENTA', margin + 5, y + 7);
  y += 15;

  stats.forEach((stat) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }

    setColor(darkText, 'text');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`• ${stat.businessName}:`, margin + 3, y);

    setColor(grayText, 'text');
    doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(stat.businessDescription, pageWidth - margin * 2 - 50);
    doc.text(descLines, margin + 45, y);
    y += descLines.length * 5 + 3;
  });

  y += 5;

  // ========== LEGENDA ==========
  if (y > pageHeight - 50) {
    doc.addPage();
    y = 20;
  }

  setColor(lightGray, 'fill');
  setColor(dachserYellow, 'draw');
  doc.rect(margin, y, pageWidth - margin * 2, 10, 'F');
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin, y + 10);
  
  setColor(darkText, 'text');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('LEGENDA DE STATUS', margin + 5, y + 7);
  y += 15;

  const legendItems = [
    { color: greenColor, label: 'Atualizado', desc: 'Dados recebidos nos últimos 5 minutos' },
    { color: yellowColor, label: 'Verificar', desc: 'Sem atualização entre 5 e 60 minutos' },
    { color: redColor, label: 'Ação Necessária', desc: 'Sem atualização há mais de 60 minutos' },
  ];

  legendItems.forEach((item) => {
    setColor(item.color, 'fill');
    doc.circle(margin + 5, y, 2.5, 'F');

    setColor(darkText, 'text');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, margin + 12, y + 1);

    setColor(grayText, 'text');
    doc.setFont('helvetica', 'normal');
    doc.text(item.desc, margin + 50, y + 1);
    y += 8;
  });

  // ========== FOOTER ==========
  y = pageHeight - 15;
  setColor(borderGray, 'draw');
  doc.setLineWidth(0.3);
  doc.line(margin, y - 5, pageWidth - margin, y - 5);

  setColor(grayText, 'text');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema Z3US.AI • Monitoramento de Dados • DACHSER', pageWidth / 2, y, { align: 'center' });

  // Return as Uint8Array
  const pdfOutput = doc.output('arraybuffer');
  return new Uint8Array(pdfOutput);
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
                            📎 Anexo incluído: <strong style="color: #F5B843;">Relatório PDF</strong>
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
                            Z3US.AI • Enviado a cada 1 hora
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

    // Generate PDF attachment only
    const pdfBuffer = generatePdfBuffer(stats, now);

    console.log('Generated PDF buffer length:', pdfBuffer.length);

    // Generate email HTML
    const emailHtml = generateEmailHtml(stats, now);

    // Send email via Resend with PDF attachment
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = new Resend(resendApiKey);

    // Create attachments array with PDF only
    const attachments = [
      {
        filename: `relatorio-monitoramento-${dateStr}-${timeStr}.pdf`,
        content: Array.from(pdfBuffer),
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
      message: 'Status report sent successfully with PDF attachment',
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
