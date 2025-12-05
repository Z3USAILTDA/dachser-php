import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to find column value by checking multiple possible names
function getColumnValue(row: any, possibleNames: string[]): string {
  for (const name of possibleNames) {
    // Check exact match
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return String(row[name]);
    }
    // Check case-insensitive match
    const keys = Object.keys(row);
    for (const key of keys) {
      if (key.toLowerCase().trim() === name.toLowerCase().trim()) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
          return String(row[key]);
        }
      }
      // Check if key contains the name
      if (key.toLowerCase().includes(name.toLowerCase())) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
          return String(row[key]);
        }
      }
    }
  }
  return '';
}

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
    
    // Parse Excel file with raw option to preserve all data
    const workbook = XLSX.read(data, { type: 'array', raw: false });
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
      const klabinData = XLSX.utils.sheet_to_json(klabinSheet, { defval: '', raw: false }) as any[];
      
      // Log first row to see column names
      if (klabinData.length > 0) {
        console.log(`KLABIN columns found: ${Object.keys(klabinData[0]).join(', ')}`);
        console.log(`KLABIN first row sample: ${JSON.stringify(klabinData[0])}`);
      }
      
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
          const cnpjRaw = getColumnValue(row, ['CNPJ', 'cnpj', 'Cnpj']);
          const cnpj = cnpjRaw.replace(/\D/g, '');
          const airportCode = getColumnValue(row, ['Aeroporto', 'aeroporto', 'AEROPORTO', 'Airport', 'airport', 'IATA', 'iata']).toUpperCase().trim();
          const emailDespachante = getColumnValue(row, ['Email Despachante', 'email_despachante', 'Email', 'email', 'E-mail', 'Despachante']).trim();
          const endereco = getColumnValue(row, ['Endereço', 'endereco', 'Endereco', 'Address', 'Rua', 'Logradouro']).trim();
          const cidadeEstado = getColumnValue(row, ['Cidade / Estado', 'Cidade/Estado', 'cidade_estado', 'Cidade', 'cidade', 'City']).trim();
          const cep = getColumnValue(row, ['CEP', 'cep', 'Zip', 'Codigo Postal']).trim();
          const empresa = getColumnValue(row, ['Empresa', 'empresa', 'Company', 'Razão Social', 'Nome']).trim();
          const refOthello = getColumnValue(row, ['Ref Othello', 'ref_othello', 'Ref', 'ref', 'REF', 'Referência']).trim();
          const pais = getColumnValue(row, ['País', 'pais', 'Pais', 'Country']).trim();
          
          // Parse cidade and estado from "Cidade / Estado" field
          let cidade = '';
          let estado = '';
          if (cidadeEstado.includes('–') || cidadeEstado.includes('-')) {
            const parts = cidadeEstado.split(/[–-]/).map(p => p.trim());
            cidade = parts[0] || '';
            estado = parts[1] || '';
          } else {
            cidade = cidadeEstado;
          }
          
          // Build address_pattern from full address
          const addressPattern = [endereco, cidade, estado, cep, pais].filter(Boolean).join(', ');

          if (cnpj) {
            await client.execute(
              `INSERT INTO ai_agente.t_rule_row_awb 
               (matrix_id, cnpj, airport_code, email_despachante, address_pattern, is_active, ref_othello, empresa, endereco, cidade, estado, cep, pais) 
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
              [klabinMatrixId, cnpj, airportCode || null, emailDespachante || null, addressPattern || null, 
               refOthello || null, empresa || null, endereco || null, cidade || null, estado || null, cep || null, pais || null]
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
      const zfData = XLSX.utils.sheet_to_json(zfSheet, { defval: '', raw: false }) as any[];
      
      // Log first row to see column names
      if (zfData.length > 0) {
        console.log(`ZF columns found: ${Object.keys(zfData[0]).join(', ')}`);
        console.log(`ZF first row sample: ${JSON.stringify(zfData[0])}`);
      }
      
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
          const cnpjRaw = getColumnValue(row, ['CNPJ', 'cnpj', 'Cnpj']);
          const cnpj = cnpjRaw.replace(/\D/g, '');
          const endereco = getColumnValue(row, ['Endereço', 'endereco', 'Endereco', 'Address', 'Rua', 'Logradouro']).trim();
          const cidadeEstado = getColumnValue(row, ['Cidade / Estado', 'Cidade/Estado', 'cidade_estado', 'Cidade', 'cidade', 'City']).trim();
          const cep = getColumnValue(row, ['CEP', 'cep', 'Zip', 'Codigo Postal']).trim();
          const empresa = getColumnValue(row, ['Empresa', 'empresa', 'Company', 'Razão Social', 'Nome']).trim();
          const refOthello = getColumnValue(row, ['Ref Othello', 'ref_othello', 'Ref', 'ref', 'REF', 'Referência']).trim();
          const pais = getColumnValue(row, ['País', 'pais', 'Pais', 'Country']).trim();
          
          // Parse cidade and estado from "Cidade / Estado" field
          let cidade = '';
          let estado = '';
          if (cidadeEstado.includes('–') || cidadeEstado.includes('-')) {
            const parts = cidadeEstado.split(/[–-]/).map(p => p.trim());
            cidade = parts[0] || '';
            estado = parts[1] || '';
          } else {
            cidade = cidadeEstado;
          }
          
          const addressPattern = [endereco, cidade, estado, cep, pais].filter(Boolean).join(', ');

          if (cnpj) {
            await client.execute(
              `INSERT INTO ai_agente.t_rule_row_awb 
               (matrix_id, cnpj, airport_code, email_despachante, address_pattern, is_active, ref_othello, empresa, endereco, cidade, estado, cep, pais) 
               VALUES (?, ?, NULL, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
              [zfMatrixId, cnpj, addressPattern || null, 
               refOthello || null, empresa || null, endereco || null, cidade || null, estado || null, cep || null, pais || null]
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
