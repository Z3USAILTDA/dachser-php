import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MariaDBRow {
  id: number;
  mbl_id: string;
  tipo_processo: string;
  container: string;
  shipping_line: string;
  consignee: string;
  origem: string;
  destino: string;
  navio: string;
  vessel_imo: string | null;
  eta: Date | null;
  last_event: string | null;
  container_status: string | null;
  email_analista: string | null;
  email_cliente: string | null;
  active: number;
  booking: string | null;
  etd: Date | null;
  eta_confirmado: Date | null;
  voyage: string | null;
  status_armador: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Starting Demurrage MariaDB Sync ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  try {
    // MariaDB connection config
    const mariaConfig = {
      hostname: Deno.env.get("MARIADB_HOST") || "",
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER") || "",
      password: Deno.env.get("MARIADB_PASSWORD") || "",
      db: Deno.env.get("MARIADB_DATABASE") || "",
    };

    if (!mariaConfig.hostname || !mariaConfig.username) {
      throw new Error("MariaDB credentials not configured");
    }

    console.log(`Connecting to MariaDB at ${mariaConfig.hostname}:${mariaConfig.port}`);

    // Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Connect to MariaDB
    const mariaClient = await new Client().connect(mariaConfig);
    console.log("✓ Connected to MariaDB");

    // Query joining t_tracking_sea and t_consulta_armador
    const query = `
      SELECT 
        t.id,
        t.mbl_id,
        t.tipo_processo,
        t.container,
        t.shipping_line,
        t.consignee,
        t.origem,
        t.destino,
        t.navio,
        t.vessel_imo,
        t.eta,
        t.last_event,
        t.container_status,
        t.email_analista,
        t.email_cliente,
        t.active,
        c.booking,
        c.etd,
        c.eta as eta_confirmado,
        c.voyage,
        c.status_armador
      FROM t_tracking_sea t
      LEFT JOIN t_consulta_armador c 
        ON t.mbl_id COLLATE utf8mb4_general_ci = c.mbl_id COLLATE utf8mb4_general_ci
      WHERE t.active = 1
        AND t.tipo_processo IN ('SEA IMPORT', 'SEA EXPORT')
        AND t.container IS NOT NULL
        AND t.container != ''
        AND UPPER(t.container) != 'PENDENTE'
      ORDER BY t.id DESC
      LIMIT 1000
    `;

    console.log("Executing MariaDB query...");
    const rows = await mariaClient.query(query) as MariaDBRow[];
    console.log(`✓ Found ${rows.length} records`);

    const results = {
      total_records: rows.length,
      created: 0,
      updated: 0,
      errors: 0,
      error_details: [] as string[],
    };

    // Process each record
    for (const row of rows) {
      try {
        if (!row.mbl_id || !row.container) continue;

        // Map cronos_status from last_event
        const cronosStatus = mapCronosStatus(row.last_event, row.status_armador, row.container_status);

        // Prepare container data for upsert
        const containerData = {
          numero: row.container.trim(),
          mbl: row.mbl_id.trim(),
          booking: row.booking || null,
          cliente: row.consignee || null,
          armador: row.shipping_line || null,
          tipo_processo: row.tipo_processo || null,
          porto_origem: row.origem || null,
          porto_destino: row.destino || null,
          navio: row.navio || null,
          vessel_imo: row.vessel_imo || null,
          voyage: row.voyage || null,
          etd: row.etd ? formatDate(row.etd) : null,
          eta: row.eta_confirmado ? formatDate(row.eta_confirmado) : (row.eta ? formatDate(row.eta) : null),
          last_event: row.last_event || null,
          container_status: row.container_status || null,
          status_armador: row.status_armador || null,
          cronos_status: cronosStatus,
          email_analista: row.email_analista || null,
          email_cliente: row.email_cliente || null,
          mariadb_id: row.id,
          last_sync_at: new Date().toISOString(),
          active: true,
          updated_at: new Date().toISOString(),
        };

        // Check if record exists
        const { data: existing } = await supabase
          .from('t_demurrage_containers')
          .select('id')
          .eq('numero', containerData.numero)
          .eq('mbl', containerData.mbl)
          .single();

        if (existing) {
          // Update existing
          const { error: updateError } = await supabase
            .from('t_demurrage_containers')
            .update(containerData)
            .eq('id', existing.id);

          if (updateError) {
            results.errors++;
            results.error_details.push(`Update ${row.container}: ${updateError.message}`);
          } else {
            results.updated++;
          }
        } else {
          // Insert new
          const { error: insertError } = await supabase
            .from('t_demurrage_containers')
            .insert(containerData);

          if (insertError) {
            results.errors++;
            results.error_details.push(`Insert ${row.container}: ${insertError.message}`);
          } else {
            results.created++;
          }
        }
      } catch (rowError) {
        results.errors++;
        results.error_details.push(`Row ${row.id}: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
      }
    }

    await mariaClient.close();
    console.log("✓ MariaDB connection closed");

    console.log("=== Sync Complete ===");
    console.log(`Created: ${results.created}, Updated: ${results.updated}, Errors: ${results.errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demurrage sync completed",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

function formatDate(date: Date | string): string {
  if (typeof date === 'string') return date.split('T')[0];
  return date.toISOString().split('T')[0];
}

function mapCronosStatus(lastEvent: string | null, statusArmador: string | null, containerStatus: string | null): string {
  const eventLower = (lastEvent || '').toLowerCase();
  const statusLower = (statusArmador || '').toLowerCase();
  const containerLower = (containerStatus || '').toLowerCase();

  // Returned/delivered
  if (eventLower.includes('return') || eventLower.includes('devol') || 
      statusLower.includes('return') || containerLower.includes('return') ||
      eventLower.includes('empty') || containerLower.includes('empty')) {
    return 'RETURNED';
  }

  // Gate out
  if (eventLower.includes('gate out') || eventLower.includes('gateout') ||
      eventLower.includes('saída') || eventLower.includes('saida') ||
      statusLower.includes('gate out') || containerLower.includes('gate-out')) {
    return 'GATE_OUT';
  }

  // Arrived/discharged
  if (eventLower.includes('arrived') || eventLower.includes('discharged') ||
      eventLower.includes('atracado') || eventLower.includes('descarregado') ||
      eventLower.includes('arrival') || containerLower.includes('discharged')) {
    return 'ARRIVED';
  }

  // In transit
  if (eventLower.includes('transit') || eventLower.includes('departed') ||
      eventLower.includes('em trânsito') || eventLower.includes('embarcado') ||
      eventLower.includes('loaded') || eventLower.includes('sailing')) {
    return 'IN_TRANSIT';
  }

  return 'PENDING';
}
