import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function testGemini(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  const key = customKey || Deno.env.get("GEMINI_API_KEY");
  if (!key) return { success: false, error: "GEMINI_API_KEY not configured" };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: customKey ? "custom key" : "env secret" };
}

async function testAnthropic(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  const key = customKey || Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { success: false, error: "ANTHROPIC_API_KEY not configured" };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: customKey ? "custom key" : "env secret" };
}

async function testResend(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  const key = customKey || Deno.env.get("RESEND_API_KEY");
  if (!key) return { success: false, error: "RESEND_API_KEY not configured" };

  const res = await fetch("https://api.resend.com/api-keys", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: customKey ? "custom key" : "env secret" };
}

async function testLeadcomex(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  const token = customKey || Deno.env.get("LEADCOMEX_API_TOKEN");
  if (!token) return { success: false, error: "LEADCOMEX_API_TOKEN not configured" };

  const res = await fetch("https://api.leadcomex.com/v1/consulta/di", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ numero_di: "0000000000" }),
  });
  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: `HTTP ${res.status} (auth OK)${customKey ? " – custom key" : ""}` };
}

async function testJsoncargo(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  const key = customKey || Deno.env.get("JSONCARGO_API_KEY");
  if (!key) return { success: false, error: "JSONCARGO_API_KEY not configured" };

  const res = await fetch("https://api.jsoncargo.com/v1/tracking?bl=TEST0000000", {
    headers: { "x-api-key": key },
  });
  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: `HTTP ${res.status} (auth OK)${customKey ? " – custom key" : ""}` };
}

async function testFlightradar(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  const key = customKey || Deno.env.get("FLIGHTRADAR_API_KEY");
  if (!key) return { success: false, error: "FLIGHTRADAR_API_KEY not configured" };

  const res = await fetch("https://fr24api.flightradar24.com/api/static/airlines/lite", {
    headers: { "Accept": "application/json", "Accept-Version": "v1", "Authorization": `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: `HTTP ${res.status}${customKey ? " – custom key" : ""}` };
}

async function testHapag(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  // For Hapag, customKey format: "clientId:apiKey"
  let clientId: string | undefined;
  let apiKey: string | undefined;
  if (customKey) {
    const parts = customKey.split(":");
    if (parts.length !== 2) return { success: false, error: "Formato: CLIENT_ID:API_KEY" };
    clientId = parts[0];
    apiKey = parts[1];
  } else {
    clientId = Deno.env.get("HAPAG_CLIENT_ID");
    apiKey = Deno.env.get("HAPAG_API_KEY");
  }
  if (!clientId || !apiKey) return { success: false, error: "HAPAG_CLIENT_ID or HAPAG_API_KEY not configured" };

  const res = await fetch("https://api.hlag.com/hlag/auth/oauth/anonymous/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${apiKey}`,
  });
  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: customKey ? "custom key" : "env secret" };
}

async function testFirecrawl(customKey?: string): Promise<{ success: boolean; error?: string; details?: string }> {
  const key = customKey || Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return { success: false, error: "FIRECRAWL_API_KEY not configured" };

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ url: "https://example.com", formats: ["markdown"], onlyMainContent: true }),
  });
  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    return { success: false, error: `HTTP ${res.status}`, details: body.slice(0, 200) };
  }
  await res.text();
  return { success: true, details: `HTTP ${res.status}${customKey ? " – custom key" : ""}` };
}

const testers: Record<string, (customKey?: string) => Promise<{ success: boolean; error?: string; details?: string }>> = {
  gemini: testGemini,
  anthropic: testAnthropic,
  resend: testResend,
  leadcomex: testLeadcomex,
  jsoncargo: testJsoncargo,
  flightradar24: testFlightradar,
  hapag: testHapag,
  firecrawl: testFirecrawl,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiName, customKey } = await req.json();
    const tester = testers[apiName];
    if (!tester) {
      return new Response(JSON.stringify({ success: false, error: `Unknown API: ${apiName}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const start = Date.now();
    const result = await tester(customKey || undefined);
    const responseTimeMs = Date.now() - start;

    return new Response(JSON.stringify({ ...result, responseTimeMs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});