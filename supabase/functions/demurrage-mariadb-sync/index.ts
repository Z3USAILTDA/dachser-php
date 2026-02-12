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
        AND UPPER(t.container) != 'NAO_ENCONTRADO'
        AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NOT FOUND%')
        AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NAO_ENCONTRADO%')
        AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%PREFIX NOT FOUND%')
        AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%NOT FOUND%')
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
          SELECT id, cronos_status, ft_started_at, data_atracacao, data_gate_out, data_devolucao, ft_source
          FROM dados_dachser.t_dachser_demurrage_containers
          WHERE numero = ? AND mbl = ?
          LIMIT 1
        `, [numero, mbl]);

        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const etd = row.etd ? formatDate(row.etd) : null;
        const eta = row.eta_confirmado ? formatDate(row.eta_confirmado) : (row.eta ? formatDate(row.eta) : null);

        // Fetch historical dates from t_tracking_sea_history
        const historicalDates = await fetchHistoricalDates(client, numero);
        console.log(`[${numero}] Historical dates: discharge=${historicalDates.discharge_date}, gate_out=${historicalDates.gate_out_date}, return=${historicalDates.return_date}`);

        // Calculate dates based on historical events first, then status transitions
        let ftStartedAt = existing?.[0]?.ft_started_at || null;
        let dataAtracacao = existing?.[0]?.data_atracacao || null;
        let dataGateOut = existing?.[0]?.data_gate_out || null;
        let dataDevolucao = existing?.[0]?.data_devolucao || null;
        let ftSource = existing?.[0]?.ft_source || null;

        // Priority: Historical dates > Status-based dates > Fallback
        
        // Data atracação: prioriza histórico (discharge = atracação/descarga)
        if (!dataAtracacao) {
          if (historicalDates.discharge_date) {
            dataAtracacao = historicalDates.discharge_date;
          } else if (cronosStatus === 'ARRIVED') {
            dataAtracacao = now.split(' ')[0];
          }
        }

        // ft_started_at: SEMPRE priorizar data real de descarga do histórico
        if (!ftStartedAt) {
          if (historicalDates.discharge_date) {
            ftStartedAt = `${historicalDates.discharge_date} 00:00:00`;
            ftSource = 'HISTORICAL';
          } else if (cronosStatus === 'ARRIVED') {
            ftStartedAt = now;
            ftSource = 'SYNC';
          } else if (eta) {
            ftStartedAt = `${eta} 00:00:00`;
            ftSource = 'ETA';
          }
          // Não usar fallback para now - deixar null se não houver evento de descarga
        }

        // Gate out: prioriza histórico
        if (!dataGateOut) {
          if (historicalDates.gate_out_date) {
            dataGateOut = historicalDates.gate_out_date;
          } else if (cronosStatus === 'GATE_OUT') {
            dataGateOut = now.split(' ')[0];
          }
        }

        // Devolução: prioriza histórico
        if (!dataDevolucao) {
          if (historicalDates.return_date) {
            dataDevolucao = historicalDates.return_date;
          } else if (cronosStatus === 'RETURNED') {
            dataDevolucao = now.split(' ')[0];
          }
        }

        if (existing && existing.length > 0) {
          // Update existing record - if historical dates found, update even existing values
          const shouldUpdateFt = historicalDates.discharge_date && ftSource === 'HISTORICAL';
          const shouldUpdateGateOut = historicalDates.gate_out_date;
          const shouldUpdateDevolucao = historicalDates.return_date;

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
              ft_started_at = CASE 
                WHEN ? = 'HISTORICAL' THEN ?
                ELSE COALESCE(ft_started_at, ?)
              END,
              ft_source = COALESCE(?, ft_source),
              data_atracacao = CASE 
                WHEN ? IS NOT NULL THEN ?
                ELSE COALESCE(data_atracacao, ?)
              END,
              data_gate_out = CASE 
                WHEN ? IS NOT NULL THEN ?
                ELSE COALESCE(data_gate_out, ?)
              END,
              data_devolucao = CASE 
                WHEN ? IS NOT NULL THEN ?
                ELSE COALESCE(data_devolucao, ?)
              END,
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
            // ft_started_at CASE params
            ftSource, ftStartedAt, ftStartedAt,
            // ft_source
            ftSource,
            // data_atracacao CASE params
            historicalDates.discharge_date, dataAtracacao, dataAtracacao,
            // data_gate_out CASE params
            historicalDates.gate_out_date, dataGateOut, dataGateOut,
            // data_devolucao CASE params
            historicalDates.return_date, dataDevolucao, dataDevolucao,
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
              ft_started_at, ft_source, data_atracacao, data_gate_out, data_devolucao,
              mariadb_id, last_sync_at, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
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
            ftSource,
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

// Fetch historical dates from t_tracking_sea_history
async function fetchHistoricalDates(client: Client, container: string): Promise<{
  discharge_date: string | null;
  gate_out_date: string | null;
  return_date: string | null;
}> {
  try {
    // Single query with UNION ALL for efficiency
    const query = `
      SELECT event_type, MIN(event_datetime) as event_datetime
      FROM (
        SELECT 'discharge' as event_type, event_datetime
        FROM dados_dachser.t_tracking_sea_history 
        WHERE container = ?
          AND (
            event_description LIKE '%Discharged%' 
            OR event_description = 'Discharge'
            OR event_description LIKE '%Unloaded from Vessel%'
            OR event_description LIKE '%Import Discharged%'
            OR event_description LIKE '%Descarga%'
          )
        
        UNION ALL
        
        SELECT 'gate_out' as event_type, event_datetime
        FROM dados_dachser.t_tracking_sea_history 
        WHERE container = ?
          AND (
            event_description LIKE '%Gate out%'
            OR event_description LIKE '%Gate-out%'
            OR event_description = 'Import to consignee'
            OR event_description LIKE '%Saída%'
            OR event_description LIKE '%Saida%'
          )
        
        UNION ALL
        
        SELECT 'return' as event_type, event_datetime
        FROM dados_dachser.t_tracking_sea_history 
        WHERE container = ?
          AND (
            event_description LIKE '%Empty%returned%'
            OR event_description LIKE '%Gate in%'
            OR event_description LIKE '%Devolução%'
            OR event_description LIKE '%Devolvido%'
            OR event_description LIKE '%Empty to shipper%'
          )
      ) AS events
      GROUP BY event_type
    `;

    const results = await client.query(query, [container, container, container]) as Array<{
      event_type: string;
      event_datetime: Date | string | null;
    }>;

    const dates: {
      discharge_date: string | null;
      gate_out_date: string | null;
      return_date: string | null;
    } = {
      discharge_date: null,
      gate_out_date: null,
      return_date: null,
    };

    for (const row of results) {
      if (row.event_datetime) {
        const dateStr = formatDate(row.event_datetime);
        switch (row.event_type) {
          case 'discharge':
            dates.discharge_date = dateStr;
            break;
          case 'gate_out':
            dates.gate_out_date = dateStr;
            break;
          case 'return':
            dates.return_date = dateStr;
            break;
        }
      }
    }

    return dates;
  } catch (error) {
    console.error(`Error fetching historical dates for ${container}:`, error);
    return { discharge_date: null, gate_out_date: null, return_date: null };
  }
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
