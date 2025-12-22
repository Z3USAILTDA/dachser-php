import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, airlineCodes } = await req.json();

    const hostname = Deno.env.get("MARIADB_HOST") || "";
    const port = parseInt(Deno.env.get("MARIADB_PORT") || "3306");
    const username = Deno.env.get("MARIADB_USER") || "";
    const password = Deno.env.get("MARIADB_PASSWORD") || "";
    const database = Deno.env.get("MARIADB_DATABASE") || "";

    console.log(`Connecting to MariaDB at ${hostname}:${port}/${database}`);

    const client = await new Client().connect({
      hostname,
      port,
      username,
      password,
      db: database,
    });

    console.log("Connected to MariaDB successfully");

    let result;

    if (action === "preview") {
      // Preview: show AWBs that would be updated
      const codes = airlineCodes || ["016", "139"];
      const placeholders = codes.map(() => "?").join(", ");
      
      const query = `
        SELECT awb, LEFT(awb, 3) as airline_code, \`último_status\`, \`última atualização\` as updated_at 
        FROM t_status_aereo 
        WHERE \`último_status\` = 'COMPANY_NOT_REGISTERED' 
        AND LEFT(awb, 3) IN (${placeholders})
        ORDER BY id DESC
      `;
      
      console.log(`Executing preview query for codes: ${codes.join(", ")}`);
      const rows = await client.query(query, codes);
      
      result = {
        success: true,
        action: "preview",
        airlineCodes: codes,
        count: rows.length,
        awbs: rows
      };
    } else if (action === "reset") {
      // Reset: update status from COMPANY_NOT_REGISTERED to PENDING
      const codes = airlineCodes || ["016", "139"];
      const placeholders = codes.map(() => "?").join(", ");
      
      const updateQuery = `
        UPDATE t_status_aereo 
        SET \`último_status\` = 'PENDING'
        WHERE \`último_status\` = 'COMPANY_NOT_REGISTERED' 
        AND LEFT(awb, 3) IN (${placeholders})
      `;
      
      console.log(`Executing reset query for codes: ${codes.join(", ")}`);
      const updateResult = await client.execute(updateQuery, codes);
      
      result = {
        success: true,
        action: "reset",
        airlineCodes: codes,
        affectedRows: updateResult.affectedRows
      };
    } else if (action === "status") {
      // Status: show counts by status for specific airline codes
      const codes = airlineCodes || ["016", "139"];
      const placeholders = codes.map(() => "?").join(", ");
      
      const query = `
        SELECT LEFT(awb, 3) as airline_code, \`último_status\`, COUNT(*) as total
        FROM t_status_aereo 
        WHERE LEFT(awb, 3) IN (${placeholders})
        GROUP BY LEFT(awb, 3), \`último_status\`
        ORDER BY airline_code, total DESC
      `;
      
      console.log(`Executing status query for codes: ${codes.join(", ")}`);
      const rows = await client.query(query, codes);
      
      result = {
        success: true,
        action: "status",
        airlineCodes: codes,
        statusCounts: rows
      };
    } else {
      result = {
        success: false,
        error: "Invalid action. Use 'preview', 'reset', or 'status'"
      };
    }

    await client.close();
    console.log("MariaDB connection closed");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error:", errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
