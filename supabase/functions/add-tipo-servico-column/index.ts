import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Connecting to MariaDB to add tipo_servico column...");
    
    const client = await new Client().connect({
      hostname: Deno.env.get("MARIADB_HOST")!,
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER")!,
      password: Deno.env.get("MARIADB_PASSWORD")!,
      db: Deno.env.get("MARIADB_DATABASE")!,
    });

    console.log("Connected to MariaDB");

    // Check if column exists
    const checkQuery = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 't_status_aereo' 
      AND COLUMN_NAME = 'tipo_servico'
    `;
    
    const existingColumns = await client.query(checkQuery, [Deno.env.get("MARIADB_DATABASE")!]);
    
    let columnAdded = false;
    
    if (existingColumns.length === 0) {
      console.log("Adding tipo_servico column...");
      await client.execute(`
        ALTER TABLE t_status_aereo 
        ADD COLUMN tipo_servico VARCHAR(50) DEFAULT 'N/A'
      `);
      columnAdded = true;
      console.log("Column tipo_servico added successfully");
    } else {
      console.log("Column tipo_servico already exists");
    }

    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        message: columnAdded ? "Column tipo_servico added successfully" : "Column tipo_servico already exists",
        columnAdded
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
