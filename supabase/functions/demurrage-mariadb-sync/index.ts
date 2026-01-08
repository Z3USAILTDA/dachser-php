import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MariaDBTracking {
  id: number;
  mbl_id: string;
  tipo_processo: string;
  container: string;
  shipping_line: string;
  consignee: string;
  origem: string;
  destino: string;
  navio: string;
  eta: Date | null;
  last_event: string | null;
  container_status: string | null;
  email_analista: string | null;
  email_cliente: string | null;
  active: number;
  booking: string | null;
  etd: Date | null;
  eta_confirmado: Date | null;
  status_armador: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Starting MariaDB Sync ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  try {
    // MariaDB connection config from secrets
    const mariaConfig = {
      hostname: Deno.env.get("MARIADB_HOST") || "",
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER") || "",
      password: Deno.env.get("MARIADB_PASSWORD") || "",
      db: Deno.env.get("MARIADB_DATABASE") || "",
    };

    if (!mariaConfig.hostname || !mariaConfig.username) {
      throw new Error("MariaDB credentials not configured. Please set MARIADB_HOST, MARIADB_USER, MARIADB_PASSWORD, MARIADB_DATABASE secrets.");
    }

    console.log(`Connecting to MariaDB at ${mariaConfig.hostname}:${mariaConfig.port}, database: ${mariaConfig.db}`);

    // Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Connect to MariaDB
    const mariaClient = await new Client().connect(mariaConfig);
    console.log("✓ Connected to MariaDB successfully");

    // Query with JOIN between t_tracking_sea and t_consulta_armador
    // Using COLLATE to handle collation mismatch between tables
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
        t.eta,
        t.last_event,
        t.container_status,
        t.email_analista,
        t.email_cliente,
        t.active,
        c.booking,
        c.etd,
        c.eta as eta_confirmado,
        c.status_armador
      FROM t_tracking_sea t
      LEFT JOIN t_consulta_armador c ON t.mbl_id COLLATE utf8mb4_general_ci = c.mbl_id COLLATE utf8mb4_general_ci
      WHERE t.active = 1
        AND t.tipo_processo IN ('SEA IMPORT', 'SEA EXPORT')
      ORDER BY t.id DESC
      LIMIT 500
    `;

    console.log("Executing query on MariaDB...");
    
    let rows: MariaDBTracking[] = [];
    try {
      const result = await mariaClient.query(query);
      rows = result as MariaDBTracking[];
      console.log(`✓ Found ${rows.length} records to sync`);
    } catch (queryError) {
      console.error("Query error:", queryError);
      throw new Error(`Failed to query MariaDB: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
    }

    const results = {
      total_records: rows.length,
      shipments_created: 0,
      shipments_updated: 0,
      containers_created: 0,
      containers_updated: 0,
      containers_skipped_pendente: 0,
      errors: 0,
      error_details: [] as string[],
    };

    // Process each record
    for (const row of rows) {
      try {
        if (!row.mbl_id) {
          console.log(`Skipping record ${row.id}: No MBL ID`);
          continue;
        }

        // Determine modal from tipo_processo
        const modal = row.tipo_processo?.includes('IMPORT') ? 'FCL' : 'FCL';
        
        // Use eta_confirmado if available, otherwise eta
        const arrivalDate = row.eta_confirmado || row.eta;

        // Check if shipment exists
        const { data: existingShipment } = await supabase
          .from('shipments')
          .select('id')
          .eq('master', row.mbl_id)
          .single();

        let shipmentId: string | null = null;

        if (existingShipment) {
          // Update existing shipment
          const { error: updateError } = await supabase
            .from('shipments')
            .update({
              cliente: row.consignee || 'Unknown',
              armador: row.shipping_line || 'Unknown',
              modal: modal,
              porto_origem: row.origem || null,
              porto_destino: row.destino || null,
              data_atracacao: arrivalDate ? formatDate(arrivalDate) : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingShipment.id);

          if (updateError) {
            console.error(`Error updating shipment ${row.mbl_id}:`, updateError);
            results.errors++;
            results.error_details.push(`Shipment update ${row.mbl_id}: ${updateError.message}`);
          } else {
            shipmentId = existingShipment.id;
            results.shipments_updated++;
          }
        } else {
          // Create new shipment
          const { data: newShipment, error: insertError } = await supabase
            .from('shipments')
            .insert({
              master: row.mbl_id,
              cliente: row.consignee || 'Unknown',
              armador: row.shipping_line || 'Unknown',
              modal: modal,
              porto_origem: row.origem || null,
              porto_destino: row.destino || null,
              data_atracacao: arrivalDate ? formatDate(arrivalDate) : null,
            })
            .select('id')
            .single();

          if (insertError) {
            console.error(`Error creating shipment ${row.mbl_id}:`, insertError);
            results.errors++;
            results.error_details.push(`Shipment insert ${row.mbl_id}: ${insertError.message}`);
          } else {
            shipmentId = newShipment?.id || null;
            results.shipments_created++;
            console.log(`✓ Created shipment for MBL ${row.mbl_id}`);
          }
        }

        // Process container (skip if "PENDENTE" or empty)
        if (!row.container || row.container.toUpperCase() === 'PENDENTE' || row.container.trim() === '') {
          results.containers_skipped_pendente++;
          continue;
        }

        // Map cronos_status from last_event or status_armador
        const cronosStatus = mapCronosStatus(row.last_event, row.status_armador, row.container_status);

        // Check if container exists
        const { data: existingContainer } = await supabase
          .from('containers')
          .select('id')
          .eq('numero', row.container)
          .single();

        const containerData = {
          numero: row.container,
          shipment_id: shipmentId,
          cronos_status: cronosStatus,
          updated_at: new Date().toISOString(),
        };

        if (existingContainer) {
          // Update existing container
          const { error: updateError } = await supabase
            .from('containers')
            .update(containerData)
            .eq('id', existingContainer.id);

          if (updateError) {
            console.error(`Error updating container ${row.container}:`, updateError);
            results.errors++;
            results.error_details.push(`Container update ${row.container}: ${updateError.message}`);
          } else {
            results.containers_updated++;
          }
        } else {
          // Create new container
          const { error: insertError } = await supabase
            .from('containers')
            .insert(containerData);

          if (insertError) {
            console.error(`Error creating container ${row.container}:`, insertError);
            results.errors++;
            results.error_details.push(`Container insert ${row.container}: ${insertError.message}`);
          } else {
            results.containers_created++;
            console.log(`✓ Created container ${row.container}`);
          }
        }
      } catch (rowError) {
        console.error(`Error processing record ${row.id}:`, rowError);
        results.errors++;
        results.error_details.push(`Record ${row.id}: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
      }
    }

    // Close MariaDB connection
    await mariaClient.close();
    console.log("✓ MariaDB connection closed");

    console.log("=== MariaDB Sync Complete ===");
    console.log(`Results: ${JSON.stringify(results, null, 2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "MariaDB sync completed successfully",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("MariaDB sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
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

  // Check for returned/delivered status
  if (eventLower.includes('return') || eventLower.includes('devol') || 
      statusLower.includes('return') || containerLower.includes('return')) {
    return 'RETURNED';
  }

  // Check for gate out status
  if (eventLower.includes('gate out') || eventLower.includes('gateout') ||
      eventLower.includes('saída') || eventLower.includes('saida') ||
      statusLower.includes('gate out')) {
    return 'GATE_OUT';
  }

  // Check for arrived/discharged status
  if (eventLower.includes('arrived') || eventLower.includes('discharged') ||
      eventLower.includes('atracado') || eventLower.includes('descarregado')) {
    return 'ARRIVED';
  }

  // Check for in transit
  if (eventLower.includes('transit') || eventLower.includes('departed') ||
      eventLower.includes('em trânsito') || eventLower.includes('embarcado')) {
    return 'IN_TRANSIT';
  }

  // Default to pending
  return 'PENDING';
}
