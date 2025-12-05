import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const client = await new Client().connect({
    hostname: Deno.env.get('MARIADB_HOST')!,
    port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
    username: Deno.env.get('MARIADB_USER')!,
    password: Deno.env.get('MARIADB_PASSWORD')!,
    db: Deno.env.get('MARIADB_DATABASE')!,
  });

  try {
    console.log("Receiving file upload...");
    
    // Parse the form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'Nenhum arquivo enviado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing file: ${file.name}, size: ${file.size}`);

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Parse Excel file
    const workbook = XLSX.read(data, { type: 'array' });
    console.log(`Workbook sheets: ${workbook.SheetNames.join(', ')}`);

    const version = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    const effectiveDate = new Date().toISOString().split('T')[0];
    
    let klabinCount = 0;
    let zfCount = 0;

    // Process KLABIN sheet
    const klabinSheetName = workbook.SheetNames.find((name: string) => 
      name.toLowerCase().includes('klabin')
    );
    
    if (klabinSheetName) {
      console.log(`Processing KLABIN sheet: ${klabinSheetName}`);
      const klabinSheet = workbook.Sheets[klabinSheetName];
      const klabinData = XLSX.utils.sheet_to_json(klabinSheet, { defval: '' }) as any[];
      
      if (klabinData.length > 0) {
        // Deactivate previous KLABIN matrix
        await client.execute(
          `UPDATE ai_agente.t_rule_matrix_awb 
           SET is_active = 0 
           WHERE customer = 'KLABIN' AND is_active = 1`
        );

        // Create new KLABIN matrix
        const klabinMatrixResult = await client.execute(
          `INSERT INTO ai_agente.t_rule_matrix_awb 
           (customer, version, effective_date, is_active) 
           VALUES ('KLABIN', ?, ?, 1)`,
          [version, effectiveDate]
        );
        const klabinMatrixId = klabinMatrixResult.lastInsertId;
        console.log(`Created KLABIN matrix with ID: ${klabinMatrixId}`);

        // Insert KLABIN rules
        for (const row of klabinData) {
          // Try different column name variations
          const cnpj = String(row['CNPJ'] || row['cnpj'] || row['Cnpj'] || '').replace(/\D/g, '');
          const airportCode = String(row['Aeroporto'] || row['aeroporto'] || row['AEROPORTO'] || row['Airport'] || '').toUpperCase().trim();
          const emailDespachante = String(row['Email Despachante'] || row['email_despachante'] || row['Email'] || row['email'] || '').trim();
          const endereco = String(row['Endereço'] || row['endereco'] || row['Endereco'] || row['Address'] || '').trim();
          const cidade = String(row['Cidade/Estado'] || row['cidade_estado'] || row['Cidade'] || '').trim();
          const cep = String(row['CEP'] || row['cep'] || '').trim();
          const empresa = String(row['Empresa'] || row['empresa'] || row['Company'] || '').trim();
          const ref = String(row['Ref'] || row['ref'] || row['REF'] || '').trim();
          
          // Build notes from available fields
          const notes = [ref, empresa].filter(Boolean).join(' | ');
          const enderecoCompleto = [endereco, cidade, cep].filter(Boolean).join(', ');

          if (cnpj) {
            await client.execute(
              `INSERT INTO ai_agente.t_rule_row_awb 
               (matrix_id, cnpj, airport_code, email_despachante, address_pattern, is_active) 
               VALUES (?, ?, ?, ?, ?, 1)`,
              [klabinMatrixId, cnpj, airportCode || null, emailDespachante || null, enderecoCompleto || null]
            );
            klabinCount++;
          }
        }
        console.log(`Inserted ${klabinCount} KLABIN rules`);
      }
    }

    // Process ZF sheet
    const zfSheetName = workbook.SheetNames.find((name: string) => 
      name.toLowerCase().includes('zf')
    );
    
    if (zfSheetName) {
      console.log(`Processing ZF sheet: ${zfSheetName}`);
      const zfSheet = workbook.Sheets[zfSheetName];
      const zfData = XLSX.utils.sheet_to_json(zfSheet, { defval: '' }) as any[];
      
      if (zfData.length > 0) {
        // Deactivate previous ZF matrix
        await client.execute(
          `UPDATE ai_agente.t_rule_matrix_awb 
           SET is_active = 0 
           WHERE customer = 'ZF' AND is_active = 1`
        );

        // Create new ZF matrix
        const zfMatrixResult = await client.execute(
          `INSERT INTO ai_agente.t_rule_matrix_awb 
           (customer, version, effective_date, is_active) 
           VALUES ('ZF', ?, ?, 1)`,
          [version, effectiveDate]
        );
        const zfMatrixId = zfMatrixResult.lastInsertId;
        console.log(`Created ZF matrix with ID: ${zfMatrixId}`);

        // Insert ZF rules
        for (const row of zfData) {
          const cnpj = String(row['CNPJ'] || row['cnpj'] || row['Cnpj'] || '').replace(/\D/g, '');
          const endereco = String(row['Endereço'] || row['endereco'] || row['Endereco'] || row['Address'] || '').trim();
          const cidade = String(row['Cidade/Estado'] || row['cidade_estado'] || row['Cidade'] || '').trim();
          const cep = String(row['CEP'] || row['cep'] || '').trim();
          const empresa = String(row['Empresa'] || row['empresa'] || row['Company'] || '').trim();
          const ref = String(row['Ref'] || row['ref'] || row['REF'] || '').trim();
          
          const notes = [ref, empresa].filter(Boolean).join(' | ');
          const addressPattern = [endereco, cidade, cep].filter(Boolean).join(', ');

          if (cnpj) {
            await client.execute(
              `INSERT INTO ai_agente.t_rule_row_awb 
               (matrix_id, cnpj, airport_code, email_despachante, address_pattern, is_active) 
               VALUES (?, ?, NULL, NULL, ?, 1)`,
              [zfMatrixId, cnpj, addressPattern || null]
            );
            zfCount++;
          }
        }
        console.log(`Inserted ${zfCount} ZF rules`);
      }
    }

    await client.close();

    const message = `Matriz importada com sucesso! KLABIN: ${klabinCount} regras, ZF: ${zfCount} regras.`;
    console.log(message);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message,
        klabinCount,
        zfCount,
        version
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Import error:", error);
    await client.close();
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao importar matriz', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
