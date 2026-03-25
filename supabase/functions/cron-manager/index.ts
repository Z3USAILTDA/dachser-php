import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_DB_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sql = postgres(dbUrl, { max: 1 });

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    let result: unknown;

    if (req.method === "GET" && action === "list") {
      const jobs = await sql`
        SELECT jobid, jobname, schedule, active, command
        FROM cron.job
        ORDER BY jobname
      `;
      result = { jobs };

    } else if (req.method === "POST" && action === "update_schedule") {
      const { jobid, schedule } = await req.json();
      if (!jobid || !schedule) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "jobid and schedule are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Validate cron expression (basic: 5 fields)
      const cronParts = schedule.trim().split(/\s+/);
      if (cronParts.length !== 5) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "Invalid cron expression. Must have 5 fields." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await sql`SELECT cron.alter_job(${jobid}::bigint, schedule := ${schedule})`;
      result = { success: true, message: `Schedule updated to ${schedule}` };

    } else if (req.method === "POST" && action === "toggle_active") {
      const { jobid, active } = await req.json();
      if (jobid === undefined || active === undefined) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "jobid and active are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await sql`SELECT cron.alter_job(${jobid}::bigint, active := ${active}::boolean)`;
      result = { success: true, message: `Job ${active ? "activated" : "deactivated"}` };

    } else if (req.method === "POST" && action === "run_now") {
      const { command } = await req.json();
      if (!command) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "command is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Extract the URL from the command and call it
      const urlMatch = command.match(/url:='([^']+)'/);
      if (!urlMatch) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "Could not extract function URL from command" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const functionUrl = urlMatch[1];
      const headersMatch = command.match(/headers:='([^']+)'/);
      const headersObj = headersMatch ? JSON.parse(headersMatch[1]) : {};
      
      const bodyMatch = command.match(/body:=concat\('([^']*)',\s*now\(\),\s*'([^']*)'\)/);
      const body = bodyMatch
        ? JSON.stringify({ time: new Date().toISOString() })
        : "{}";

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { ...headersObj, "Content-Type": "application/json" },
        body,
      });
      const responseText = await response.text();
      result = {
        success: true,
        status: response.status,
        response: responseText.substring(0, 500),
      };

    } else {
      await sql.end();
      return new Response(
        JSON.stringify({ error: "Invalid action. Use: list, update_schedule, toggle_active, run_now" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await sql.end();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cron manager error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
