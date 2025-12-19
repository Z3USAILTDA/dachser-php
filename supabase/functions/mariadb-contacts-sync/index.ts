import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let mariaClient: Client | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // MariaDB connection details
    const host = Deno.env.get("MARIADB_HOST");
    const port = parseInt(Deno.env.get("MARIADB_PORT") || "3306");
    const database = Deno.env.get("MARIADB_DATABASE");
    const username = Deno.env.get("MARIADB_USER");
    const password = Deno.env.get("MARIADB_PASSWORD");

    if (!host || !database || !username || !password) {
      throw new Error("Missing MariaDB credentials");
    }

    console.log(`[mariadb-contacts-sync] Connecting to MariaDB at ${host}:${port}/${database}`);

    // Create MariaDB client
    mariaClient = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });

    console.log("[mariadb-contacts-sync] Connected to MariaDB");

    const results = { analysts: 0, clients: 0, errors: [] as string[] };

    // 1. Sync Analysts
    try {
      const analysts = await mariaClient.query(
        `SELECT DISTINCT nome_analista, email_analista 
         FROM t_master_dados 
         WHERE nome_analista IS NOT NULL AND nome_analista != '' 
         AND email_analista IS NOT NULL AND email_analista != ''`
      ) as { nome_analista: string; email_analista: string }[];

      console.log(`[mariadb-contacts-sync] Found ${analysts.length} unique analysts`);

      if (analysts.length > 0) {
        // Get existing analyst emails
        const { data: existingAnalysts } = await supabase
          .from("cct_contato_notificacao")
          .select("email")
          .eq("tipo", "analista")
          .eq("origem", "mariadb");

        const existingEmails = new Set((existingAnalysts || []).map((a: { email: string }) => a.email.toLowerCase()));

        const newAnalysts = analysts
          .filter(a => !existingEmails.has(a.email_analista.toLowerCase()))
          .map(a => ({
            nome: a.nome_analista,
            email: a.email_analista,
            tipo: "analista",
            origem: "mariadb",
            ativo: true,
          }));

        if (newAnalysts.length > 0) {
          const { error } = await supabase
            .from("cct_contato_notificacao")
            .insert(newAnalysts);

          if (error) {
            results.errors.push(`Analysts insert error: ${error.message}`);
          } else {
            results.analysts = newAnalysts.length;
          }
        }
      }
    } catch (err: any) {
      results.errors.push(`Analyst sync error: ${err.message}`);
    }

    // 2. Sync Clients
    try {
      const clients = await mariaClient.query(
        `SELECT DISTINCT cliente, emails_cliente 
         FROM t_master_dados 
         WHERE emails_cliente IS NOT NULL AND emails_cliente != '' 
         AND cliente IS NOT NULL AND cliente != ''`
      ) as { cliente: string; emails_cliente: string }[];

      console.log(`[mariadb-contacts-sync] Found ${clients.length} unique clients`);

      if (clients.length > 0) {
        // Get existing client emails
        const { data: existingClients } = await supabase
          .from("cct_contato_notificacao")
          .select("email")
          .eq("tipo", "cliente")
          .eq("origem", "mariadb");

        const existingEmails = new Set((existingClients || []).map((c: { email: string }) => c.email.toLowerCase()));

        const newClients: { nome: string; email: string; empresa: string; tipo: string; origem: string; ativo: boolean }[] = [];

        for (const row of clients) {
          const empresa = row.cliente?.includes("-") ? row.cliente.split("-")[0].trim() : row.cliente;
          const emails = row.emails_cliente.split(/[;,]/).map(e => e.trim()).filter(e => e && e.includes("@"));

          for (const email of emails) {
            if (!existingEmails.has(email.toLowerCase())) {
              newClients.push({
                nome: email.split("@")[0],
                email: email,
                empresa: empresa,
                tipo: "cliente",
                origem: "mariadb",
                ativo: true,
              });
              existingEmails.add(email.toLowerCase());
            }
          }
        }

        if (newClients.length > 0) {
          const { error } = await supabase
            .from("cct_contato_notificacao")
            .insert(newClients);

          if (error) {
            results.errors.push(`Clients insert error: ${error.message}`);
          } else {
            results.clients = newClients.length;
          }
        }
      }
    } catch (err: any) {
      results.errors.push(`Client sync error: ${err.message}`);
    }

    await mariaClient.close();
    console.log("[mariadb-contacts-sync] Connection closed");

    // Log the sync result
    await supabase.from("cct_log_entry").insert({
      conector: "MARIADB_CONTACTS",
      tipo: "SYNC",
      mensagem: `Contacts Sync: ${results.analysts} analistas, ${results.clients} clientes adicionados`,
    });

    console.log(`[mariadb-contacts-sync] Synced ${results.analysts} analysts, ${results.clients} clients`);

    return new Response(JSON.stringify({
      success: true,
      analysts_added: results.analysts,
      clients_added: results.clients,
      errors: results.errors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[mariadb-contacts-sync] Error:", error);
    
    if (mariaClient) {
      try {
        await mariaClient.close();
      } catch (closeError) {
        console.error("Error closing connection:", closeError);
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
