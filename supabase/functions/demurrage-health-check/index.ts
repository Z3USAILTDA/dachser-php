import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheckResult {
  service: string;
  status: "healthy" | "degraded" | "unhealthy";
  latency_ms: number;
  message?: string;
  last_checked: string;
}

interface HealthCheckRequest {
  test_email?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const results: HealthCheckResult[] = [];
  const startTime = Date.now();

  let testEmail: string | undefined;
  try {
    const body: HealthCheckRequest = await req.json();
    testEmail = body.test_email;
  } catch {
    // No body or invalid JSON - that's fine
  }

  try {
    // 1. Check Database Connection
    const dbStart = Date.now();
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .limit(1);

      results.push({
        service: "Database",
        status: error ? "unhealthy" : "healthy",
        latency_ms: Date.now() - dbStart,
        message: error ? error.message : "Connection successful",
        last_checked: new Date().toISOString(),
      });
    } catch (e: any) {
      results.push({
        service: "Database",
        status: "unhealthy",
        latency_ms: Date.now() - dbStart,
        message: e.message,
        last_checked: new Date().toISOString(),
      });
    }

    // 2. Check JSONCARGO API
    const jsoncargoStart = Date.now();
    const jsoncargoApiKey = Deno.env.get("JSONCARGO_API_KEY");
    
    if (!jsoncargoApiKey) {
      results.push({
        service: "JSONCARGO",
        status: "unhealthy",
        latency_ms: 0,
        message: "API key not configured",
        last_checked: new Date().toISOString(),
      });
    } else {
      try {
        const response = await fetch("https://api.jsoncargo.com/api/tracking/line/msc/container/MSCU1234567", {
          method: "GET",
          headers: {
            "x-api-key": jsoncargoApiKey,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });

        const latency = Date.now() - jsoncargoStart;
        const isWorking = response.ok || response.status === 404;
        
        results.push({
          service: "JSONCARGO",
          status: isWorking ? "healthy" : "unhealthy",
          latency_ms: latency,
          message: isWorking ? "API accessible" : `HTTP ${response.status}: ${response.statusText}`,
          last_checked: new Date().toISOString(),
        });
      } catch (e: any) {
        results.push({
          service: "JSONCARGO",
          status: "degraded",
          latency_ms: Date.now() - jsoncargoStart,
          message: e.name === "TimeoutError" ? "Request timeout" : e.message,
          last_checked: new Date().toISOString(),
        });
      }
    }

    // 3. Check Resend Email Service
    const resendStart = Date.now();
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      results.push({
        service: "Resend (Email)",
        status: "unhealthy",
        latency_ms: 0,
        message: "API key not configured",
        last_checked: new Date().toISOString(),
      });
    } else if (testEmail) {
      try {
        const resend = new Resend(resendApiKey);
        
        const { data, error } = await resend.emails.send({
          from: "CRONOS Health Check <alerts@hermes.z3us.ai>",
          to: [testEmail],
          subject: "✅ CRONOS Health Check - Email Service OK",
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background: #1a1a2e; color: #fff;">
              <h2 style="color: #10b981;">✅ Serviço de Email Operacional</h2>
              <p>Este é um email de teste automático do CRONOS Health Check.</p>
              <p>O serviço Resend está funcionando corretamente.</p>
              <hr style="border-color: #333; margin: 20px 0;">
              <p style="color: #888; font-size: 12px;">
                Verificado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </p>
            </div>
          `,
        });

        const latency = Date.now() - resendStart;
        
        if (error) {
          results.push({
            service: "Resend (Email)",
            status: "unhealthy",
            latency_ms: latency,
            message: `Email send failed: ${error.message}`,
            last_checked: new Date().toISOString(),
          });
        } else {
          results.push({
            service: "Resend (Email)",
            status: "healthy",
            latency_ms: latency,
            message: `Test email sent to ${testEmail}`,
            last_checked: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        results.push({
          service: "Resend (Email)",
          status: "unhealthy",
          latency_ms: Date.now() - resendStart,
          message: e.message || "Unknown error sending test email",
          last_checked: new Date().toISOString(),
        });
      }
    } else {
      const isValidKeyFormat = resendApiKey.startsWith("re_");
      
      results.push({
        service: "Resend (Email)",
        status: isValidKeyFormat ? "healthy" : "degraded",
        latency_ms: Date.now() - resendStart,
        message: isValidKeyFormat 
          ? "API key configured (provide email for full test)" 
          : "Invalid API key format",
        last_checked: new Date().toISOString(),
      });
    }

    // Calculate overall status
    const unhealthyCount = results.filter(r => r.status === "unhealthy").length;
    const degradedCount = results.filter(r => r.status === "degraded").length;
    
    const overallStatus = unhealthyCount > 0 
      ? "unhealthy" 
      : degradedCount > 0 
        ? "degraded" 
        : "healthy";

    return new Response(
      JSON.stringify({
        status: overallStatus,
        total_latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        services: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
