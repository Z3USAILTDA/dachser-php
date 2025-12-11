import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// VALIDAÇÃO DE SCHEMA (ZOD)
// ============================================

// Schema para notificação de evento
const NotificationPayloadSchema = z.object({
  shipment_id: z.string().uuid("shipment_id deve ser UUID válido"),
  evento_codigo: z.string().min(1, "evento_codigo é obrigatório").max(50, "evento_codigo muito longo"),
  evento_descricao: z.string().min(1, "evento_descricao é obrigatório").max(500, "evento_descricao muito longo"),
  evento_data: z.string().refine((val) => !isNaN(Date.parse(val)), "evento_data deve ser data válida"),
});

// Schema para notificação de exceção
const ExcecaoPayloadSchema = z.object({
  type: z.literal("excecao"),
  excecao_id: z.string().uuid("excecao_id deve ser UUID válido"),
  shipment_id: z.string().uuid("shipment_id deve ser UUID válido"),
  tipo_excecao: z.enum(["HOUSE_NAO_ENCONTRADO", "API_INDISPONIVEL", "DIVERGENCIA_DADOS", "ATRASO_EVENTO"]),
  descricao: z.string().min(1).max(1000, "descricao muito longa"),
  created_at: z.string(),
  fonte_detectou: z.string().max(100).optional(),
  is_critical_treatment: z.boolean().optional(),
  divergencia_peso_pct: z.number().nullable().optional(),
  peso_declarado: z.number().nullable().optional(),
  peso_constatado: z.number().nullable().optional(),
  tratamentos_especiais: z.array(z.string().max(10)).nullable().optional(),
});

// Union schema para payload geral
const PayloadSchema = z.union([
  ExcecaoPayloadSchema,
  NotificationPayloadSchema,
]);

// Função de validação com sanitização
function validateAndSanitize<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return { success: false, error: `Validação falhou: ${messages}` };
    }
    return { success: false, error: 'Payload inválido' };
  }
}

// Sanitiza strings para prevenir injection em HTML emails
function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================
// TIPOS E INTERFACES
// ============================================

interface NotificationPayload {
  shipment_id: string;
  evento_codigo: string;
  evento_descricao: string;
  evento_data: string;
}

interface ExcecaoPayload {
  type: "excecao";
  excecao_id: string;
  shipment_id: string;
  tipo_excecao: string;
  descricao: string;
  created_at: string;
  fonte_detectou?: string;
  is_critical_treatment?: boolean;
  divergencia_peso_pct?: number | null;
  peso_declarado?: number | null;
  peso_constatado?: number | null;
  tratamentos_especiais?: string[] | null;
}

interface Shipment {
  id: string;
  master: string;
  house: string;
  aeroporto_origem: string;
  aeroporto_destino: string;
  cliente: string;
  cnpj_consignatario: string | null;
  peso_declarado?: number | null;
  peso_constatado?: number | null;
  emails_cliente?: string | null;
  email_analista?: string | null;
  nome_analista_legado?: string | null;
  analista?: { id: string; nome: string; email?: string } | null;
}

interface NotificationRule {
  id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  cnpj_consignatario: string | null;
  aeroportos: string[];
  eventos_disparo: string[];
  canais: string[];
  template_id: string;
  ativo: boolean;
}

// ============================================
// CONSTANTES
// ============================================

const DIVERGENCIA_THRESHOLD_PCT = 15;

const TIPO_EXCECAO_LABELS: Record<string, string> = {
  HOUSE_NAO_ENCONTRADO: "House não encontrado",
  API_INDISPONIVEL: "API indisponível",
  DIVERGENCIA_DADOS: "Divergência de dados",
  ATRASO_EVENTO: "Atraso de evento",
};

const TRATAMENTOS_CRITICOS: Record<string, string> = {
  DGR: "Mercadoria Perigosa (Dangerous Goods)",
  RRE: "Radioativo Categoria I",
  RRY: "Radioativo Categoria II/III",
  ELI: "Baterias de Lítio Ion",
  ELM: "Baterias de Lítio Metal",
  RCM: "Carga Perigosa Acessível",
  ICE: "Gelo Seco (CO2 sólido)",
  MAG: "Materiais Magnetizados",
  AVI: "Animais Vivos",
  HEG: "Ovos para Incubação",
};

// ============================================
// ESTILOS BASE
// ============================================

const baseStyles = {
  container: 'font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;',
  header: 'background: #1a1a1a; color: #fff; padding: 20px; text-align: center;',
  headerTitle: 'margin: 0; color: #F2A007;',
  headerSubtitle: 'margin: 5px 0 0; color: #a6a6a6;',
  body: 'background: #fff; padding: 20px; border: 1px solid #ddd;',
  bodyAlerta: 'background: #fff; padding: 20px; border: 1px solid #ddd; border-left: 4px solid #dc3545;',
  table: 'width: 100%; border-collapse: collapse; margin: 15px 0;',
  td: 'padding: 8px; border-bottom: 1px solid #eee;',
  tdLabel: 'padding: 8px; border-bottom: 1px solid #eee; color: #666; width: 140px;',
  footer: 'text-align: center; padding: 15px; color: #999; font-size: 12px;',
  alertBox: 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px; margin: 15px 0;',
  dangerBox: 'background: #f8d7da; border: 1px solid #dc3545; border-radius: 4px; padding: 12px; margin: 15px 0;',
};

// ============================================
// TEMPLATES DE EMAIL
// ============================================

// Header comum a todos os templates
function emailHeader(subtitle: string): string {
  return `
    <div style="${baseStyles.header}">
      <h1 style="${baseStyles.headerTitle}">Z3US CCT</h1>
      <p style="${baseStyles.headerSubtitle}">${subtitle}</p>
    </div>
  `;
}

// Footer comum
function emailFooter(): string {
  return `
    <div style="${baseStyles.footer}">
      <p>Este é um e-mail automático do sistema Z3US CCT</p>
      <p>Sistema Hermes - Dachser Air Cargo</p>
    </div>
  `;
}

// Tabela de dados do shipment
function shipmentTable(s: Shipment, evento?: { codigo: string; descricao: string; data: string }): string {
  const rows = [
    { label: 'Master (MAWB)', value: s.master, bold: true },
    { label: 'House (HAWB)', value: s.house, bold: true },
    { label: 'Cliente', value: s.cliente },
    { label: 'Rota', value: `${s.aeroporto_origem} → ${s.aeroporto_destino}` },
  ];
  
  if (evento) {
    rows.push({ label: 'Evento', value: evento.codigo, bold: true });
    rows.push({ label: 'Descrição', value: evento.descricao });
    rows.push({ label: 'Data/Hora', value: new Date(evento.data).toLocaleString('pt-BR') });
  }
  
  return `
    <table style="${baseStyles.table}">
      ${rows.map(r => `
        <tr>
          <td style="${baseStyles.tdLabel}">${r.label}:</td>
          <td style="${baseStyles.td}${r.bold ? ' font-weight: bold;' : ''}">${r.value}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

// TEMPLATE PADRÃO - Completo com todos os detalhes
function templatePadrao(s: Shipment, evento: { codigo: string; descricao: string; data: string }): string {
  return `
    <div style="${baseStyles.container}">
      ${emailHeader('Notificação de Evento CCT')}
      <div style="${baseStyles.body}">
        <h2 style="color: #333; margin-top: 0;">📋 Atualização de Evento</h2>
        <p>Um novo evento foi registrado para o processo abaixo.</p>
        ${shipmentTable(s, evento)}
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          Acompanhe o processo pelo painel CCT para mais detalhes.
        </p>
      </div>
      ${emailFooter()}
    </div>
  `;
}

// TEMPLATE RESUMIDO - Versão compacta
function templateResumido(s: Shipment, evento: { codigo: string; descricao: string; data: string }): string {
  return `
    <div style="${baseStyles.container}">
      ${emailHeader('Atualização Rápida')}
      <div style="${baseStyles.body}">
        <p style="margin: 0;"><strong>${evento.codigo}</strong> - ${s.house}</p>
        <p style="margin: 5px 0; color: #666;">${evento.descricao}</p>
        <p style="margin: 5px 0; font-size: 12px; color: #999;">
          ${s.cliente} | ${s.aeroporto_destino} | ${new Date(evento.data).toLocaleString('pt-BR')}
        </p>
      </div>
      ${emailFooter()}
    </div>
  `;
}

// TEMPLATE ALERTA - Estilo de alerta/crítico
function templateAlerta(s: Shipment, evento: { codigo: string; descricao: string; data: string }): string {
  return `
    <div style="${baseStyles.container}">
      ${emailHeader('⚠️ Alerta CCT')}
      <div style="${baseStyles.bodyAlerta}">
        <h2 style="color: #dc3545; margin-top: 0;">⚠️ Atenção Necessária</h2>
        <p>Um evento que requer atenção foi registrado.</p>
        <div style="${baseStyles.dangerBox}">
          <strong style="color: #721c24;">Evento: ${evento.codigo}</strong>
          <p style="margin: 8px 0 0; color: #856404;">${evento.descricao}</p>
        </div>
        ${shipmentTable(s)}
        <p style="color: #dc3545; font-size: 14px; font-weight: bold; margin-top: 20px;">
          ⏰ Verifique o sistema para ações necessárias.
        </p>
      </div>
      ${emailFooter()}
    </div>
  `;
}

// Seletor de template
function getEmailTemplate(templateId: string, s: Shipment, evento: { codigo: string; descricao: string; data: string }): string {
  switch (templateId) {
    case 'tpl-cct-resumido':
      return templateResumido(s, evento);
    case 'tpl-cct-alerta':
      return templateAlerta(s, evento);
    case 'tpl-cct-padrao':
    default:
      return templatePadrao(s, evento);
  }
}

// ============================================
// TEMPLATES ESPECIAIS (Exceções)
// ============================================

function templateExcecao(
  s: Shipment,
  excecao: { tipo: string; descricao: string; created_at: string },
  divergencia?: { peso_declarado?: number | null; peso_constatado?: number | null; divergencia_pct?: number | null }
): string {
  const tipoLabel = TIPO_EXCECAO_LABELS[excecao.tipo] || excecao.tipo;
  
  let divergenciaSection = '';
  if (divergencia?.divergencia_pct != null && divergencia.peso_declarado && divergencia.peso_constatado) {
    const cor = divergencia.divergencia_pct > DIVERGENCIA_THRESHOLD_PCT ? '#dc3545' : '#ffc107';
    divergenciaSection = `
      <div style="background: #f8d7da; border: 1px solid ${cor}; border-radius: 4px; padding: 12px; margin: 15px 0;">
        <strong style="color: ${cor};">📊 Divergência de Peso:</strong>
        <table style="width: 100%; margin-top: 8px;">
          <tr><td style="color: #666;">Declarado:</td><td style="font-weight: bold;">${divergencia.peso_declarado.toFixed(3)} kg</td></tr>
          <tr><td style="color: #666;">Constatado:</td><td style="font-weight: bold;">${divergencia.peso_constatado.toFixed(3)} kg</td></tr>
          <tr><td style="color: #666;">Diferença:</td><td style="font-weight: bold; color: ${cor};">${divergencia.divergencia_pct.toFixed(2)}%</td></tr>
        </table>
      </div>
    `;
  }
  
  return `
    <div style="${baseStyles.container}">
      ${emailHeader('Exceção Operacional')}
      <div style="${baseStyles.bodyAlerta}">
        <h2 style="color: #dc3545; margin-top: 0;">⚠️ Nova Exceção Detectada</h2>
        <div style="${baseStyles.alertBox}">
          <strong style="color: #856404;">Tipo:</strong> <span style="color: #856404;">${tipoLabel}</span>
        </div>
        ${divergenciaSection}
        ${shipmentTable(s)}
        <div style="background: #f8f9fa; border-radius: 4px; padding: 12px; margin: 15px 0;">
          <strong>Descrição:</strong>
          <p style="margin: 8px 0 0; color: #666;">${excecao.descricao}</p>
        </div>
        <p style="font-size: 12px; color: #999;">
          Registrado em: ${new Date(excecao.created_at).toLocaleString('pt-BR')}
        </p>
      </div>
      ${emailFooter()}
    </div>
  `;
}

function templateTratamentoCritico(s: Shipment, excecao: { descricao: string; created_at: string }, tratamentos: string[]): string {
  const tratamentosList = tratamentos
    .filter(t => TRATAMENTOS_CRITICOS[t])
    .map(t => `<li style="margin: 4px 0;"><strong>${t}</strong> - ${TRATAMENTOS_CRITICOS[t]}</li>`)
    .join('');

  return `
    <div style="${baseStyles.container}">
      ${emailHeader('🚨 ALERTA CRÍTICO')}
      <div style="background: #fff; padding: 20px; border: 1px solid #ddd; border-left: 4px solid #ff6b00;">
        <h2 style="color: #ff6b00; margin-top: 0;">🚨 CARGA COM TRATAMENTO CRÍTICO</h2>
        <p>Uma carga com tratamento especial crítico requer <strong>atenção imediata</strong>.</p>
        
        <div style="background: #fff3cd; border: 1px solid #ff6b00; border-radius: 4px; padding: 12px; margin: 15px 0;">
          <strong style="color: #856404;">⚠️ Tratamentos Identificados:</strong>
          <ul style="margin: 10px 0; padding-left: 20px; color: #856404;">${tratamentosList}</ul>
        </div>
        
        ${shipmentTable(s)}
        
        <div style="${baseStyles.dangerBox}">
          <strong style="color: #721c24;">📋 Ações Necessárias:</strong>
          <ul style="margin: 10px 0; padding-left: 20px; color: #721c24;">
            <li>Verificar documentação especial (DGR, certificados)</li>
            <li>Confirmar procedimentos de manuseio</li>
            <li>Alertar equipe de handling</li>
            <li>Preparar área de armazenamento</li>
          </ul>
        </div>
        
        <p style="color: #dc3545; font-size: 14px; font-weight: bold;">
          ⏰ Esta carga requer procedimentos especiais conforme normas IATA.
        </p>
      </div>
      ${emailFooter()}
    </div>
  `;
}

// ============================================
// FUNÇÕES DE ENVIO
// ============================================

function getEmailSubject(templateId: string, eventoCodigo: string, house: string): string {
  const prefixes: Record<string, string> = {
    'tpl-cct-alerta': '⚠️ ALERTA:',
    'tpl-cct-resumido': '📋',
    'tpl-cct-padrao': '📋',
  };
  const prefix = prefixes[templateId] || '📋';
  
  const eventos: Record<string, string> = {
    'CHEGADA_AERONAVE': 'Aeronave Chegou',
    'PC': 'Presença de Carga',
    'ENTREGUE': 'Carga Entregue',
    'BLOQUEIO': 'Bloqueio Detectado',
    'DESEMBARACO': 'Carga Desembaraçada',
    'LIBERADO': 'Carga Liberada',
  };
  
  return `${prefix} ${eventos[eventoCodigo] || eventoCodigo} - House ${house}`;
}

async function handleExcecaoNotification(supabaseUrl: string, supabaseKey: string, payload: ExcecaoPayload) {
  console.log('[CCT-NOTIFY] Processing exception:', payload.tipo_excecao);
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: shipmentData, error } = await supabase
    .from('shipments')
    .select('*, analista:profiles!shipments_analista_id_fkey(id, nome, email)')
    .eq('id', payload.shipment_id)
    .maybeSingle();

  if (error || !shipmentData) {
    throw new Error(`Shipment not found: ${payload.shipment_id}`);
  }
  
  const shipment = shipmentData as Shipment;
  const divergenciaPct = payload.divergencia_peso_pct;
  
  // Determinar destinatários
  const recipients: string[] = ['operacoes@dachser.com'];
  
  // Adicionar email do analista (do profile ou legado)
  const analistaEmail = shipment.analista?.email || shipment.email_analista;
  
  if (divergenciaPct != null && divergenciaPct > DIVERGENCIA_THRESHOLD_PCT) {
    console.log(`[CCT-NOTIFY] Alta divergência (${divergenciaPct}%) - apenas analista`);
    if (analistaEmail) recipients.push(analistaEmail);
  } else {
    // Divergência baixa ou sem divergência - notificar cliente também
    if (analistaEmail) recipients.push(analistaEmail);
    
    // Adicionar emails do cliente (pode ser lista separada por vírgula ou ponto-e-vírgula)
    if (shipment.emails_cliente) {
      const clientEmails = shipment.emails_cliente
        .split(/[,;]/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e.includes('@'));
      recipients.push(...clientEmails);
      console.log(`[CCT-NOTIFY] Adicionando emails do cliente: ${clientEmails.join(', ')}`);
    }
  }

  if (payload.is_critical_treatment) {
    recipients.push('seguranca@dachser.com');
    console.log('[CCT-NOTIFY] Tratamento crítico - notificando segurança');
  }
  
  // Gerar email
  let html: string;
  let subject: string;
  
  if (payload.is_critical_treatment && payload.tratamentos_especiais) {
    html = templateTratamentoCritico(shipment, { descricao: payload.descricao, created_at: payload.created_at }, payload.tratamentos_especiais);
    subject = `🚨 CRÍTICO: Tratamento Especial - House ${shipment.house}`;
  } else {
    html = templateExcecao(shipment, { tipo: payload.tipo_excecao, descricao: payload.descricao, created_at: payload.created_at }, {
      peso_declarado: payload.peso_declarado,
      peso_constatado: payload.peso_constatado,
      divergencia_pct: divergenciaPct,
    });
    subject = `⚠️ Exceção: ${TIPO_EXCECAO_LABELS[payload.tipo_excecao] || payload.tipo_excecao} - House ${shipment.house}`;
  }
  
  const emailResponse = await resend.emails.send({
    from: 'Z3US CCT <notificacoes@sdr.z3us.ai>',
    to: [...new Set(recipients)],
    subject,
    html,
  });

  console.log('[CCT-NOTIFY] Email enviado para:', recipients);

  // Log
  await supabase.from('cct_log_entry').insert({
    conector: 'HERMES',
    tipo: payload.is_critical_treatment ? 'ALERTA' : 'SUCESSO',
    shipment_id: payload.shipment_id,
    house: shipment.house,
    mensagem: `Notificação enviada: ${recipients.join(', ')}`,
  });

  return { success: true, recipients, emailResponse };
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse JSON with error handling
    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      console.error('[CCT-NOTIFY] Invalid JSON payload');
      return new Response(JSON.stringify({ error: 'Payload JSON inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('[CCT-NOTIFY] Payload recebido:', JSON.stringify(rawPayload).substring(0, 200));

    // Notificação de exceção
    if (typeof rawPayload === 'object' && rawPayload !== null && 'type' in rawPayload && (rawPayload as Record<string, unknown>).type === 'excecao') {
      // Validar payload de exceção
      const validation = validateAndSanitize(ExcecaoPayloadSchema, rawPayload);
      if (!validation.success) {
        console.error('[CCT-NOTIFY] Validação falhou:', validation.error);
        return new Response(JSON.stringify({ error: validation.error }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const result = await handleExcecaoNotification(supabaseUrl, supabaseKey, validation.data);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validar payload de evento
    const validation = validateAndSanitize(NotificationPayloadSchema, rawPayload);
    if (!validation.success) {
      console.error('[CCT-NOTIFY] Validação falhou:', validation.error);
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const payload = validation.data;
    console.log('[CCT-NOTIFY] Processando evento:', payload.evento_codigo);

    const { data: shipment, error: shipErr } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', payload.shipment_id)
      .maybeSingle();

    if (shipErr || !shipment) {
      throw new Error(`Shipment não encontrado: ${payload.shipment_id}`);
    }

    // Buscar regras ativas
    const { data: rules } = await supabase
      .from('cct_regra_notificacao')
      .select('*')
      .eq('ativo', true);

    const matchingRules = (rules || []).filter((rule: NotificationRule) => {
      if (!rule.eventos_disparo.includes(payload.evento_codigo)) return false;
      if (rule.aeroportos.length > 0 && !rule.aeroportos.includes(shipment.aeroporto_destino)) return false;
      if (rule.cnpj_consignatario && rule.cnpj_consignatario !== shipment.cnpj_consignatario) return false;
      return true;
    });

    console.log(`[CCT-NOTIFY] ${matchingRules.length} regras encontradas`);

    const results = { emailsSent: 0, webhooksCalled: 0, errors: [] as string[] };

    for (const rule of matchingRules) {
      for (const canal of rule.canais) {
        try {
          if (canal === 'EMAIL_CLIENTE' || canal === 'EMAIL_INTERNO') {
            let recipients: string[] = [];
            
            if (canal === 'EMAIL_INTERNO') {
              // Email interno - equipe operacional e analista
              recipients = ['operacoes@dachser.com'];
              const analistaEmail = shipment.email_analista;
              if (analistaEmail) recipients.push(analistaEmail);
            } else {
              // EMAIL_CLIENTE - usar emails_cliente do shipment
              if (shipment.emails_cliente) {
                const clientEmails = shipment.emails_cliente
                  .split(/[,;]/)
                  .map((e: string) => e.trim().toLowerCase())
                  .filter((e: string) => e && e.includes('@'));
                recipients.push(...clientEmails);
                console.log(`[CCT-NOTIFY] Emails do cliente: ${clientEmails.join(', ')}`);
              } else {
                console.log(`[CCT-NOTIFY] Sem emails_cliente para ${shipment.house}`);
                continue; // Pular se não tiver email do cliente
              }
            }

            if (recipients.length === 0) continue;

            const html = getEmailTemplate(rule.template_id, shipment, {
              codigo: payload.evento_codigo,
              descricao: payload.evento_descricao,
              data: payload.evento_data
            });

            await resend.emails.send({
              from: 'Z3US CCT <notificacoes@sdr.z3us.ai>',
              to: [...new Set(recipients)],
              subject: getEmailSubject(rule.template_id, payload.evento_codigo, shipment.house),
              html
            });

            console.log(`[CCT-NOTIFY] Email enviado: ${recipients.join(', ')} (${rule.template_id})`);
            results.emailsSent++;
            
          } else if (canal === 'WEBHOOK') {
            console.log('[CCT-NOTIFY] Webhook (não implementado)');
            results.webhooksCalled++;
          }
        } catch (err) {
          const msg = `Erro ${canal}: ${err instanceof Error ? err.message : 'Desconhecido'}`;
          console.error(`[CCT-NOTIFY] ${msg}`);
          results.errors.push(msg);
        }
      }
    }

    // Log
    await supabase.from('cct_log_entry').insert({
      conector: 'HERMES',
      tipo: results.errors.length > 0 ? 'ERRO' : 'SUCESSO',
      shipment_id: payload.shipment_id,
      house: shipment.house,
      mensagem: `Evento ${payload.evento_codigo}: ${results.emailsSent} emails, ${results.webhooksCalled} webhooks`
    });

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[CCT-NOTIFY] Erro:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
