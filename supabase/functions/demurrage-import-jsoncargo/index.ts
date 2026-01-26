import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  MBL_PREFIX_MAP, 
  normalizeShippingLine, 
  detectCarrierFromMbl as detectCarrier,
  isKnownCarrierMbl,
  type ShippingLineCode
} from "../_shared/shippingLineMapping.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRequest {
  mbls: string[];
  shipping_line: string;
  organization_id: string;
  cliente?: string;
}

interface ContainerData {
  numero: string;
  tipo_conteiner: string;
  status: string;
  is_valid_format: boolean;
  raw_number?: string;
}

interface ShipmentData {
  mbl: string;
  armador: string;
  porto_origem: string | null;
  porto_destino: string | null;
  expected_pod: string | null;
  data_atracacao: string | null;
  containers: ContainerData[];
  raw_data: any;
}

// Usar mapeamento centralizado para detectar armador do MBL
function detectCarrierFromMbl(mbl: string): string[] {
  const info = detectCarrier(mbl);
  if (info.code === 'UNKNOWN') return [];
  return [info.code];
}

function isValidContainerNumber(num: string): boolean {
  if (!num) return false;
  const pattern = /^[A-Z]{4}[0-9]{7}$/;
  return pattern.test(num.toUpperCase().trim());
}

function detectContainerType(containerType: string | null): string {
  if (!containerType) return 'DRY';
  const upper = containerType.toUpperCase();
  if (upper.includes('REEF') || upper.includes('RF') || upper.includes('REFRIGER')) return 'REEFER';
  if (upper.includes('TANK')) return 'TANK';
  if (upper.includes('FLAT') || upper.includes('OPEN') || upper.includes('OT') || upper.includes('FR')) return 'SPECIAL';
  return 'DRY';
}

function parseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/)) {
      return dateStr.split(' ')[0];
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  } catch { /* ignore */ }
  return null;
}

function translateApiError(error: string, mbl: string, carrier: string): string {
  if (error.includes('No Associated Containers Found')) {
    return `MBL não encontrado com armador ${carrier}. Verifique se o armador está correto.`;
  }
  if (error.includes('Bill of Lading could not be matched')) {
    return `B/L não encontrado para ${carrier}. Tente outro armador.`;
  }
  if (error.includes('404')) return 'MBL não encontrado na base de dados';
  if (error.includes('400')) return 'Erro na requisição - verifique o formato do MBL';
  if (error.includes('401') || error.includes('403')) return 'Erro de autenticação na API';
  if (error.includes('500')) return 'Erro interno da API JSONCARGO';
  return error;
}

async function fetchMblFromApi(
  mbl: string, 
  carrier: string, 
  apiKey: string
): Promise<{ success: boolean; data?: any; error?: string; carrier_used: string }> {
  const apiUrl = `http://api.jsoncargo.com/api/v1/containers/bol/${encodeURIComponent(mbl)}?shipping_line=${carrier}`;
  
  console.log(`[IMPORT-JSONCARGO] Fetching: ${apiUrl}`);
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `${response.status} - ${errorText}`, carrier_used: carrier };
  }

  const data = await response.json();
  return { success: true, data: data.data, carrier_used: carrier };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const JSONCARGO_API_KEY = Deno.env.get("JSONCARGO_API_KEY");
  
  if (!JSONCARGO_API_KEY) {
    return new Response(
      JSON.stringify({ error: "JSONCARGO_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: ImportRequest = await req.json();
    const { mbls, shipping_line, organization_id, cliente } = body;

    if (!mbls || mbls.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum MBL informado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!shipping_line) {
      return new Response(
        JSON.stringify({ error: "Armador é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "ID da organização é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const primaryCarrier = normalizeShippingLine(shipping_line);
    console.log(`[IMPORT-JSONCARGO] Processing ${mbls.length} MBLs for carrier: ${primaryCarrier}`);

    const results: ShipmentData[] = [];
    const errors: { mbl: string; error: string; carrier_tried: string; suggestion?: string }[] = [];

    for (const mbl of mbls) {
      const cleanMbl = mbl.trim();
      if (!cleanMbl) continue;

      try {
        const detectedCarriers = detectCarrierFromMbl(cleanMbl);
        const carriersToTry: string[] = [primaryCarrier];
        for (const detected of detectedCarriers) {
          if (!carriersToTry.includes(detected)) carriersToTry.push(detected);
        }
        
        let fetchResult: { success: boolean; data?: any; error?: string; carrier_used: string } | null = null;
        
        for (const carrier of carriersToTry) {
          fetchResult = await fetchMblFromApi(cleanMbl, carrier, JSONCARGO_API_KEY);
          if (fetchResult.success) break;
        }

        if (!fetchResult?.success || !fetchResult.data) {
          const suggestion = detectedCarriers.length > 0 && !detectedCarriers.includes(primaryCarrier)
            ? `Prefixo do MBL sugere armador: ${detectedCarriers.join(', ')}`
            : undefined;
          
          errors.push({ 
            mbl: cleanMbl, 
            error: translateApiError(fetchResult?.error || 'Erro desconhecido', cleanMbl, primaryCarrier),
            carrier_tried: carriersToTry.join(', '),
            suggestion
          });
          continue;
        }

        const bolData = fetchResult.data;
        const containers: ContainerData[] = [];
        
        if (bolData.associated_containers && Array.isArray(bolData.associated_containers)) {
          for (const container of bolData.associated_containers) {
            const rawNum = container.container_number || container;
            const num = String(rawNum).toUpperCase().trim();
            containers.push({
              numero: num,
              tipo_conteiner: detectContainerType(container.container_type || bolData.container_type),
              status: container.container_status || bolData.container_status || 'IN_TRANSIT',
              is_valid_format: isValidContainerNumber(num),
              raw_number: rawNum
            });
          }
        } else if (bolData.associated_container_numbers && Array.isArray(bolData.associated_container_numbers)) {
          for (const containerNum of bolData.associated_container_numbers) {
            const num = String(containerNum).toUpperCase().trim();
            containers.push({
              numero: num,
              tipo_conteiner: detectContainerType(bolData.container_type),
              status: bolData.container_status || 'IN_TRANSIT',
              is_valid_format: isValidContainerNumber(num),
              raw_number: containerNum
            });
          }
        } else if (bolData.container_number) {
          const num = String(bolData.container_number).toUpperCase().trim();
          containers.push({
            numero: num,
            tipo_conteiner: detectContainerType(bolData.container_type),
            status: bolData.container_status || 'IN_TRANSIT',
            is_valid_format: isValidContainerNumber(num),
            raw_number: bolData.container_number
          });
        }

        const shipmentData: ShipmentData = {
          mbl: bolData.bill_of_lading || cleanMbl,
          armador: bolData.shipping_line_name || shipping_line,
          porto_origem: bolData.shipped_from || null,
          porto_destino: bolData.shipped_to || null,
          expected_pod: bolData.shipped_to || null,
          data_atracacao: parseDate(bolData.eta_final_destination) || parseDate(bolData.atd_origin),
          containers,
          raw_data: bolData
        };

        results.push(shipmentData);
        console.log(`[IMPORT-JSONCARGO] Processed ${cleanMbl}: ${containers.length} containers found`);

      } catch (error) {
        console.error(`[IMPORT-JSONCARGO] Error processing ${cleanMbl}:`, error);
        errors.push({ 
          mbl: cleanMbl, 
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          carrier_tried: primaryCarrier
        });
      }
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        total_requested: mbls.length,
        total_found: results.length,
        total_errors: errors.length,
        shipments: results,
        errors,
        cliente_sugerido: cliente || null,
        carrier_used: primaryCarrier
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[IMPORT-JSONCARGO] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
