import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

  console.log("=== Starting Demurrage MariaDB Sync (MariaDB to MariaDB) ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  let client: Client | null = null;

  try {
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
    client = await new Client().connect(mariaConfig);
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
      FROM dados_dachser.t_tracking_sea t
      LEFT JOIN dados_dachser.t_consulta_armador c 
        ON t.mbl_id COLLATE utf8mb4_general_ci = c.mbl_id COLLATE utf8mb4_general_ci
      WHERE t.active = 1
        AND t.tipo_processo IN ('SEA IMPORT', 'SEA EXPORT')
        AND t.container IS NOT NULL
        AND t.container != ''
        AND UPPER(t.container) != 'PENDENTE'
      ORDER BY t.id DESC
      LIMIT 1000
    `;

    console.log("Executing source query...");
    const rows = await client.query(query) as MariaDBRow[];
    console.log(`✓ Found ${rows.length} records from source tables`);

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

        const numero = row.container.trim();
        const mbl = row.mbl_id.trim();

        // Map cronos_status from last_event
        const cronosStatus = mapCronosStatus(row.last_event, row.status_armador, row.container_status);

        // Infer container type from container number
        const tipoConteiner = inferContainerType(numero);

        // Check if record already exists
        const existing = await client.query(`
          SELECT id, cronos_status, ft_started_at, data_atracacao, data_gate_out, data_devolucao
          FROM dados_dachser.t_dachser_demurrage_containers
          WHERE numero = ? AND mbl = ?
          LIMIT 1
        `, [numero, mbl]);

        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const etd = row.etd ? formatDate(row.etd) : null;
        const eta = row.eta_confirmado ? formatDate(row.eta_confirmado) : (row.eta ? formatDate(row.eta) : null);

        // Calculate dates based on status transitions
        let ftStartedAt = existing?.[0]?.ft_started_at || null;
        let dataAtracacao = existing?.[0]?.data_atracacao || null;
        let dataGateOut = existing?.[0]?.data_gate_out || null;
        let dataDevolucao = existing?.[0]?.data_devolucao || null;

        // Set dates when status changes
        if (cronosStatus === 'ARRIVED' && !dataAtracacao) {
          dataAtracacao = now.split(' ')[0];
        }
        if (cronosStatus === 'ARRIVED' && !ftStartedAt) {
          ftStartedAt = now;
        }
        if (cronosStatus === 'GATE_OUT' && !dataGateOut) {
          dataGateOut = now.split(' ')[0];
        }
        if (cronosStatus === 'RETURNED' && !dataDevolucao) {
          dataDevolucao = now.split(' ')[0];
        }

        if (existing && existing.length > 0) {
          // Update existing record
          await client.execute(`
            UPDATE dados_dachser.t_dachser_demurrage_containers SET
              booking = ?,
              cliente = ?,
              armador = ?,
              tipo_processo = ?,
              porto_origem = ?,
              porto_destino = ?,
              navio = ?,
              vessel_imo = ?,
              voyage = ?,
              etd = ?,
              eta = ?,
              last_event = ?,
              container_status = ?,
              status_armador = ?,
              cronos_status = ?,
              email_analista = ?,
              email_cliente = ?,
              tipo_conteiner = COALESCE(tipo_conteiner, ?),
              ft_started_at = COALESCE(ft_started_at, ?),
              data_atracacao = COALESCE(data_atracacao, ?),
              data_gate_out = COALESCE(data_gate_out, ?),
              data_devolucao = COALESCE(data_devolucao, ?),
              mariadb_id = ?,
              last_sync_at = NOW(),
              updated_at = NOW()
            WHERE id = ?
          `, [
            row.booking || null,
            row.consignee || null,
            row.shipping_line || null,
            row.tipo_processo || null,
            row.origem || null,
            row.destino || null,
            row.navio || null,
            row.vessel_imo || null,
            row.voyage || null,
            etd,
            eta,
            row.last_event || null,
            row.container_status || null,
            row.status_armador || null,
            cronosStatus,
            row.email_analista || null,
            row.email_cliente || null,
            tipoConteiner,
            ftStartedAt,
            dataAtracacao,
            dataGateOut,
            dataDevolucao,
            row.id,
            existing[0].id
          ]);
          results.updated++;
        } else {
          // Insert new record
          await client.execute(`
            INSERT INTO dados_dachser.t_dachser_demurrage_containers (
              numero, mbl, booking, cliente, armador, tipo_processo,
              porto_origem, porto_destino, navio, vessel_imo, voyage,
              etd, eta, last_event, container_status, status_armador, cronos_status,
              email_analista, email_cliente, tipo_conteiner,
              ft_started_at, data_atracacao, data_gate_out, data_devolucao,
              mariadb_id, last_sync_at, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
          `, [
            numero,
            mbl,
            row.booking || null,
            row.consignee || null,
            row.shipping_line || null,
            row.tipo_processo || null,
            row.origem || null,
            row.destino || null,
            row.navio || null,
            row.vessel_imo || null,
            row.voyage || null,
            etd,
            eta,
            row.last_event || null,
            row.container_status || null,
            row.status_armador || null,
            cronosStatus,
            row.email_analista || null,
            row.email_cliente || null,
            tipoConteiner,
            ftStartedAt,
            dataAtracacao,
            dataGateOut,
            dataDevolucao,
            row.id
          ]);
          results.created++;
        }
      } catch (rowError) {
        results.errors++;
        results.error_details.push(`Row ${row.id}: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
      }
    }

    await client.close();
    console.log("✓ MariaDB connection closed");

    console.log("=== Sync Complete ===");
    console.log(`Created: ${results.created}, Updated: ${results.updated}, Errors: ${results.errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demurrage sync completed (MariaDB to MariaDB)",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Sync error:", error);
    if (client) {
      try { await client.close(); } catch {}
    }
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

function inferContainerType(containerNumber: string): string {
  // Container number format: XXXX1234567
  // The check digit and size/type can sometimes be inferred
  // Common container types: 20DV, 40DV, 40HC, 20RF, 40RF
  
  const upper = containerNumber.toUpperCase();
  
  // Check for reefer indicators
  if (upper.includes('RF') || upper.includes('RE')) {
    return '40RF';
  }
  
  // Check for high cube
  if (upper.includes('HC') || upper.includes('HQ')) {
    return '40HC';
  }
  
  // Default based on common patterns
  // Most sea containers are 40ft
  return '40DV';
}
