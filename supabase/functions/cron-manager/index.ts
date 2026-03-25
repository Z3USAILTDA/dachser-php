import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      // Get jobs with last run info
      const jobs = await sql`
        SELECT 
          j.jobid, j.jobname, j.schedule, j.active, j.command,
          lr.last_run_at,
          lr.last_status,
          lr.last_return_message,
          lr.last_duration_seconds
        FROM cron.job j
        LEFT JOIN LATERAL (
          SELECT 
            d.start_time as last_run_at,
            d.status as last_status,
            d.return_message as last_return_message,
            EXTRACT(EPOCH FROM (d.end_time - d.start_time))::numeric(10,2) as last_duration_seconds
          FROM cron.job_run_details d
          WHERE d.jobid = j.jobid
          ORDER BY d.start_time DESC
          LIMIT 1
        ) lr ON true
        ORDER BY j.jobname
      `;

      // Get failure count in last 24h
      const failures = await sql`
        SELECT COUNT(*) as count
        FROM cron.job_run_details
        WHERE status = 'failed'
          AND start_time > now() - interval '24 hours'
      `;

      result = { 
        jobs,
        recent_failures: Number(failures[0]?.count || 0)
      };

    } else if (req.method === "GET" && action === "history") {
      const jobid = url.searchParams.get("jobid");
      if (!jobid) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "jobid is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const history = await sql`
        SELECT 
          runid,
          status,
          return_message,
          start_time,
          end_time,
          EXTRACT(EPOCH FROM (end_time - start_time))::numeric(10,2) as duration_seconds
        FROM cron.job_run_details
        WHERE jobid = ${Number(jobid)}
        ORDER BY start_time DESC
        LIMIT 15
      `;
      result = { history };

    } else if (req.method === "POST" && action === "update_schedule") {
      const { jobid, schedule } = await req.json();
      if (!jobid || !schedule) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "jobid and schedule are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
      
      // Fire-and-forget: dispatch the request without awaiting the response
      fetch(functionUrl, {
        method: "POST",
        headers: { ...headersObj, "Content-Type": "application/json" },
        body: JSON.stringify({ time: new Date().toISOString() }),
      }).catch((e) => console.error("Fire-and-forget error:", e.message));

      result = {
        success: true,
        message: "Função disparada com sucesso (fire-and-forget)",
      };

    } else {
      await sql.end();
      return new Response(
        JSON.stringify({ error: "Invalid action. Use: list, update_schedule, toggle_active, run_now, history" }),
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
