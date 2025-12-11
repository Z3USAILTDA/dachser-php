import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Threshold in minutes for stale DEP alert
const STALE_DEP_THRESHOLD_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("[CCT-DEP-ALERT] Starting stale DEP check...");

  try {
    // Calculate threshold timestamp (30 minutes ago)
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - STALE_DEP_THRESHOLD_MINUTES);

    // Find shipments in AGUARDANDO_MANIFESTACAO status created more than 30 minutes ago
    const { data: staleShipments, error: shipmentsError } = await supabase
      .from("shipments")
      .select(`
        id,
        house,
        master,
        cliente,
        aeroporto_origem,
        aeroporto_destino,
        created_at,
        cct_status_atual!inner (
          status_cct_oficial
        )
      `)
      .eq("cct_status_atual.status_cct_oficial", "AGUARDANDO_MANIFESTACAO")
      .lt("created_at", thresholdTime.toISOString());

    if (shipmentsError) {
      console.error("[CCT-DEP-ALERT] Error fetching shipments:", shipmentsError);
      throw shipmentsError;
    }

    console.log(`[CCT-DEP-ALERT] Found ${staleShipments?.length || 0} shipments older than ${STALE_DEP_THRESHOLD_MINUTES} minutes`);

    if (!staleShipments || staleShipments.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No stale DEP shipments found",
          checked: 0,
          alertsCreated: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let alertsCreated = 0;
    const errors: string[] = [];

    for (const shipment of staleShipments) {
      // Check if this shipment has any events from LeadComex
      const { data: events, error: eventsError } = await supabase
        .from("cct_evento_normalizado")
        .select("id")
        .eq("shipment_id", shipment.id)
        .limit(1);

      if (eventsError) {
        console.error(`[CCT-DEP-ALERT] Error checking events for ${shipment.house}:`, eventsError);
        errors.push(`Error checking events for ${shipment.house}`);
        continue;
      }

      // If no events exist, check if we already have an alert for this shipment
      if (!events || events.length === 0) {
        // Check for existing alert to avoid duplicates
        const { data: existingAlert, error: alertCheckError } = await supabase
          .from("cct_excecao_operacional")
          .select("id")
          .eq("shipment_id", shipment.id)
          .eq("tipo_excecao", "ATRASO_EVENTO")
          .eq("fonte_detectou", "CCT_DEP_MONITOR")
          .eq("status_excecao", "ABERTA")
          .limit(1);

        if (alertCheckError) {
          console.error(`[CCT-DEP-ALERT] Error checking existing alert for ${shipment.house}:`, alertCheckError);
          errors.push(`Error checking alert for ${shipment.house}`);
          continue;
        }

        // Only create alert if none exists
        if (!existingAlert || existingAlert.length === 0) {
          const minutesStale = Math.floor(
            (Date.now() - new Date(shipment.created_at).getTime()) / (1000 * 60)
          );

          const { error: insertError } = await supabase
            .from("cct_excecao_operacional")
            .insert({
              shipment_id: shipment.id,
              tipo_excecao: "ATRASO_EVENTO",
              descricao: `⏱️ Processo DEP sem eventos há ${minutesStale} minutos. HAWB: ${shipment.house}, Rota: ${shipment.aeroporto_origem} → ${shipment.aeroporto_destino}. Verificar sincronização LeadComex.`,
              fonte_detectou: "CCT_DEP_MONITOR",
              status_excecao: "ABERTA"
            });

          if (insertError) {
            console.error(`[CCT-DEP-ALERT] Error creating alert for ${shipment.house}:`, insertError);
            errors.push(`Error creating alert for ${shipment.house}`);
            continue;
          }

          // Log the alert
          await supabase.from("cct_log_entry").insert({
            conector: "CCT_DEP_MONITOR",
            tipo: "ALERTA",
            shipment_id: shipment.id,
            house: shipment.house,
            mensagem: `Alerta criado: DEP sem eventos há ${minutesStale} minutos`
          });

          console.log(`[CCT-DEP-ALERT] Created alert for ${shipment.house} (stale for ${minutesStale} min)`);
          alertsCreated++;
        } else {
          console.log(`[CCT-DEP-ALERT] Alert already exists for ${shipment.house}, skipping`);
        }
      } else {
        console.log(`[CCT-DEP-ALERT] ${shipment.house} has events, no alert needed`);
      }
    }

    console.log(`[CCT-DEP-ALERT] Job completed: ${alertsCreated} alerts created, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: staleShipments.length,
        alertsCreated,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CCT-DEP-ALERT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
