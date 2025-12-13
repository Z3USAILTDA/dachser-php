import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedFile {
  name: string;
  url: string;
  classification: 'hbl' | 'invoice' | 'other';
  size: number;
}

// Classify file by name
function classifyFileName(name: string): 'hbl' | 'invoice' | 'other' {
  const lowerName = name.toLowerCase();
  
  const hblIndicators = ['hbl', 'hb/l', 'hb-l', 'house bill', 'house-bill'];
  const draftIndicators = ['draft', 'rascunho', 'prealert', 'pre-alerta', 'prealerta'];
  const invoiceIndicators = ['invoice', 'fatura', 'nota', 'proforma', 'pro forma', 'inv'];
  
  const hasHbl = hblIndicators.some(ind => lowerName.includes(ind));
  const hasDraft = draftIndicators.some(ind => lowerName.includes(ind));
  const hasInvoice = invoiceIndicators.some(ind => lowerName.includes(ind));
  
  // Invoice has priority
  if (hasInvoice) return 'invoice';
  
  // HBL indicators with optional draft
  if (hasHbl && (hasDraft || !hasInvoice)) return 'hbl';
  
  // Spreadsheets are classified as invoices
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
    return 'invoice';
  }
  
  return 'other';
}

// Check if file extension is accepted
function isAcceptedFile(fileName: string): boolean {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  return ['pdf', 'xlsx', 'xls', 'csv'].includes(ext);
}

// Extract files from ZIP
async function extractFromZip(fileContent: Uint8Array, supabase: any): Promise<ExtractedFile[]> {
  console.log('📦 Starting ZIP extraction...');
  const extractedFiles: ExtractedFile[] = [];
  
  try {
    const reader = new zip.ZipReader(new zip.Uint8ArrayReader(fileContent));
    const entries = await reader.getEntries();
    
    console.log(`📦 Found ${entries.length} entries in ZIP`);
    
    for (const entry of entries) {
      // Skip directories
      if (entry.directory) continue;
      
      // Get filename (handle nested paths)
      const fileName = entry.filename.split('/').pop() || entry.filename;
      
      // Skip if not accepted file type
      if (!isAcceptedFile(fileName)) {
        console.log(`⏭️ Skipping non-accepted file: ${fileName}`);
        continue;
      }
      
      try {
        const writer = new zip.Uint8ArrayWriter();
        const data = await entry.getData!(writer);
        
        // Skip empty files
        if (!data || data.length === 0) {
          console.log(`⏭️ Skipping empty file: ${fileName}`);
          continue;
        }
        
        console.log(`📄 Extracted: ${fileName} (${data.length} bytes)`);
        
        // Upload to storage
        const storagePath = `extracted-files/${Date.now()}_${fileName}`;
        const blob = new Blob([data.slice().buffer], { type: 'application/octet-stream' });
        
        const { error: uploadError } = await supabase.storage
          .from('maritime-files')
          .upload(storagePath, blob, { contentType: 'application/octet-stream' });
        
        if (uploadError) {
          console.error(`❌ Upload error for ${fileName}:`, uploadError);
          continue;
        }
        
        const { data: { publicUrl } } = supabase.storage
          .from('maritime-files')
          .getPublicUrl(storagePath);
        
        extractedFiles.push({
          name: fileName,
          url: publicUrl,
          classification: classifyFileName(fileName),
          size: data.length
        });
        
        console.log(`✅ Uploaded: ${fileName} → ${storagePath}`);
      } catch (entryError) {
        console.error(`❌ Error processing entry ${fileName}:`, entryError);
      }
    }
    
    await reader.close();
    console.log(`📦 ZIP extraction complete: ${extractedFiles.length} files`);
    
  } catch (error) {
    console.error('❌ ZIP extraction error:', error);
  }
  
  return extractedFiles;
}

// Extract attachments from EML
async function extractFromEml(fileContent: string, supabase: any): Promise<ExtractedFile[]> {
  console.log('📧 Starting EML extraction...');
  const extractedFiles: ExtractedFile[] = [];
  
  try {
    // Find MIME boundaries
    const boundaryMatch = fileContent.match(/boundary[=:][\s]*["']?([^"'\r\n;]+)/gi);
    const boundaries: string[] = [];
    
    if (boundaryMatch) {
      for (const match of boundaryMatch) {
        const b = match.replace(/boundary[=:][\s]*["']?/i, '').replace(/["']/g, '').trim();
        if (b) boundaries.push(b);
      }
    }
    
    console.log(`📧 Found ${boundaries.length} MIME boundaries`);
    
    // Find PDF attachments by multiple patterns
    const attachmentPatterns = [
      /Content-Disposition:\s*attachment[^]*?filename[=*]*["']?([^"'\r\n;]+\.pdf)["']?/gi,
      /Content-Type:\s*application\/pdf[^]*?name[=*]*["']?([^"'\r\n;]+\.pdf)["']?/gi,
      /Content-Type:\s*application\/octet-stream[^]*?filename[=*]*["']?([^"'\r\n;]+\.pdf)["']?/gi,
      /name[=*]*["']?([^"'\r\n;]+\.pdf)["']?/gi
    ];
    
    const foundAttachments: { name: string; pos: number }[] = [];
    
    for (const pattern of attachmentPatterns) {
      let match;
      while ((match = pattern.exec(fileContent)) !== null) {
        const name = match[1].replace(/.*[\/\\]/, '').trim();
        if (name && !foundAttachments.some(a => a.name === name)) {
          foundAttachments.push({ name, pos: match.index });
        }
      }
    }
    
    console.log(`📧 Found ${foundAttachments.length} potential PDF attachments`);
    
    // Extract each attachment
    for (const attachment of foundAttachments) {
      try {
        // Find the base64 content after the header
        const afterHeader = fileContent.substring(attachment.pos);
        
        // Look for Content-Transfer-Encoding: base64
        const encodingMatch = afterHeader.match(/Content-Transfer-Encoding:\s*base64/i);
        if (!encodingMatch) {
          console.log(`⏭️ No base64 encoding found for ${attachment.name}`);
          continue;
        }
        
        // Find the start of base64 content (after blank line)
        const headerEnd = afterHeader.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        
        let base64Start = headerEnd + 4;
        let base64Content = afterHeader.substring(base64Start);
        
        // Find the end (next boundary or next header)
        let base64End = base64Content.length;
        for (const boundary of boundaries) {
          const boundaryPos = base64Content.indexOf('--' + boundary);
          if (boundaryPos !== -1 && boundaryPos < base64End) {
            base64End = boundaryPos;
          }
        }
        
        // Also check for next Content header
        const nextContentPos = base64Content.search(/\r\nContent-/i);
        if (nextContentPos !== -1 && nextContentPos < base64End) {
          base64End = nextContentPos;
        }
        
        base64Content = base64Content.substring(0, base64End)
          .replace(/[\r\n\s]/g, '')
          .trim();
        
        if (base64Content.length < 100) {
          console.log(`⏭️ Base64 content too short for ${attachment.name}`);
          continue;
        }
        
        console.log(`📄 Decoding ${attachment.name}: ${base64Content.length} chars base64`);
        
        // Decode base64
        try {
          const binaryString = atob(base64Content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Validate PDF header
          const header = String.fromCharCode(...bytes.slice(0, 5));
          if (!header.startsWith('%PDF')) {
            console.log(`⚠️ Invalid PDF header for ${attachment.name}: ${header}`);
            continue;
          }
          
          // Upload to storage
          const storagePath = `extracted-files/${Date.now()}_${attachment.name}`;
          const blob = new Blob([bytes], { type: 'application/pdf' });
          
          const { error: uploadError } = await supabase.storage
            .from('maritime-files')
            .upload(storagePath, blob, { contentType: 'application/pdf' });
          
          if (uploadError) {
            console.error(`❌ Upload error for ${attachment.name}:`, uploadError);
            continue;
          }
          
          const { data: { publicUrl } } = supabase.storage
            .from('maritime-files')
            .getPublicUrl(storagePath);
          
          extractedFiles.push({
            name: attachment.name,
            url: publicUrl,
            classification: classifyFileName(attachment.name),
            size: bytes.length
          });
          
          console.log(`✅ Uploaded: ${attachment.name} (${bytes.length} bytes)`);
        } catch (decodeError) {
          console.error(`❌ Decode error for ${attachment.name}:`, decodeError);
        }
      } catch (attachmentError) {
        console.error(`❌ Error processing attachment ${attachment.name}:`, attachmentError);
      }
    }
    
    // Fallback: if no attachments found, search for raw base64 blocks
    if (extractedFiles.length === 0) {
      console.log('📧 Fallback: searching for raw base64 PDF blocks...');
      
      const base64Blocks = fileContent.match(/[A-Za-z0-9+/]{1000,}={0,2}/g) || [];
      
      let fallbackCount = 0;
      for (const block of base64Blocks) {
        if (fallbackCount >= 5) break; // Limit fallback extractions
        
        try {
          const cleanBlock = block.replace(/[\r\n\s]/g, '');
          const binaryString = atob(cleanBlock);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          const header = String.fromCharCode(...bytes.slice(0, 5));
          if (!header.startsWith('%PDF')) continue;
          
          const fileName = `attachment-${fallbackCount + 1}.pdf`;
          const storagePath = `extracted-files/${Date.now()}_${fileName}`;
          const blob = new Blob([bytes], { type: 'application/pdf' });
          
          const { error: uploadError } = await supabase.storage
            .from('maritime-files')
            .upload(storagePath, blob, { contentType: 'application/pdf' });
          
          if (uploadError) continue;
          
          const { data: { publicUrl } } = supabase.storage
            .from('maritime-files')
            .getPublicUrl(storagePath);
          
          extractedFiles.push({
            name: fileName,
            url: publicUrl,
            classification: 'other',
            size: bytes.length
          });
          
          console.log(`✅ Fallback extracted: ${fileName} (${bytes.length} bytes)`);
          fallbackCount++;
        } catch (e) {
          // Ignore decode errors in fallback
        }
      }
    }
    
    console.log(`📧 EML extraction complete: ${extractedFiles.length} files`);
    
  } catch (error) {
    console.error('❌ EML extraction error:', error);
  }
  
  return extractedFiles;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`📥 Received file: ${file.name} (${file.size} bytes, type: ${file.type})`);
    
    const fileName = file.name.toLowerCase();
    let extractedFiles: ExtractedFile[] = [];
    
    if (fileName.endsWith('.zip')) {
      // Extract from ZIP
      const arrayBuffer = await file.arrayBuffer();
      extractedFiles = await extractFromZip(new Uint8Array(arrayBuffer), supabase);
    } else if (fileName.endsWith('.eml')) {
      // Extract from EML
      const textContent = await file.text();
      extractedFiles = await extractFromEml(textContent, supabase);
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Only .zip and .eml files are supported' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Filter out files smaller than 100 bytes (likely corrupted)
    extractedFiles = extractedFiles.filter(f => f.size >= 100);
    
    console.log(`✅ Extraction complete: ${extractedFiles.length} valid files`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        extracted: extractedFiles,
        source: file.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('🔴 Extraction error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
