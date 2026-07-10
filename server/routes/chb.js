/**
 * server/routes/chb.js
 * Rotas do módulo CHB: /api/chb/*
 * Pool: MARIADB_OPS_* — database: dados_dachser
 */
import { getPoolFor, queryWithRetry } from '../db/pools.js';
import { randomUUID } from 'crypto';

// ─── Pool ─────────────────────────────────────────────────────────────────────
const opsQuery = (sql, params = []) => queryWithRetry(sql, params, 1, 'ops');

// ─── Helpers internos ─────────────────────────────────────────────────────────

function parseMaybeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeChbConfig(row) {
  if (!row) return null;
  return {
    ...row,
    campos_obrigatorios: parseMaybeJson(row.campos_obrigatorios, []),
    regras_comparacao:   parseMaybeJson(row.regras_comparacao, {}),
  };
}

function getUserIdFromBody(body) {
  const userId = body?.userId ?? body?.user_id ?? null;
  return userId ? Number(userId) : null;
}

let chbFilesBlobColumnReady = false;
async function ensureChbFilesBlobColumn() {
  if (chbFilesBlobColumnReady) return;
  try {
    await opsQuery(`ALTER TABLE dados_dachser.t_chb_files ADD COLUMN IF NOT EXISTS file_content LONGBLOB NULL`);
    await opsQuery(`ALTER TABLE dados_dachser.t_chb_files MODIFY COLUMN file_content LONGBLOB NULL`);
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (!msg.includes('duplicate') && !msg.includes('exists')) throw err;
  }
  chbFilesBlobColumnReady = true;
}

// ─── CHB AI helpers ───────────────────────────────────────────────────────────

async function callGemini(prompt, { model = process.env.CHB_GEMINI_MODEL || 'gemini-2.5-pro', maxTokens = 8000, temperature = 0.1 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada');

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini error ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

async function locateValueInFile(filename, fieldName, correctedValue, fileContent) {
  const prompt = `Você é um especialista em análise de documentos de comércio exterior.

TAREFA: Localizar onde o valor "${correctedValue}" aparece no arquivo "${filename}" para o campo "${fieldName}".

CONTEÚDO DO ARQUIVO:
${fileContent.substring(0, 50000)}

INSTRUÇÕES:
1. Procure o valor exato "${correctedValue}" no conteúdo
2. Se encontrar, identifique a localização (página, seção, tabela)
3. Extraia o contexto ao redor (texto antes e depois)
4. Avalie a confiança da localização

RETORNE APENAS JSON no formato:
{
  "found": true/false,
  "location": "Página X, seção Y" ou "Tabela de totais, coluna Z",
  "context": "...texto antes... [VALOR] ...texto depois...",
  "confidence": "alta" | "media" | "baixa"
}

Se não encontrar o valor exato, busque valores similares e indique com confidence "baixa".
Se o valor for numérico, considere formatações diferentes (97,3 vs 97.30 vs 97,30).`;

  try {
    const content = await callGemini(prompt, { model: process.env.CHB_GEMINI_MODEL || 'gemini-2.5-pro', maxTokens: 8000, temperature: 0.1 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        found:      parsed.found ?? false,
        location:   parsed.location || 'Não localizado',
        context:    parsed.context || '',
        confidence: parsed.confidence || 'baixa',
      };
    }
  } catch (err) {
    console.error('[chb] locateValueInFile error:', err.message);
  }
  return { found: false, location: 'Erro ao localizar', context: '', confidence: 'baixa' };
}

async function reextractFieldWithContext(filename, fieldName, correctedValue, fileContent) {
  const prompt = `TAREFA DE EXTRAÇÃO PRECISA - ANÁLISE PROFUNDA COM DETECÇÃO DE CÁLCULOS

Você é um especialista em documentos de comércio exterior (AWBs, Invoices, Packing Lists, CCTs, BLs).

OBJETIVO: Encontrar EXATAMENTE onde o valor "${correctedValue}" aparece para o campo "${fieldName}" no arquivo "${filename}".

CONTEÚDO COMPLETO DO DOCUMENTO (analisar com atenção):
${fileContent}

INSTRUÇÕES DETALHADAS:
1. Procure o valor "${correctedValue}" em TODO o documento
2. Considere variações de formatação (97,3 = 97.3 = 97,30)
3. Identifique o PADRÃO de extração
4. Identifique a LOCALIZAÇÃO exata (página, seção, tabela, linha)
5. Capture o CONTEXTO próximo (10-15 palavras antes e depois)

🔴 DETECÇÃO DE CÁLCULO (CRÍTICO):
6. VERIFIQUE se o valor "${correctedValue}" é o RESULTADO DE UM CÁLCULO de múltiplos itens.
   Se for uma soma/cálculo, IDENTIFIQUE A FÓRMULA EXATA.

RESPONDA EXATAMENTE no formato JSON:
{
  "found": true ou false,
  "location": "descrição precisa da localização",
  "pattern": "padrão para localizar o campo",
  "extractionHint": "dica para futuras extrações",
  "nearbyText": "texto próximo ao valor",
  "confidence": "alta" | "media" | "baixa",
  "isCalculated": true/false,
  "calculationFormula": "formula ou null",
  "processingInstruction": "instrução de processamento ou null"
}`;

  try {
    const content = await callGemini(prompt, { model: process.env.CHB_GEMINI_MODEL || 'gemini-2.5-pro', maxTokens: 16000, temperature: 0.1 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      return {
        success: true, found: p.found ?? false,
        location: p.location || '', pattern: p.pattern || '',
        extractionHint: p.extractionHint || '', nearbyText: p.nearbyText || '',
        confidence: p.confidence || 'baixa', isCalculated: p.isCalculated ?? false,
        calculationFormula: p.calculationFormula || null,
        processingInstruction: p.processingInstruction || null,
      };
    }
  } catch (err) {
    console.error('[chb] reextractFieldWithContext error:', err.message);
  }
  return { success: false, found: false, location: '', pattern: '', extractionHint: '', nearbyText: '', confidence: 'baixa', isCalculated: false, calculationFormula: null, processingInstruction: null };
}

function detectDocumentType(filename) {
  const n = (filename || '').toLowerCase();
  if (n.includes('cct') || n.includes('conhecimento')) return 'CCT';
  if (n.includes('hawb') || n.includes('house'))       return 'HAWB';
  if (n.includes('mawb') || n.includes('master'))      return 'MAWB';
  if (n.includes('invoice') || n.includes('fatura'))   return 'Invoice';
  if (n.includes('packing') || n.includes('romaneio')) return 'PackingList';
  if (n.includes('bl') || n.includes('bill'))          return 'BL';
  if (n.includes('ce') || n.includes('mercante'))      return 'CE_Mercante';
  if (n.includes('di') || n.includes('declaracao'))    return 'DI';
  return 'Outros';
}

async function saveExtractionRule(fieldName, documentType, pattern, extractionHint, exampleValue, processingInstruction) {
  try {
    const existing = await opsQuery(
      `SELECT id, times_used, success_rate, processing_instruction FROM dados_dachser.t_chb_extraction_rules WHERE field_name = ? AND document_type = ? LIMIT 1`,
      [fieldName, documentType]
    );
    if (existing && existing.length > 0) {
      const rule = existing[0];
      const newTimesUsed   = (Number(rule.times_used) || 0) + 1;
      const newSuccessRate = Math.min(100, ((Number(rule.success_rate) || 50) + 100) / 2);
      const effectiveInstruction = processingInstruction || rule.processing_instruction || null;
      await opsQuery(
        `UPDATE dados_dachser.t_chb_extraction_rules SET extraction_pattern=?, location_hint=?, example_value=?, times_used=?, success_rate=?, processing_instruction=?, updated_at=NOW() WHERE id=?`,
        [pattern, extractionHint, exampleValue, newTimesUsed, newSuccessRate, effectiveInstruction, rule.id]
      );
    } else {
      await opsQuery(
        `INSERT INTO dados_dachser.t_chb_extraction_rules (field_name, document_type, extraction_pattern, location_hint, example_value, times_used, success_rate, processing_instruction) VALUES (?, ?, ?, ?, ?, 1, 80.00, ?)`,
        [fieldName, documentType, pattern, extractionHint, exampleValue, processingInstruction || null]
      );
    }
  } catch (err) {
    console.error('[chb] saveExtractionRule error:', err.message);
  }
}

async function fetchDocContentFromDb(itemId, filename) {
  const buildContent = (rows) => {
    if (!rows || rows.length === 0) return null;
    const parts = rows.map(r => {
      const raw    = (r.raw_text || '').toString().trim();
      const fields = r.extracted_fields ? (typeof r.extracted_fields === 'string' ? r.extracted_fields : JSON.stringify(r.extracted_fields)) : '';
      return [r.filename ? `=== Documento: ${r.filename} ===` : '', raw, fields ? `--- Campos já extraídos ---\n${fields}` : ''].filter(Boolean).join('\n');
    }).filter(Boolean);
    const joined = parts.join('\n\n').trim();
    return joined.length > 0 ? joined : null;
  };

  let rows = await opsQuery(`SELECT filename, raw_text, extracted_fields FROM dados_dachser.t_chb_extracted_data WHERE item_id = ? AND filename = ? LIMIT 1`, [itemId, filename]);
  let content = buildContent(rows);
  if (content) return content;

  const tokens = (filename || '').replace(/\.[^.]+$/, '').split(/[\s_\-\.]+/).filter(t => t.length > 2).map(t => t.toLowerCase());
  if (tokens.length > 0) {
    const likeConditions = tokens.map(() => 'LOWER(filename) LIKE ?').join(' AND ');
    rows = await opsQuery(`SELECT filename, raw_text, extracted_fields FROM dados_dachser.t_chb_extracted_data WHERE item_id = ? AND (${likeConditions}) ORDER BY updated_at DESC LIMIT 1`, [itemId, ...tokens.map(t => `%${t}%`)]);
    content = buildContent(rows);
    if (content) return content;
  }

  rows = await opsQuery(`SELECT filename, raw_text, extracted_fields FROM dados_dachser.t_chb_extracted_data WHERE item_id = ? ORDER BY updated_at DESC`, [itemId]);
  return buildContent(rows);
}

function chbExtractHtmlAndTags(responseText, stepId) {
  const metadataMatch = responseText.match(/<<METADATA>>([\s\S]*?)<<END_METADATA>>/);
  const metadata = metadataMatch?.[1] || '';
  const modal   = (metadata.match(/MODAL:\s*(SEA|AIR)/i)?.[1] || 'SEA').toUpperCase();
  const cliente = (metadata.match(/CLIENTE:\s*([^\n]+)/i)?.[1] || '').trim();

  let html = (responseText.match(/<<BEGIN_HTML>>([\s\S]*?)<<END_HTML>>/)?.[1] || '').trim();
  if (!html) {
    const table   = responseText.match(/<table[\s\S]*?<\/table>/i)?.[0] || '';
    const obs     = responseText.match(/<div class="observations-section">[\s\S]*?<\/div>/i)?.[0] || '';
    const parecer = responseText.match(/<div class="parecer-section">[\s\S]*?<\/div>/i)?.[0] || '';
    const actions = responseText.match(/<div class="actions-section">[\s\S]*?<\/div>/i)?.[0] || '';
    html = [table, obs, parecer, actions].filter(Boolean).join('\n');
  }
  if (!html) html = `<p>${String(responseText || '').replace(/[<>]/g, '').slice(0, 8000)}</p>`;

  const criticalCount = (html.match(/🔴/g) || []).length;
  const warningCount  = (html.match(/🟨/g) || []).length;
  const okCount       = (html.match(/✅/g) || []).length;
  const tags = [];
  if (criticalCount > 0) tags.push({ type: 'danger',  label: `${criticalCount} crítico(s)` });
  if (warningCount > 0)  tags.push({ type: 'warning', label: `${warningCount} alerta(s)` });
  if (okCount > 0)       tags.push({ type: 'success', label: criticalCount || warningCount ? `${okCount} conforme(s)` : 'Documentos conformes' });

  const summary = criticalCount > 0
    ? `${criticalCount} divergência(s) crítica(s) encontrada(s)`
    : warningCount > 0
      ? `${warningCount} alerta(s) para verificação`
      : 'Documentos em conformidade';

  const stepNames = { 1: 'Pré-Alerta', 2: 'Instrução', 3: 'DI/Fechamento' };
  const parecer = (html.match(/<div class="parecer-section">([\s\S]*?)<\/div>/i)?.[1] || '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    html, tags, summary, parecer, modal, cliente,
    detailedSummary: `${stepNames[stepId] || `Etapa ${stepId}`}: ${criticalCount} crítico(s), ${warningCount} alerta(s), ${okCount} conforme(s)`,
  };
}

async function chbExtractExcelText(file) {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(Buffer.from(file.content, 'base64'), { type: 'buffer', sheetRows: 500 });
    let text = `[Arquivo Excel: ${file.name}]\n\n`;
    for (const sheetName of workbook.SheetNames.slice(0, 5)) {
      const sheet = workbook.Sheets[sheetName];
      const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      text += `=== ABA: ${sheetName} ===\n`;
      for (const row of rows.slice(0, 300)) {
        const line = row.map(cell => String(cell || '').trim()).filter(Boolean).join(' | ');
        if (line) text += `${line}\n`;
      }
      text += '\n';
    }
    return text;
  } catch (err) {
    console.warn('[chb analyze] Excel extraction failed:', err.message);
    return `[Arquivo Excel: ${file.name}] - Não foi possível extrair texto da planilha.`;
  }
}

async function chbBuildPrompt(stepId, files, clientConfig, itemId) {
  const fileNames  = files.map(f => f.name).join(', ');
  const configBlock = clientConfig ? JSON.stringify(clientConfig, null, 2) : 'Sem configuração específica de cliente.';
  let learnedContext = '';

  try {
    if (itemId) {
      const corrections = await opsQuery(
        `SELECT filename, field_name, corrected_value, location_reference, location_context, location_confidence
         FROM dados_dachser.t_chb_user_corrections WHERE item_id = ? ORDER BY updated_at DESC`,
        [itemId]
      );
      if (corrections?.length) {
        learnedContext += '\nCORREÇÕES VALIDADAS PELO USUÁRIO (fonte de verdade):\n';
        for (const corr of corrections) {
          learnedContext += `- ${corr.filename} | ${corr.field_name}: ${corr.corrected_value}`;
          if (corr.location_reference) learnedContext += ` | localização: ${corr.location_reference}`;
          if (corr.location_context)   learnedContext += ` | contexto: ${corr.location_context}`;
          learnedContext += '\n';
        }
      }
    }
  } catch (err) { console.warn('[chb analyze] corrections context skipped:', err.message); }

  try {
    const rules = await opsQuery(
      `SELECT field_name, document_type, extraction_pattern, location_hint, example_value, success_rate
       FROM dados_dachser.t_chb_extraction_rules
       WHERE times_used > 0 AND success_rate >= 50
       ORDER BY success_rate DESC, times_used DESC LIMIT 30`
    );
    if (rules?.length) {
      learnedContext += '\nREGRAS DE EXTRAÇÃO APRENDIDAS:\n';
      for (const rule of rules) {
        learnedContext += `- ${rule.field_name} (${rule.document_type || 'doc'}): ${rule.extraction_pattern || ''} ${rule.location_hint || ''} Ex: ${rule.example_value || ''}\n`;
      }
    }
  } catch (err) { console.warn('[chb analyze] rules context skipped:', err.message); }

  try {
    if (itemId && Number(stepId) > 1) {
      const snapshots = await opsQuery(
        `SELECT etapa, snapshot, approved_at FROM dados_dachser.t_chb_approved_snapshots WHERE item_id = ? AND etapa < ? ORDER BY etapa ASC`,
        [itemId, String(stepId)]
      );
      if (snapshots?.length) {
        learnedContext += '\nETAPAS ANTERIORES APROVADAS (ground truth):\n';
        for (const snap of snapshots) {
          learnedContext += `- Etapa ${snap.etapa}, aprovada em ${snap.approved_at}: ${String(snap.snapshot || '').slice(0, 4000)}\n`;
        }
      }
    }
  } catch (err) { console.warn('[chb analyze] snapshots context skipped:', err.message); }

  const CAMPOS_POR_ETAPA = {
    1: {
      nome: 'Pré-Alerta',
      campos: [
        'CNPJ Consignee',
        'Peso Bruto (kg)',
        'Peso Líquido (kg)',
        'Valor Mercadoria',
        'Valor Total Frete',
        'Moeda',
        'Incoterm',
        'NCM',
        'Aeroporto Origem',
        'Aeroporto Destino',
        'Quantidade de Volumes',
        'Tipo de Frete vs Incoterm',
      ],
      instrucaoExtra: 'Para "Tipo de Frete vs Incoterm": verifique se o Incoterm é compatível com o tipo de frete declarado (ex: EXW não inclui frete internacional — aponte inconsistência se o frete estiver na invoice ou AWB com esse Incoterm).',
    },
    2: {
      nome: 'Instrução',
      campos: [
        'Peso Bruto (kg)',
        'Peso Líquido (kg)',
        'Valor Mercadoria',
        'Valor Total Frete',
        'Moeda',
        'Incoterm',
        'NCM',
        'CNPJ Consignee',
        'Aeroporto Origem',
        'Aeroporto Destino',
        'Quantidade de Volumes',
        'Descrição das Mercadorias',
        'Dimensões da Embalagem',
      ],
      instrucaoExtra: 'Para "Descrição das Mercadorias": compare a descrição entre AWB, invoice e packing list. Para "Dimensões da Embalagem": extraia largura x altura x comprimento (cm) e peso por volume quando disponível.',
    },
    3: {
      nome: 'DI/Fechamento',
      campos: [
        'Peso Bruto (kg)',
        'Peso Líquido (kg)',
        'Valor Mercadoria',
        'Valor Total Frete',
        'Moeda',
        'Incoterm',
        'NCM',
        'CNPJ Consignee',
        'Aeroporto Origem',
        'Aeroporto Destino',
        'Quantidade de Volumes',
        'Tipo de Frete vs Incoterm',
      ],
      instrucaoExtra: 'Para "Tipo de Frete vs Incoterm": verifique se o Incoterm é compatível com o tipo de frete declarado (ex: EXW não inclui frete internacional — aponte inconsistência se o frete estiver na invoice ou AWB com esse Incoterm).',
    },
  };

  const etapaConfig = CAMPOS_POR_ETAPA[Number(stepId)] || CAMPOS_POR_ETAPA[1];
  const camposLista = etapaConfig.campos.map((c, i) => `${i + 1}. ${c}`).join('\n');

  return `Você é um especialista em conferência documental CHB da DACHSER.

Etapa ${stepId} — ${etapaConfig.nome}
Arquivos enviados: ${fileNames}
Configuração do cliente:
${configBlock}
${learnedContext}

CAMPOS OBRIGATÓRIOS A ANALISAR NESTA ETAPA:
${camposLista}

Analise EXCLUSIVAMENTE os campos listados acima. Para cada campo, extraia o valor presente em CADA arquivo enviado e compare entre eles. ${etapaConfig.instrucaoExtra}

Regras:
- Use o nome real de cada arquivo como coluna.
- Coloque cada valor somente na coluna do arquivo onde ele aparece.
- Use "ND" quando o campo não existir no arquivo.
- Correções validadas pelo usuário têm prioridade máxima.
- Aponte divergências críticas com 🔴, alertas com 🟨 e conformidades com ✅.
- Não invente valores.
- A tabela deve ter EXATAMENTE uma linha para cada campo da lista acima, na mesma ordem.

Retorne obrigatoriamente:
<<METADATA>>
MODAL: SEA ou AIR
CLIENTE: nome do cliente/consignee identificado
<<END_METADATA>>

<<BEGIN_HTML>>
HTML simples contendo:
1. Uma tabela com colunas: Status, Campo, e uma coluna para cada arquivo — apenas os campos listados acima.
2. Uma seção <div class="observations-section"> quando houver alerta/crítico.
3. Uma seção <div class="parecer-section"> com impedimento para registrar DI, nível de risco e principais divergências.
4. Uma seção <div class="actions-section"> com próximas ações quando aplicável.
<<END_HTML>>`;
}

async function chbCallAnthropic(prompt, files) {
  const key = process.env.CHB_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada');

  const content = [];
  for (const file of files) {
    const mime = file.mimeType || 'application/octet-stream';
    if (mime.startsWith('image/')) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: file.content } });
      content.push({ type: 'text', text: `[Arquivo: ${file.name}]` });
    } else if (mime === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.content } });
      content.push({ type: 'text', text: `[Arquivo PDF: ${file.name}]` });
    } else if (/spreadsheet|excel/i.test(mime) || /\.(xlsx|xls)$/i.test(file.name)) {
      content.push({ type: 'text', text: await chbExtractExcelText(file) });
    } else {
      let text = '';
      try { text = Buffer.from(file.content, 'base64').toString('utf8'); } catch (_) {}
      content.push({ type: 'text', text: `[Arquivo: ${file.name}]\n${text || 'Conteúdo binário não legível'}` });
    }
  }
  content.push({ type: 'text', text: prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CHB_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 64000,
        temperature: 0,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText.slice(0, 300)}`);
    }
    const data = await response.json();
    return data.content?.find(c => c.type === 'text')?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

async function chbCallGeminiVision(prompt, files) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada');

  const content = [];
  for (const file of files) {
    const mime = file.mimeType || 'application/octet-stream';
    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${file.content}` } });
      content.push({ type: 'text', text: `[Arquivo: ${file.name}]` });
    } else if (/spreadsheet|excel/i.test(mime) || /\.(xlsx|xls)$/i.test(file.name)) {
      content.push({ type: 'text', text: await chbExtractExcelText(file) });
    } else {
      let text = '';
      try { text = Buffer.from(file.content, 'base64').toString('utf8'); } catch (_) {}
      content.push({ type: 'text', text: `[Arquivo: ${file.name}]\n${text || 'Conteúdo binário não legível'}` });
    }
  }
  content.push({ type: 'text', text: prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CHB_GEMINI_MODEL || 'gemini-2.5-pro',
        messages: [{ role: 'user', content }],
        max_tokens: 65536,
        temperature: 0.1,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText.slice(0, 300)}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

async function chbProcessAnalysis(runId, stepId, files, clientConfig, itemId) {
  try {
    await opsQuery(`UPDATE dados_dachser.t_chb_runs SET status = 'processing' WHERE id = ?`, [runId]);
    const prompt = await chbBuildPrompt(stepId, files, clientConfig, itemId);

    let responseText = '';
    let usedFallback = false;
    try {
      responseText = await chbCallAnthropic(prompt, files);
    } catch (anthropicErr) {
      console.error('[chb analyze] Anthropic failed, trying Gemini:', anthropicErr.message);
      usedFallback = true;
      responseText = await chbCallGeminiVision(prompt, files);
    }

    const parsed     = chbExtractHtmlAndTags(responseText, Number(stepId));
    const resultData = {
      id: `chb-${runId}`, stepId, ...parsed,
      generatedAt:   new Date().toLocaleString('pt-BR'),
      filesAnalyzed: files.map(f => f.name),
      usedFallback,
    };

    await opsQuery(
      `UPDATE dados_dachser.t_chb_runs SET status = 'completed', result_html = ?, result_json = ? WHERE id = ?`,
      [JSON.stringify(resultData), JSON.stringify(resultData), runId]
    );
  } catch (err) {
    console.error('[chb analyze] background error:', err.message);
    try {
      await opsQuery(
        `UPDATE dados_dachser.t_chb_runs SET status = 'error', result_text = ? WHERE id = ?`,
        [err.message || 'Erro desconhecido', runId]
      );
    } catch (updateErr) {
      console.error('[chb analyze] failed to mark error:', updateErr.message);
    }
  }
}

// ─── Registro de rotas ─────────────────────────────────────────────────────────
export function registerChbRoutes(app, _deps = {}) {

  // ── Items ─────────────────────────────────────────────────────────────────

  // GET /api/chb/items
  app.get('/api/chb/items', async (_req, res) => {
    try {
      const items = await opsQuery(`
        SELECT i.*,
          (SELECT MAX(r.created_at) FROM dados_dachser.t_chb_runs r WHERE r.item_id = i.id) AS last_run_at
        FROM dados_dachser.t_chb_items i
        WHERE i.active = 1
        ORDER BY i.created_at DESC
      `);
      res.json({ success: true, data: items || [] });
    } catch (err) {
      console.error('[GET /api/chb/items]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/chb/items
  app.post('/api/chb/items', async (req, res) => {
    try {
      const { reference, consignee } = req.body || {};
      const result = await opsQuery(
        `INSERT INTO dados_dachser.t_chb_items
         (reference, consignee, status_macro, step1_status, step2_status, step3_status, active, created_by)
         VALUES (?, ?, 'pre_alerta_pendente', 'pendente', 'pendente', 'pendente', 1, ?)`,
        [reference || null, consignee || null, getUserIdFromBody(req.body)]
      );
      res.json({ success: true, id: result.insertId });
    } catch (err) {
      console.error('[POST /api/chb/items]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/chb/items/:id
  app.patch('/api/chb/items/:id', async (req, res) => {
    try {
      const allowed = ['status_macro', 'step1_status', 'step2_status', 'step3_status', 'consignee', 'modal'];
      const fields = [], values = [];
      for (const key of allowed) {
        if (req.body?.[key] !== undefined) { fields.push(`${key} = ?`); values.push(req.body[key] || null); }
      }
      if (fields.length > 0) {
        values.push(req.params.id);
        await opsQuery(`UPDATE dados_dachser.t_chb_items SET ${fields.join(', ')} WHERE id = ?`, values);
      }
      res.json({ success: true });
    } catch (err) {
      if (String(err.message || '').toLowerCase().includes('modal')) {
        try {
          const { modal: _modal, ...body } = req.body || {};
          const fields = [], values = [];
          for (const key of ['status_macro', 'step1_status', 'step2_status', 'step3_status', 'consignee']) {
            if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key] || null); }
          }
          if (fields.length > 0) {
            values.push(req.params.id);
            await opsQuery(`UPDATE dados_dachser.t_chb_items SET ${fields.join(', ')} WHERE id = ?`, values);
          }
          return res.json({ success: true });
        } catch (retryErr) {
          console.error('[PATCH /api/chb/items/:id retry]', retryErr.message);
        }
      }
      console.error('[PATCH /api/chb/items/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/chb/items/:id
  app.delete('/api/chb/items/:id', async (req, res) => {
    try {
      await opsQuery(`UPDATE dados_dachser.t_chb_items SET active = 0 WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/chb/items/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Files & Docs ──────────────────────────────────────────────────────────

  // GET /api/chb/items/:id/files
  app.get('/api/chb/items/:id/files', async (req, res) => {
    try {
      const files = await opsQuery(`
        SELECT f.id, f.filename, f.mime, f.size_bytes, f.sha256, f.rel_path, f.url, f.created_at, f.created_by,
               d.etapa, d.doc_role, d.is_active AS doc_active
        FROM dados_dachser.t_chb_files f
        INNER JOIN dados_dachser.t_chb_docs d ON d.file_id = f.id
        WHERE d.item_id = ? AND d.is_active = 1
        ORDER BY d.etapa, f.created_at
      `, [req.params.id]);
      res.json({ success: true, data: files || [] });
    } catch (err) {
      console.error('[GET /api/chb/items/:id/files]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/chb/items/:id/docs
  app.get('/api/chb/items/:id/docs', async (req, res) => {
    try {
      const docs = await opsQuery(
        `SELECT d.id, d.doc_role, d.created_at, f.id AS file_id, f.filename, f.url AS file_url, f.size_bytes AS file_size, d.etapa
         FROM dados_dachser.t_chb_docs d
         JOIN dados_dachser.t_chb_files f ON d.file_id = f.id
         WHERE d.item_id = ? AND d.is_active = 1
         ORDER BY d.created_at ASC`,
        [req.params.id]
      );
      res.json({ success: true, rows: docs || [] });
    } catch (err) {
      console.error('[GET /api/chb/items/:id/docs]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/chb/items/:id/files
  app.post('/api/chb/items/:id/files', async (req, res) => {
    try {
      const { filename, mime, sizeBytes, sha256, relPath, url, etapa, docRole, fileBase64 } = req.body || {};
      const buffer = fileBase64 ? Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64') : null;
      if (buffer) await ensureChbFilesBlobColumn();
      const fileResult = await opsQuery(
        buffer
          ? `INSERT INTO dados_dachser.t_chb_files (filename, mime, size_bytes, sha256, rel_path, url, created_by, file_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          : `INSERT INTO dados_dachser.t_chb_files (filename, mime, size_bytes, sha256, rel_path, url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        buffer
          ? [filename, mime || null, buffer.length, sha256 || null, relPath ?? '', url ?? '', getUserIdFromBody(req.body), buffer]
          : [filename, mime || null, sizeBytes || null, sha256 || null, relPath ?? '', url ?? '', getUserIdFromBody(req.body)]
      );
      const fileId  = fileResult.insertId;
      const fileUrl = `/api/chb/files/${fileId}/download`;
      if (buffer && !url) await opsQuery(`UPDATE dados_dachser.t_chb_files SET url = ? WHERE id = ?`, [fileUrl, fileId]);
      await opsQuery(
        `INSERT INTO dados_dachser.t_chb_docs (item_id, file_id, etapa, doc_role, version, is_active, created_by) VALUES (?, ?, ?, ?, 1, 1, ?)`,
        [req.params.id, fileId, etapa || '1', (docRole || 'O').toString().trim(), getUserIdFromBody(req.body)]
      );
      res.json({ success: true, fileId, fileUrl: buffer ? fileUrl : url });
    } catch (err) {
      console.error('[POST /api/chb/items/:id/files]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/chb/items/:id/files/upload
  app.post('/api/chb/items/:id/files/upload', async (req, res) => {
    try {
      const { filename, mime, fileBase64, etapa, docRole } = req.body || {};
      if (!filename || !fileBase64) return res.status(400).json({ success: false, error: 'filename e fileBase64 são obrigatórios' });

      const buffer = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
      await ensureChbFilesBlobColumn();

      const fileResult = await opsQuery(
        `INSERT INTO dados_dachser.t_chb_files (filename, mime, size_bytes, sha256, rel_path, url, created_by, file_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [filename, mime || null, buffer.length, null, '', '', getUserIdFromBody(req.body), buffer]
      );
      const fileId  = fileResult.insertId;
      const fileUrl = `/api/chb/files/${fileId}/download`;
      await opsQuery(`UPDATE dados_dachser.t_chb_files SET url = ? WHERE id = ?`, [fileUrl, fileId]);
      await opsQuery(
        `INSERT INTO dados_dachser.t_chb_docs (item_id, file_id, etapa, doc_role, version, is_active, created_by) VALUES (?, ?, ?, ?, 1, 1, ?)`,
        [req.params.id, fileId, etapa || '1', (docRole || 'O').toString().trim(), getUserIdFromBody(req.body)]
      );
      res.json({ success: true, fileId, fileUrl, sizeBytes: buffer.length });
    } catch (err) {
      console.error('[POST /api/chb/items/:id/files/upload]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/chb/files/:fileId/download
  app.get('/api/chb/files/:fileId/download', async (req, res) => {
    try {
      await ensureChbFilesBlobColumn();
      const rows = await opsQuery(`SELECT filename, mime, file_content FROM dados_dachser.t_chb_files WHERE id = ? LIMIT 1`, [req.params.fileId]);
      const file = rows?.[0];
      if (!file?.file_content) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });
      res.type(file.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${String(file.filename || 'documento').replace(/"/g, '')}"`);
      res.send(Buffer.isBuffer(file.file_content) ? file.file_content : Buffer.from(file.file_content));
    } catch (err) {
      console.error('[GET /api/chb/files/:fileId/download]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/chb/items/:itemId/files/:fileId
  app.delete('/api/chb/items/:itemId/files/:fileId', async (req, res) => {
    try {
      await opsQuery(`UPDATE dados_dachser.t_chb_docs SET is_active = 0 WHERE file_id = ? AND item_id = ?`, [req.params.fileId, req.params.itemId]);
      res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/chb/items/:itemId/files/:fileId]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/chb/docs/:docId
  app.delete('/api/chb/docs/:docId', async (req, res) => {
    try {
      await opsQuery(`DELETE FROM dados_dachser.t_chb_docs WHERE id = ?`, [req.params.docId]);
      res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/chb/docs/:docId]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Runs ──────────────────────────────────────────────────────────────────

  // GET /api/chb/items/:id/runs
  app.get('/api/chb/items/:id/runs', async (req, res) => {
    try {
      const params = [req.params.id];
      let sql = `
        SELECT r.*, u.username AS created_by_name, u.email AS created_by_email
        FROM dados_dachser.t_chb_runs r
        LEFT JOIN dados_dachser.t_users_dachser u ON u.id = r.created_by
        WHERE r.item_id = ?
      `;
      if (req.query.etapa !== undefined) { sql += ` AND r.etapa = ?`; params.push(req.query.etapa); }
      sql += ` ORDER BY r.created_at DESC`;
      const runs = await opsQuery(sql, params);
      res.json({ success: true, data: runs || [] });
    } catch (err) {
      console.error('[GET /api/chb/items/:id/runs]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/chb/items/:id/runs
  app.post('/api/chb/items/:id/runs', async (req, res) => {
    try {
      const { etapa, status, resultText, resultHtml, resultJson, usedAsCtx } = req.body || {};
      const result = await opsQuery(
        `INSERT INTO dados_dachser.t_chb_runs
         (item_id, etapa, status, result_text, result_html, result_json, used_as_ctx, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id, etapa || '1', status || 'completed',
          resultText || null, resultHtml || null,
          resultJson ? (typeof resultJson === 'string' ? resultJson : JSON.stringify(resultJson)) : null,
          usedAsCtx ? 1 : 0, getUserIdFromBody(req.body),
        ]
      );
      res.json({ success: true, runId: result.insertId });
    } catch (err) {
      console.error('[POST /api/chb/items/:id/runs]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/chb/runs/:runId
  app.patch('/api/chb/runs/:runId', async (req, res) => {
    try {
      const fields = [], values = [];
      const map = { status: 'status', resultText: 'result_text', resultHtml: 'result_html', resultJson: 'result_json' };
      for (const [bodyKey, col] of Object.entries(map)) {
        if (req.body?.[bodyKey] !== undefined) {
          fields.push(`${col} = ?`);
          const v = req.body[bodyKey];
          values.push(bodyKey === 'resultJson' && typeof v !== 'string' ? JSON.stringify(v) : v);
        }
      }
      if (fields.length === 0) return res.json({ success: true });
      values.push(req.params.runId);
      await opsQuery(`UPDATE dados_dachser.t_chb_runs SET ${fields.join(', ')} WHERE id = ?`, values);
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/chb/runs/:runId]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Client configs ────────────────────────────────────────────────────────

  // GET /api/chb/client-configs
  app.get('/api/chb/client-configs', async (_req, res) => {
    try {
      const rows = await opsQuery(`SELECT * FROM dados_dachser.t_chb_client_config WHERE ativo = 1 ORDER BY cliente_nome ASC`);
      res.json({ success: true, data: (rows || []).map(normalizeChbConfig) });
    } catch (err) {
      console.error('[GET /api/chb/client-configs]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/chb/client-configs/:cnpj
  app.get('/api/chb/client-configs/:cnpj', async (req, res) => {
    try {
      const rows = await opsQuery(`SELECT * FROM dados_dachser.t_chb_client_config WHERE cliente_cnpj = ? AND ativo = 1 LIMIT 1`, [req.params.cnpj]);
      res.json({ success: true, data: normalizeChbConfig(rows?.[0]) });
    } catch (err) {
      console.error('[GET /api/chb/client-configs/:cnpj]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/chb/client-configs
  app.post('/api/chb/client-configs', async (req, res) => {
    try {
      const c  = req.body || {};
      const id = randomUUID();
      await opsQuery(
        `INSERT INTO dados_dachser.t_chb_client_config (
          id, cliente_cnpj, cliente_nome, tolerancia_peso, tolerancia_valor,
          campos_obrigatorios, regras_comparacao, instrucoes_personalizadas,
          armador, agente_destino, contato_email, prazo_resposta_dias,
          porto_descarga_real, tolerancia_taxas_acessorias_abs, tolerancia_taxas_acessorias_pct,
          beneficio_fiscal, cfop_padrao, estado_uf, icms_diferido, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          id, c.cliente_cnpj, c.cliente_nome || null,
          c.tolerancia_peso ?? 2.0, c.tolerancia_valor ?? 1.0,
          JSON.stringify(c.campos_obrigatorios || []), JSON.stringify(c.regras_comparacao || {}),
          c.instrucoes_personalizadas || null, c.armador || null, c.agente_destino || null,
          c.contato_email || null, c.prazo_resposta_dias ?? 2, c.porto_descarga_real || null,
          c.tolerancia_taxas_acessorias_abs ?? 50, c.tolerancia_taxas_acessorias_pct ?? 1.0,
          c.beneficio_fiscal || null, c.cfop_padrao || null, c.estado_uf || null,
          c.icms_diferido ? 1 : 0,
        ]
      );
      res.json({ success: true, id });
    } catch (err) {
      console.error('[POST /api/chb/client-configs]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/chb/client-configs/:id
  app.patch('/api/chb/client-configs/:id', async (req, res) => {
    try {
      const allowed = [
        'cliente_cnpj', 'cliente_nome', 'tolerancia_peso', 'tolerancia_valor', 'campos_obrigatorios',
        'regras_comparacao', 'instrucoes_personalizadas', 'armador', 'agente_destino', 'contato_email',
        'prazo_resposta_dias', 'porto_descarga_real', 'tolerancia_taxas_acessorias_abs',
        'tolerancia_taxas_acessorias_pct', 'beneficio_fiscal', 'cfop_padrao', 'estado_uf', 'icms_diferido', 'ativo',
      ];
      const fields = [], values = [];
      for (const key of allowed) {
        if (req.body?.[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(
            ['campos_obrigatorios', 'regras_comparacao'].includes(key) ? JSON.stringify(req.body[key])
            : (key === 'icms_diferido' || key === 'ativo') ? (req.body[key] ? 1 : 0)
            : req.body[key]
          );
        }
      }
      if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        values.push(req.params.id);
        await opsQuery(`UPDATE dados_dachser.t_chb_client_config SET ${fields.join(', ')} WHERE id = ?`, values);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/chb/client-configs/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/chb/client-configs/:id
  app.delete('/api/chb/client-configs/:id', async (req, res) => {
    try {
      await opsQuery(`UPDATE dados_dachser.t_chb_client_config SET ativo = 0, updated_at = NOW() WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/chb/client-configs/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Approved snapshots ────────────────────────────────────────────────────

  // POST /api/chb/approved-snapshots
  app.post('/api/chb/approved-snapshots', async (req, res) => {
    try {
      const { itemId, etapa, runId, snapshot, resultHtml, summary, approvedBy } = req.body || {};
      await opsQuery(
        `INSERT INTO dados_dachser.t_chb_approved_snapshots
           (item_id, etapa, run_id, snapshot, result_html, summary, approved_by, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           run_id = VALUES(run_id), snapshot = VALUES(snapshot), result_html = VALUES(result_html),
           summary = VALUES(summary), approved_by = VALUES(approved_by),
           approved_at = NOW(), updated_at = NOW()`,
        [
          itemId, String(etapa), runId || null,
          typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot ?? {}),
          resultHtml || null,
          summary ? (typeof summary === 'string' ? summary : JSON.stringify(summary)) : null,
          approvedBy ?? null,
        ]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/chb/approved-snapshots]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Corrections ───────────────────────────────────────────────────────────

  // GET /api/chb/corrections?item_id=
  app.get('/api/chb/corrections', async (req, res) => {
    try {
      const { item_id } = req.query;
      if (!item_id) return res.status(400).json({ success: false, error: 'item_id is required' });
      const corrections = await opsQuery(
        `SELECT id, item_id, filename, field_name, original_value, corrected_value,
                location_reference, location_context, location_confidence,
                corrected_by, applied_count, is_validated, created_at, updated_at
         FROM dados_dachser.t_chb_user_corrections
         WHERE item_id = ? ORDER BY created_at DESC`,
        [item_id]
      );
      res.json({ success: true, corrections: corrections || [] });
    } catch (err) {
      console.error('[GET /api/chb/corrections]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/chb/corrections — actions: save | delete | increment-applied
  app.post('/api/chb/corrections', async (req, res) => {
    try {
      const body = req.body || {};
      const { action } = body;

      if (action === 'delete') {
        const { correction_id } = body;
        if (!correction_id) return res.status(400).json({ success: false, error: 'correction_id is required' });
        await opsQuery(`DELETE FROM dados_dachser.t_chb_user_corrections WHERE id = ?`, [correction_id]);
        return res.json({ success: true, deleted: correction_id });
      }

      if (action === 'increment-applied') {
        const { correction_id } = body;
        if (!correction_id) return res.status(400).json({ success: false, error: 'correction_id is required' });
        await opsQuery(`UPDATE dados_dachser.t_chb_user_corrections SET applied_count = applied_count + 1, updated_at = NOW() WHERE id = ?`, [correction_id]);
        return res.json({ success: true });
      }

      // default: save
      const { item_id, filename, field_name, original_value, corrected_value, corrected_by, file_content } = body;
      if (!item_id || !filename || !field_name || !corrected_value) {
        return res.status(400).json({ success: false, error: 'item_id, filename, field_name e corrected_value são obrigatórios' });
      }

      let effectiveFileContent = file_content || null;
      if (!effectiveFileContent) effectiveFileContent = await fetchDocContentFromDb(item_id, filename);

      let locationResult = { found: false, location: 'Localização automática não disponível', context: '', confidence: 'baixa' };
      if (effectiveFileContent && process.env.GEMINI_API_KEY) {
        locationResult = await locateValueInFile(filename, field_name, corrected_value, effectiveFileContent);
      }

      const existing = await opsQuery(
        `SELECT id FROM dados_dachser.t_chb_user_corrections WHERE item_id = ? AND filename = ? AND field_name = ? LIMIT 1`,
        [item_id, filename, field_name]
      );

      let correctionId;
      if (existing && existing.length > 0) {
        correctionId = existing[0].id;
        await opsQuery(
          `UPDATE dados_dachser.t_chb_user_corrections SET original_value=?, corrected_value=?, location_reference=?, location_context=?, location_confidence=?, corrected_by=?, updated_at=NOW() WHERE id=?`,
          [original_value || null, corrected_value, locationResult.location, locationResult.context, locationResult.confidence, corrected_by || null, correctionId]
        );
      } else {
        const result = await opsQuery(
          `INSERT INTO dados_dachser.t_chb_user_corrections (item_id, filename, field_name, original_value, corrected_value, location_reference, location_context, location_confidence, corrected_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item_id, filename, field_name, original_value || null, corrected_value, locationResult.location, locationResult.context, locationResult.confidence, corrected_by || null]
        );
        correctionId = result?.insertId;
      }

      if (!locationResult.found && effectiveFileContent && process.env.GEMINI_API_KEY) {
        try {
          const reext = await reextractFieldWithContext(filename, field_name, corrected_value, effectiveFileContent);
          if (reext.success && reext.found) {
            await opsQuery(
              `UPDATE dados_dachser.t_chb_user_corrections SET location_reference=?, location_context=?, location_confidence=?, updated_at=NOW() WHERE id=?`,
              [reext.location, reext.nearbyText, reext.confidence, correctionId]
            );
            locationResult = { found: true, location: reext.location, context: reext.nearbyText, confidence: reext.confidence };
            const docType = detectDocumentType(filename);
            await saveExtractionRule(field_name, docType, reext.pattern, reext.extractionHint, corrected_value, reext.processingInstruction);
          }
        } catch (reextErr) {
          console.error('[chb] re-extraction error:', reextErr.message);
        }
      }

      res.json({ success: true, correction_id: correctionId, location: locationResult });
    } catch (err) {
      console.error('[POST /api/chb/corrections]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Análise de documentos ─────────────────────────────────────────────────

  // POST /api/chb/analyze-documents
  app.post('/api/chb/analyze-documents', async (req, res) => {
    try {
      const body = req.body || {};

      // polling de status por requestId
      if (body.requestId) {
        const rows = await opsQuery(
          `SELECT status, result_html, result_text, result_json, created_at FROM dados_dachser.t_chb_runs WHERE id = ? LIMIT 1`,
          [body.requestId]
        );
        const row = rows?.[0];
        if (!row) return res.status(404).json({ status: 'error', error: 'Requisição não encontrada' });

        let status = row.status;
        const createdAt = new Date(row.created_at).getTime();
        const now = Date.now();
        const timeoutMs = 600 * 1000; // 10 minutes

        if ((status === 'pending' || status === 'processing') && (now - createdAt) > timeoutMs) {
          await opsQuery(
            `UPDATE dados_dachser.t_chb_runs SET status = 'error', result_text = 'TIMEOUT: A análise demorou mais que o esperado. O processamento foi interrompido.' WHERE id = ?`,
            [body.requestId]
          );
          status = 'error';
          row.result_text = 'TIMEOUT: A análise demorou mais que o esperado. O processamento foi interrompido.';
        }

        let result = null;
        if (status === 'completed' && row.result_html) {
          try { result = JSON.parse(row.result_html); } catch { result = { html: row.result_html }; }
        }
        return res.json({ status, result, error: status === 'error' ? row.result_text : null });
      }

      const { stepId, files, clientConfig, itemId } = body;
      if (!stepId || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'stepId e files são obrigatórios' });
      }

      const totalChars      = files.reduce((sum, f) => sum + String(f.content || '').length + String(f.name || '').length, 0);
      const estimatedTokens = Math.ceil(totalChars / 4);
      if (estimatedTokens > 1_000_000) {
        return res.status(400).json({ error: `Input muito grande (${estimatedTokens} tokens estimados). Reduza o número ou tamanho dos arquivos.` });
      }

      const insert = await opsQuery(
        `INSERT INTO dados_dachser.t_chb_runs (item_id, etapa, status, result_text, used_as_ctx, created_by) VALUES (?, ?, 'pending', ?, 0, ?)`,
        [itemId || 0, String(stepId), JSON.stringify({ filesCount: files.length, fileNames: files.map(f => f.name), hasClientConfig: !!clientConfig }), null]
      );
      const requestId = String(insert.insertId);

      setImmediate(() => {
        chbProcessAnalysis(requestId, stepId, files, clientConfig, itemId)
          .catch(err => console.error('[chb analyze] unhandled background error:', err.message));
      });

      res.json({ requestId, status: 'pending', message: 'Análise iniciada. Use o requestId para consultar o status.' });
    } catch (err) {
      console.error('[POST /api/chb/analyze-documents]', err.message);
      res.status(500).json({ error: err.message || 'Erro desconhecido', errors: [{ type: 'unknown', message: err.message || 'Erro desconhecido' }] });
    }
  });

  // POST /api/chb/compare-documents — compara PDF + Excel
  app.post('/api/chb/compare-documents', async (req, res) => {
    const startTime = Date.now();
    try {
      const { pdfBase64, pdfFileName, excelContent, excelFileName } = req.body || {};
      if (!pdfBase64 || !excelContent) {
        return res.status(400).json({ error: 'pdfBase64 e excelContent são obrigatórios' });
      }

      const ANTHROPIC_API_KEY = process.env.CHB_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });

      const systemPrompt = `Você é um especialista em análise e conferência de documentos fiscais e financeiros brasileiros.
Sua tarefa é analisar COMPLETAMENTE os documentos fornecidos e realizar uma comparação detalhada.

INSTRUÇÕES IMPORTANTES:
1. EXTRAIA TODOS os dados do PDF (faturas, notas fiscais, invoices)
2. EXTRAIA TODOS os dados da planilha Excel que foi fornecida como texto
3. COMPARE item por item, identificando: itens que conferem, itens com diferenças, itens só no PDF, itens só no Excel

RETORNE OBRIGATORIAMENTE um JSON válido no seguinte formato:
{
  "pdfSummary": { "documentType": "...", "totalValue": 0, "itemCount": 0, "metadata": {}, "extractedItems": [] },
  "excelSummary": { "totalValue": 0, "itemCount": 0, "extractedItems": [] },
  "comparison": { "matchedItems": [], "pdfOnlyItems": [], "excelOnlyItems": [], "totalDifference": 0 },
  "analysis": { "overallStatus": "success|warning|error", "summary": "...", "discrepancies": [], "recommendations": [] }
}

REGRAS DE STATUS:
- "success": valores idênticos ou diferença menor que R$ 1
- "warning": diferença entre R$ 1 e R$ 50
- "error": diferença maior que R$ 50 ou item não encontrado

Responda APENAS com o JSON, sem markdown.`;

      const userPrompt = `Analise os seguintes documentos:\n\n=== CONTEÚDO DA PLANILHA EXCEL (${excelFileName}) ===\n${excelContent}\n\n=== DOCUMENTO PDF ===\nO PDF (${pdfFileName}) está anexado para sua análise.\n\nPor favor, extraia TODOS os itens e valores de ambos os documentos e realize a comparação completa.`;

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.CHB_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
          max_tokens: 32000,
          temperature: 0,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: systemPrompt + '\n\n' + userPrompt },
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            ],
          }],
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        if (anthropicRes.status === 429) return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em alguns minutos.' });
        throw new Error(`Anthropic error: ${anthropicRes.status} — ${errText.slice(0, 200)}`);
      }

      const aiResponse = await anthropicRes.json();
      const content    = aiResponse.content?.[0]?.text;
      if (!content) throw new Error('Resposta vazia da IA');

      let analysisResult;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        analysisResult  = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      } catch {
        throw new Error('Falha ao interpretar resposta da IA. Tente novamente.');
      }

      analysisResult.metadata = {
        model: process.env.CHB_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        processingTimeMs: Date.now() - startTime,
        pdfFileName, excelFileName,
        tokensUsed: (aiResponse.usage?.input_tokens || 0) + (aiResponse.usage?.output_tokens || 0),
      };

      res.json(analysisResult);
    } catch (err) {
      console.error('[POST /api/chb/compare-documents]', err.message);
      res.status(500).json({ error: err.message || 'Erro desconhecido ao processar documentos' });
    }
  });
}

