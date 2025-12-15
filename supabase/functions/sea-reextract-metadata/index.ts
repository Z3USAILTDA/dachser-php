import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract container from filename - multiple patterns
function extractContainerFromFilename(fileName: string): string | null {
  if (!fileName) return null;
  
  // Pattern 1: Standard container format XXXX1234567
  const standardMatch = fileName.match(/\b([A-Z]{4}\d{7})\b/i);
  if (standardMatch) return standardMatch[1].toUpperCase();
  
  // Pattern 2: Container with spaces or dashes XXXX-123-4567 or XXXX 1234567
  const spacedMatch = fileName.match(/\b([A-Z]{4})[\s\-]?(\d{3})[\s\-]?(\d{4})\b/i);
  if (spacedMatch) return (spacedMatch[1] + spacedMatch[2] + spacedMatch[3]).toUpperCase();
  
  // Pattern 3: At start of filename
  const startMatch = fileName.match(/^([A-Z]{4}\d{7})/i);
  if (startMatch) return startMatch[1].toUpperCase();
  
  return null;
}

// Extract consignee from filename - common patterns
function extractConsigneeFromFilename(fileName: string): string | null {
  if (!fileName) return null;
  
  const lowerName = fileName.toLowerCase();
  
  // Common consignee patterns in filenames
  const consigneePatterns = [
    /consignee[_\-\s]*([a-z0-9_\-\s]+)/i,
    /consig[_\-\s]*([a-z0-9_\-\s]+)/i,
    /para[_\-\s]*([a-z0-9_\-\s]+)/i,
    /dest[_\-\s]*([a-z0-9_\-\s]+)/i,
  ];
  
  for (const pattern of consigneePatterns) {
    const match = fileName.match(pattern);
    if (match && match[1]) {
      // Clean up the match
      const cleaned = match[1].trim().replace(/[_\-]/g, ' ').replace(/\s+/g, ' ');
      if (cleaned.length > 2) return cleaned;
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let dbClient: Client | null = null;
  
  try {
    const body = await req.json();
    const { itemId, forceAll } = body;

    // Connect to MariaDB
    const dbHost = Deno.env.get('MARIADB_HOST') ?? '';
    const dbPort = parseInt(Deno.env.get('MARIADB_PORT') ?? '3306');
    const dbUser = Deno.env.get('MARIADB_USER') ?? '';
    const dbPassword = Deno.env.get('MARIADB_PASSWORD') ?? '';
    
    dbClient = await new Client().connect({
      hostname: dbHost,
      port: dbPort,
      username: dbUser,
      password: dbPassword,
      db: 'ai_agente',
    });

    console.log('[REEXTRACT] Connected to MariaDB');

    let itemIds: number[] = [];

    if (itemId) {
      itemIds = [parseInt(itemId)];
      console.log(`[REEXTRACT] Processing single item: ${itemId}`);
    } else if (forceAll) {
      // Get ALL items with missing container OR missing consignee
      const result = await dbClient.query(`
        SELECT i.id 
        FROM ai_agente.t_dachser_sea_items i
        WHERE i.active = 1 
          AND (i.container IS NULL OR i.container = '' OR i.consignee IS NULL OR i.consignee = '')
        ORDER BY i.id DESC
      `);
      
      itemIds = (result || []).map((row: any) => row.id);
      console.log(`[REEXTRACT] Found ${itemIds.length} items with missing metadata`);
    } else {
      return new Response(
        JSON.stringify({ error: 'Either itemId or forceAll must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (itemIds.length === 0) {
      await dbClient.close();
      return new Response(
        JSON.stringify({ success: true, message: 'No items need processing', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[REEXTRACT] Starting processing of ${itemIds.length} items`);

    let processed = 0;
    let updatedContainer = 0;
    let updatedConsignee = 0;
    
    // Process each item one by one
    for (const id of itemIds) {
      try {
        // Get item details with file info
        const itemResult = await dbClient.query(`
          SELECT 
            i.id, 
            i.arquivo_label,
            i.container,
            i.consignee,
            f.filename as file_filename
          FROM ai_agente.t_dachser_sea_items i
          LEFT JOIN ai_agente.t_dachser_sea_files f ON f.id = i.arquivo_id
          WHERE i.id = ?
        `, [id]);
        
        if (!itemResult || itemResult.length === 0) {
          console.log(`[REEXTRACT] Item ${id} not found`);
          continue;
        }
        
        const item = itemResult[0];
        const fileName = item.arquivo_label || item.file_filename || '';
        
        console.log(`[REEXTRACT] Processing item ${id}: "${fileName}"`);
        
        const updates: string[] = [];
        const values: any[] = [];
        
        // Try to extract container if missing
        if (!item.container || item.container === '') {
          const container = extractContainerFromFilename(fileName);
          if (container) {
            updates.push('container = ?');
            values.push(container);
            updatedContainer++;
            console.log(`[REEXTRACT] Extracted container: ${container}`);
          }
        }
        
        // Try to extract consignee if missing
        if (!item.consignee || item.consignee === '') {
          const consignee = extractConsigneeFromFilename(fileName);
          if (consignee) {
            updates.push('consignee = ?');
            values.push(consignee);
            updatedConsignee++;
            console.log(`[REEXTRACT] Extracted consignee: ${consignee}`);
          }
        }
        
        // Update if we have something to update
        if (updates.length > 0) {
          values.push(id);
          await dbClient.execute(`
            UPDATE ai_agente.t_dachser_sea_items 
            SET ${updates.join(', ')}
            WHERE id = ?
          `, values);
          console.log(`[REEXTRACT] Updated item ${id}`);
        } else {
          console.log(`[REEXTRACT] No metadata extracted for item ${id} from filename: "${fileName}"`);
        }
        
        processed++;
        
      } catch (itemError: any) {
        console.error(`[REEXTRACT] Error processing item ${id}:`, itemError.message);
      }
    }

    await dbClient.close();

    const message = `Processed ${processed} items. Updated ${updatedContainer} containers, ${updatedConsignee} consignees.`;
    console.log(`[REEXTRACT] ${message}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed,
        updatedContainer,
        updatedConsignee,
        message
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[REEXTRACT] Error:', error);
    if (dbClient) {
      try { await dbClient.close(); } catch {}
    }
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
