import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Voucher {
  id: string;
  numero_spo: string;
  etapa_atual: string;
  vencimento: string;
  updated_at: string;
  responsavel_operacao_user_id: string | null;
  responsavel_fiscal_user_id: string | null;
  responsavel_financeiro_user_id: string | null;
  criado_por_user_id: string;
}

interface Profile {
  id: string;
  email: string;
  name: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Buscar vouchers ativos (não baixados)
    const { data: vouchers, error: vouchersError } = await supabase
      .from('vouchers')
      .select(`
        id,
        numero_spo,
        etapa_atual,
        vencimento,
        updated_at,
        responsavel_operacao_user_id,
        responsavel_fiscal_user_id,
        responsavel_financeiro_user_id,
        criado_por_user_id
      `)
      .neq('etapa_atual', 'ROBO')
      .neq('status_baixa', 'BAIXA_MANUAL')
      .neq('status_baixa', 'BAIXA_REMESSA');

    if (vouchersError) throw vouchersError;

    console.log(`[voucher-check-sla-alerts] Verificando ${vouchers?.length || 0} vouchers ativos`);

    const alertsToSend: Array<{ email: string; type: string; vouchers: Voucher[] }> = [];

    // Agrupar vouchers por responsável e tipo de alerta
    const vouchersByResponsible: Record<string, {
      operacaoParados: Voucher[];
      fiscalParados: Voucher[];
      financeiroVencendo: Voucher[];
      financeiroVencidos: Voucher[];
    }> = {};

    for (const voucher of vouchers || []) {
      const updatedAt = new Date(voucher.updated_at);
      const hoursStuck = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
      const vencimento = new Date(voucher.vencimento);

      let responsibleId: string | null = null;
      let alertType: string | null = null;

      // Verificar SLA de Operação (24h parado)
      if (voucher.etapa_atual === 'OPERACAO' && hoursStuck >= 24) {
        responsibleId = voucher.responsavel_operacao_user_id || voucher.criado_por_user_id;
        alertType = 'operacaoParados';
      }

      // Verificar SLA de Fiscal (48h parado)
      if (voucher.etapa_atual === 'FISCAL' && hoursStuck >= 48) {
        responsibleId = voucher.responsavel_fiscal_user_id;
        alertType = 'fiscalParados';
      }

      // Verificar vencimento próximo (24h) - Financeiro
      if (voucher.etapa_atual === 'FINANCEIRO' && vencimento >= now && vencimento <= tomorrow) {
        responsibleId = voucher.responsavel_financeiro_user_id;
        alertType = 'financeiroVencendo';
      }

      // Verificar vencidos - Financeiro
      if (voucher.etapa_atual === 'FINANCEIRO' && vencimento < now) {
        responsibleId = voucher.responsavel_financeiro_user_id;
        alertType = 'financeiroVencidos';
      }

      if (responsibleId && alertType) {
        if (!vouchersByResponsible[responsibleId]) {
          vouchersByResponsible[responsibleId] = {
            operacaoParados: [],
            fiscalParados: [],
            financeiroVencendo: [],
            financeiroVencidos: [],
          };
        }
        vouchersByResponsible[responsibleId][alertType as keyof typeof vouchersByResponsible[string]].push(voucher);
      }
    }

    // Buscar emails dos responsáveis e enviar alertas
    const userIds = Object.keys(vouchersByResponsible);
    
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      for (const profile of profiles || []) {
        const userVouchers = vouchersByResponsible[profile.id];

        // Enviar alerta de Operação parada
        if (userVouchers.operacaoParados.length > 0) {
          await sendAlert(supabase, {
            email: profile.email || '',
            name: profile.name || '',
            type: 'operacao_parado',
            vouchers: userVouchers.operacaoParados,
          });
        }

        // Enviar alerta de Fiscal parado
        if (userVouchers.fiscalParados.length > 0) {
          await sendAlert(supabase, {
            email: profile.email || '',
            name: profile.name || '',
            type: 'fiscal_parado',
            vouchers: userVouchers.fiscalParados,
          });
        }

        // Enviar alerta de vencimento próximo
        if (userVouchers.financeiroVencendo.length > 0) {
          await sendAlert(supabase, {
            email: profile.email || '',
            name: profile.name || '',
            type: 'vencimento_proximo',
            vouchers: userVouchers.financeiroVencendo,
          });
        }

        // Enviar alerta de vencidos
        if (userVouchers.financeiroVencidos.length > 0) {
          await sendAlert(supabase, {
            email: profile.email || '',
            name: profile.name || '',
            type: 'vencido',
            vouchers: userVouchers.financeiroVencidos,
          });
        }
      }
    }

    console.log(`[voucher-check-sla-alerts] Alertas verificados e enviados para ${userIds.length} usuários`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        vouchersChecked: vouchers?.length || 0,
        usersAlerted: userIds.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[voucher-check-sla-alerts] Erro ao verificar SLA:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function sendAlert(
  supabase: any,
  params: {
    email: string;
    name: string;
    type: string;
    vouchers: Voucher[];
  }
) {
  const { email, name, type, vouchers } = params;

  const appUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app') || '';
  
  const buildVoucherLinks = (vouchers: Voucher[]) => {
    return vouchers.map(v => 
      `<div style="margin: 8px 0;">
        <a href="${appUrl}/voucher/${v.id}" style="color: #0066cc; text-decoration: none;">
          ${v.numero_spo}
        </a>
      </div>`
    ).join('');
  };

  const templates = {
    operacao_parado: {
      subject: '🚨 Vouchers parados na etapa Voucher há mais de 24h',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">🚨 Vouchers parados na etapa Voucher</h2>
          <p>Olá ${name},</p>
          <p>Os seguintes vouchers estão parados na <strong>etapa Voucher há mais de 24 horas</strong>:</p>
          <div style="background-color: #fee; padding: 15px; border-radius: 8px; margin: 20px 0;">
            ${buildVoucherLinks(vouchers)}
          </div>
          <p style="color: #666;">Por favor, verifique e tome as ações necessárias clicando nos links acima.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Sistema Z3US Workflow</p>
        </div>
      `,
    },
    fiscal_parado: {
      subject: '🚨 Vouchers parados no Fiscal há mais de 48h',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">🚨 Vouchers parados no Fiscal</h2>
          <p>Olá ${name},</p>
          <p>Os seguintes vouchers estão parados no <strong>Fiscal há mais de 48 horas</strong>:</p>
          <div style="background-color: #fee; padding: 15px; border-radius: 8px; margin: 20px 0;">
            ${buildVoucherLinks(vouchers)}
          </div>
          <p style="color: #666;">Por favor, verifique e tome as ações necessárias clicando nos links acima.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Sistema Z3US Workflow</p>
        </div>
      `,
    },
    vencimento_proximo: {
      subject: '⚠️ Vouchers vencendo nas próximas 24h',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">⚠️ Vouchers vencendo em breve</h2>
          <p>Olá ${name},</p>
          <p><strong>Atenção!</strong> Os seguintes vouchers vencem nas <strong>próximas 24 horas</strong>:</p>
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            ${vouchers.map(v => 
              `<div style="margin: 8px 0;">
                <a href="${appUrl}/voucher/${v.id}" style="color: #0066cc; text-decoration: none;">
                  ${v.numero_spo}
                </a>
                <span style="color: #666; font-size: 14px;"> - Vencimento: ${new Date(v.vencimento).toLocaleDateString('pt-BR')}</span>
              </div>`
            ).join('')}
          </div>
          <p style="color: #666;">Por favor, priorize o processamento clicando nos links acima.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Sistema Z3US Workflow</p>
        </div>
      `,
    },
    vencido: {
      subject: '🔴 Vouchers VENCIDOS - Ação Urgente Necessária',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">🔴 Vouchers VENCIDOS</h2>
          <p>Olá ${name},</p>
          <p><strong>ALERTA CRÍTICO:</strong> Os seguintes vouchers já estão <strong>VENCIDOS</strong>:</p>
          <div style="background-color: #fee; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
            ${vouchers.map(v => 
              `<div style="margin: 8px 0;">
                <a href="${appUrl}/voucher/${v.id}" style="color: #dc2626; text-decoration: none; font-weight: 600;">
                  ${v.numero_spo}
                </a>
                <span style="color: #666; font-size: 14px;"> - Vencido em: ${new Date(v.vencimento).toLocaleDateString('pt-BR')}</span>
              </div>`
            ).join('')}
          </div>
          <p style="color: #dc2626; font-weight: 600;">Por favor, tome ação IMEDIATA clicando nos links acima.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Sistema Z3US Workflow</p>
        </div>
      `,
    },
  };

  const template = templates[type as keyof typeof templates];

  if (!template) {
    console.error(`[voucher-check-sla-alerts] Template desconhecido: ${type}`);
    return;
  }

  try {
    const { error } = await supabase.functions.invoke('send-notification-email', {
      body: {
        to: email,
        subject: template.subject,
        body: template.body,
        fromStage: 'SISTEMA',
        toStage: 'ALERTA_SLA',
        voucherNumber: `${vouchers.length} voucher(s)`,
      },
    });

    if (error) {
      console.error(`[voucher-check-sla-alerts] Erro ao enviar alerta para ${email}:`, error);
    } else {
      console.log(`[voucher-check-sla-alerts] Alerta ${type} enviado para ${email}`);
    }
  } catch (error) {
    console.error(`[voucher-check-sla-alerts] Erro ao invocar função de email:`, error);
  }
}
