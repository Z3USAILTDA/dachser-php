import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

interface Voucher {
  id: string;
  numero_spo: string;
  etapa_atual: string;
  vencimento: string;
  updated_at: string;
  fornecedor: string;
  valor: number;
}

interface SlaConfig {
  etapa: string;
  horas_limite: number;
  ativo: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let mariaClient: Client | null = null;

  try {
    // Connect to MariaDB
    mariaClient = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST'),
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER'),
      password: Deno.env.get('MARIADB_PASSWORD'),
      db: 'dados_dachser',
    });

    // Fetch SLA configs
    let slaConfigs: SlaConfig[] = [];
    try {
      slaConfigs = await mariaClient.query(`SELECT etapa, horas_limite, ativo FROM dados_dachser.t_sla_config WHERE ativo = 1`);
    } catch (e) {
      console.log('[voucher-check-sla-alerts] Could not fetch SLA configs, using defaults');
    }

    const getSlaHours = (etapa: string): number => {
      const config = slaConfigs.find(c => c.etapa === etapa);
      if (config) return config.horas_limite;
      // Defaults
      const defaults: Record<string, number> = { OPERACAO: 24, FISCAL: 48, SUPERVISOR: 24, FINANCEIRO: 24, AJUSTE_OPERACAO: 24, AJUSTE_FISCAL: 24 };
      return defaults[etapa] || 24;
    };

    const now = new Date();

    // Fetch active vouchers (not concluded, not robo)
    const vouchers = await mariaClient.query(
      `SELECT id, numero_spo, etapa_atual, vencimento, updated_at, fornecedor, valor
       FROM t_vouchers
       WHERE etapa_atual NOT IN ('ROBO', 'CONCLUIDO', 'CANCELADO', 'A_PROCESSAR', 'RASCUNHO')
         AND (status_baixa IS NULL OR (status_baixa != 'BAIXA_MANUAL' AND status_baixa != 'BAIXA_REMESSA'))`
    ) as Voucher[];

    // Fetch esteira users with roles for email mapping
    const users = await mariaClient.query(
      `SELECT id, username, email, esteira_role FROM ai_agente.t_users_dachser WHERE esteira_active = 1 AND email IS NOT NULL AND email != ''`
    );

    await mariaClient.close();
    mariaClient = null;

    console.log(`[voucher-check-sla-alerts] Checking ${vouchers?.length || 0} active vouchers against SLA`);

    // Group vouchers by SLA breach type
    const breachedByEtapa: Record<string, Voucher[]> = {};

    for (const voucher of vouchers || []) {
      const updatedAt = new Date(voucher.updated_at);
      const hoursStuck = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
      const slaHours = getSlaHours(voucher.etapa_atual);

      if (hoursStuck >= slaHours) {
        const etapa = voucher.etapa_atual;
        if (!breachedByEtapa[etapa]) breachedByEtapa[etapa] = [];
        breachedByEtapa[etapa].push(voucher);
      }
    }

    const totalBreached = Object.values(breachedByEtapa).reduce((sum, arr) => sum + arr.length, 0);
    
    if (totalBreached === 0) {
      console.log('[voucher-check-sla-alerts] No SLA breaches found');
      return new Response(
        JSON.stringify({ success: true, vouchersChecked: vouchers?.length || 0, breached: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map etapas to responsible roles
    const etapaToRole: Record<string, string> = {
      OPERACAO: 'OPERACAO',
      AJUSTE_OPERACAO: 'OPERACAO',
      FISCAL: 'FISCAL',
      AJUSTE_FISCAL: 'FISCAL',
      SUPERVISOR: 'SUPERVISOR',
      FINANCEIRO: 'FINANCEIRO',
    };

    // Group by role and collect recipient emails
    const emailsByRole: Record<string, { emails: string[]; vouchers: Record<string, Voucher[]> }> = {};

    for (const [etapa, voucherList] of Object.entries(breachedByEtapa)) {
      const role = etapaToRole[etapa] || etapa;
      if (!emailsByRole[role]) {
        emailsByRole[role] = { emails: [], vouchers: {} };
      }
      emailsByRole[role].vouchers[etapa] = voucherList;

      // Find users with matching role
      const roleUsers = users.filter((u: any) => {
        const userRole = (u.esteira_role || '').toUpperCase();
        return userRole === role || userRole === `GESTOR_${role}` || userRole === 'ADMIN';
      });

      for (const u of roleUsers) {
        if (u.email && !emailsByRole[role].emails.includes(u.email)) {
          emailsByRole[role].emails.push(u.email);
        }
      }
    }

    // Send one consolidated email per role
    let emailsSent = 0;
    const appUrl = 'https://dachser.z3us.app';

    for (const [role, data] of Object.entries(emailsByRole)) {
      if (data.emails.length === 0) continue;

      // Build sections HTML
      let sectionsHtml = '';
      for (const [etapa, voucherList] of Object.entries(data.vouchers)) {
        const slaHours = getSlaHours(etapa);
        sectionsHtml += `
          <div style="margin-bottom: 20px;">
            <h3 style="color: #dc2626; margin-bottom: 10px;">
              ${etapa.replace(/_/g, ' ')} — SLA ${slaHours}h excedido (${voucherList.length} voucher${voucherList.length > 1 ? 's' : ''})
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Nº SPO</th>
                  <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Fornecedor</th>
                  <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Valor</th>
                  <th style="padding: 8px; text-align: center; border: 1px solid #e5e7eb;">Tempo Parado</th>
                </tr>
              </thead>
              <tbody>
                ${voucherList.map(v => {
                  const hours = Math.round((now.getTime() - new Date(v.updated_at).getTime()) / (1000 * 60 * 60));
                  const dias = Math.floor(hours / 24);
                  const horas = hours % 24;
                  const tempoStr = dias > 0 ? `${dias}d ${horas}h` : `${horas}h`;
                  return `
                    <tr>
                      <td style="padding: 8px; border: 1px solid #e5e7eb;">
                        <a href="${appUrl}/fin/esteira/voucher/${v.id}" style="color: #0066cc; text-decoration: none;">${v.numero_spo}</a>
                      </td>
                      <td style="padding: 8px; border: 1px solid #e5e7eb;">${v.fornecedor || '-'}</td>
                      <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">R$ ${(v.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style="padding: 8px; text-align: center; border: 1px solid #e5e7eb; color: #dc2626; font-weight: 600;">${tempoStr}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      const totalForRole = Object.values(data.vouchers).reduce((s, arr) => s + arr.length, 0);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #ffc800, #ffe680); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #1a1a1a; margin: 0; font-size: 20px;">⚠️ Relatório Diário de SLA — Esteira de Vouchers</h1>
            <p style="color: #333; margin: 8px 0 0; font-size: 14px;">${totalForRole} voucher(s) com SLA excedido na sua responsabilidade</p>
          </div>
          <div style="padding: 20px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            ${sectionsHtml}
            <p style="color: #666; font-size: 13px; margin-top: 20px;">
              Acesse a <a href="${appUrl}/fin/esteira" style="color: #0066cc;">Esteira de Vouchers</a> para tomar as ações necessárias.
            </p>
          </div>
          <p style="color: #999; font-size: 11px; margin-top: 15px; text-align: center;">
            E-mail automático • Sistema DACHSER Z3US Workflow • ${new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
      `;

      // Send via Resend with override to larissa@z3us.ai for testing
      const overrideEmail = 'larissa@z3us.ai';
      
      try {
        if (RESEND_API_KEY) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'DACHSER Workflow <onboarding@resend.dev>',
              to: [overrideEmail],
              subject: `⚠️ Relatório SLA Diário — ${totalForRole} voucher(s) com SLA excedido (${role})`,
              html,
            }),
          });
          
          if (res.ok) {
            emailsSent++;
            console.log(`[voucher-check-sla-alerts] Consolidated email sent for role ${role} to ${overrideEmail} (original: ${data.emails.join(', ')})`);
          } else {
            const err = await res.text();
            console.error(`[voucher-check-sla-alerts] Failed to send email for role ${role}: ${err}`);
          }
        }
      } catch (emailErr) {
        console.error(`[voucher-check-sla-alerts] Error sending email for role ${role}:`, emailErr);
      }
    }

    console.log(`[voucher-check-sla-alerts] Done: ${totalBreached} breached vouchers, ${emailsSent} consolidated emails sent`);

    return new Response(
      JSON.stringify({ success: true, vouchersChecked: vouchers?.length || 0, breached: totalBreached, emailsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[voucher-check-sla-alerts] Error:', error);
    if (mariaClient) await mariaClient.close();
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
