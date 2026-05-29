import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callMariaDBProxy(action: string, params: Record<string, any> = {}): Promise<any> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ action, ...params }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MariaDB proxy error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

function daysBetween(d1: Date, d2: Date): number {
  const ms = d2.getTime() - d1.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting demurrage alert cron job (v2 - 30d/15d logic)...");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get client profiles from MariaDB
    const profilesResponse = await callMariaDBProxy('demurrage_get_client_profiles', {});
    const clientProfiles = profilesResponse.data || [];

    const alertEnabledClients = new Set(
      clientProfiles
        .filter((p: any) => p.auto_alert_enabled)
        .map((p: any) => p.client_name)
    );

    console.log(`${alertEnabledClients.size} clients have auto-alerts enabled`);

    // Get all containers with exceeded free time
    const containersResponse = await callMariaDBProxy('demurrage_get_containers', {
      risk_status: 'exceeded',
      limit: 500
    });

    const containers = containersResponse.data || [];
    console.log(`Found ${containers.length} containers with exceeded free time`);

    if (containers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No containers with exceeded free time", emailsSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter containers based on client profile settings
    const alertableContainers = containers.filter((c: any) => {
      const clientName = c.cliente;
      if (!clientName) return true;
      return alertEnabledClients.has(clientName);
    });

    console.log(`${alertableContainers.length} containers eligible for alerts`);

    // Fetch all existing alerts for these containers
    const containerIds = alertableContainers.map((c: any) => c.id);
    let existingAlerts: any[] = [];
    try {
      const alertsResponse = await callMariaDBProxy('demurrage_get_alerts', {
        filters: { container_ids: containerIds }
      });
      existingAlerts = alertsResponse.data || [];
    } catch (e) {
      console.log("Could not fetch existing alerts, proceeding with fresh logic");
    }

    // Build a map: container_id -> sorted alerts
    const alertsByContainer = new Map<number, any[]>();
    existingAlerts.forEach((a: any) => {
      const list = alertsByContainer.get(a.container_id) || [];
      list.push(a);
      alertsByContainer.set(a.container_id, list);
    });

    const today = new Date();
    let emailsSent = 0;
    const errors: string[] = [];
    const notificationEmails = ["demurrage@dachser.com"];

    for (const container of alertableContainers) {
      try {
        const freeTimeEndDate = container.free_time_end_date ? new Date(container.free_time_end_date) : null;
        if (!freeTimeEndDate) continue;

        const daysAfterFt = daysBetween(freeTimeEndDate, today);
        const containerAlerts = (alertsByContainer.get(container.id) || [])
          .filter((a: any) => a.status === 'sent')
          .sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

        // Check if client already returned
        const lastAlert = containerAlerts[0];
        if (lastAlert?.client_returned) {
          continue; // Client returned, skip re-notification
        }

        let shouldSend = false;
        let alertType = 'exceeded';

        if (containerAlerts.length === 0 && daysAfterFt >= 30) {
          // First alert: 30 calendar days after free time end
          shouldSend = true;
          alertType = 'initial_alert';
        } else if (containerAlerts.length > 0) {
          // Re-notification: 15 days after last alert if no return
          const lastSentAt = new Date(lastAlert.sent_at);
          const daysSinceLastAlert = daysBetween(lastSentAt, today);
          if (daysSinceLastAlert >= 15) {
            shouldSend = true;
            alertType = 're_notification';
          }
        }

        if (!shouldSend) continue;

        // Calcular Dias em Posse e Limite de Devolução (regra inclusiva)
        const ataStr = container.data_atracacao || container.ft_started_at || null;
        const ataDate = ataStr ? new Date(ataStr) : null;
        const devolucaoStr = container.data_devolucao || null;
        const devolucaoDate = devolucaoStr ? new Date(devolucaoStr) : null;
        const freeTime = Number(container.free_time_days || 0);
        let limiteStr: string | null = null;
        let diasEmPosse = 0;
        let diasExcedidos = 0;
        if (ataDate && freeTime > 0) {
          const limite = new Date(ataDate);
          limite.setDate(limite.getDate() + freeTime - 1);
          limiteStr = limite.toISOString().slice(0, 10);
          const end = devolucaoDate || today;
          const ms = end.getTime() - ataDate.getTime();
          diasEmPosse = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
          diasExcedidos = Math.max(0, diasEmPosse - freeTime);
        }

        // Send alert
        const response = await fetch(`${SUPABASE_URL}/functions/v1/demurrage-send-alert`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            container_id: container.id,
            container_number: container.numero,
            client_name: container.cliente || "N/A",
            cnpj_cliente: container.cnpj_cliente || container.cnpj || "",
            shipment_master: container.shipment_master || container.mbl || "N/A",
            house_bl: container.hbl || container.house_bl || "",
            partner_id: container.partner_id || "",
            origin_port: container.porto_origem || "",
            destination_port: container.porto_destino || "",
            days_remaining: container.days_remaining || 0,
            expected_cost_usd: container.expected_cost_usd || container.demurrage_usd || 0,
            alert_type: alertType,
            recipient_emails: notificationEmails,
            containers: [{
              number: container.numero,
              size: container.tipo_conteiner || "",
              type: container.tipo_medida || container.tipo_conteiner || "",
              armador: container.armador || "",
              discharge_date: ataStr,
              free_time_days: freeTime,
              return_deadline: limiteStr,
              return_date: devolucaoStr,
              days_possession: diasEmPosse,
              days_incident: diasExcedidos,
              total_usd: container.expected_cost_usd || 0,
            }],
          }),
        });

        const alertStatus = response.ok ? 'sent' : 'failed';
        const errorText = !response.ok ? await response.text() : undefined;

        // Record alert in MariaDB
        try {
          await callMariaDBProxy('demurrage_create_alert', {
            container_id: container.id,
            container_number: container.numero,
            alert_type: alertType,
            client_name: container.cliente || "N/A",
            shipment_master: container.shipment_master || container.mbl || "N/A",
            days_remaining: container.days_remaining || 0,
            expected_cost_usd: container.expected_cost_usd || container.demurrage_usd || 0,
            recipient_emails: notificationEmails,
            status: alertStatus,
            error_message: errorText || null,
          });
        } catch (e) {
          console.error("Failed to record alert:", e);
        }

        if (response.ok) {
          emailsSent++;
          console.log(`${alertType} alert sent for container ${container.numero} (${daysAfterFt}d after FT)`);
        } else {
          errors.push(`Failed to send ${alertType} for ${container.numero}: ${errorText}`);
        }
      } catch (e) {
        const error = e as Error;
        errors.push(`Error for ${container.numero}: ${error.message}`);
      }
    }

    console.log(`Cron job completed. Emails sent: ${emailsSent}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent,
        totalExceeded: containers.length,
        eligibleForAlert: alertableContainers.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in demurrage alert cron:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
