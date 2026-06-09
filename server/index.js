// Local server — substitui a Supabase edge function fetch-tracking-aereo
// Rode com: node server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── In-memory caches (mesma lógica da edge function) ───
let discrepancyCache = null;
let routeCache = null;
const CACHE_TTL = 60_000;

// ─── DB pool (reuse connections) ───
let pool = null;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host:     process.env.MARIADB_AIR_HOST     || process.env.MARIADB_OPS_HOST,
      port:     parseInt(process.env.MARIADB_AIR_PORT || process.env.MARIADB_OPS_PORT || '3306'),
      database: process.env.MARIADB_AIR_DATABASE || process.env.MARIADB_OPS_DATABASE,
      user:     process.env.MARIADB_AIR_USER     || process.env.MARIADB_OPS_USER     || undefined,
      password: process.env.MARIADB_AIR_PASSWORD || process.env.MARIADB_OPS_PASSWORD || undefined,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 8000,
    });
  }
  return pool;
}

async function queryWithRetry(sql, params = [], maxRetries = 1) {
  const db = getPool();
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const [rows] = await db.query(sql, params);
      return rows;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ─── IATA helpers (idênticos à edge function) ───
const IATA_CITY_MAP = {
  "GUARULHOS":"GRU","SAO PAULO":"GRU","CAMPINAS":"VCP","VIRACOPOS":"VCP",
  "CURITIBA":"CWB","PORTO ALEGRE":"POA","RIO DE JANEIRO":"GIG",
  "BELO HORIZONTE":"CNF","SALVADOR":"SSA","RECIFE":"REC",
  "FORTALEZA":"FOR","BRASILIA":"BSB","MANAUS":"MAO","BELEM":"BEL",
  "GOIANIA":"GYN","VITORIA":"VIX","FLORIANOPOLIS":"FLN","NATAL":"NAT",
  "FRANKFURT":"FRA","PARIS":"CDG","AMSTERDAM":"AMS","LONDON":"LHR",
  "MADRID":"MAD","MILAN":"MXP","ROME":"FCO","LISBON":"LIS",
  "MUNICH":"MUC","ZURICH":"ZRH","VIENNA":"VIE","BRUSSELS":"BRU",
  "BARCELONA":"BCN","VALENCIA":"VLC","OSLO":"OSL","STOCKHOLM":"ARN",
  "NEW YORK":"JFK","MIAMI":"MIA","CHICAGO":"ORD","LOS ANGELES":"LAX",
  "ATLANTA":"ATL","DALLAS":"DFW","HOUSTON":"IAH","BOSTON":"BOS",
  "TORONTO":"YYZ","MONTREAL":"YUL","MEXICO CITY":"MEX",
  "BOGOTA":"BOG","SANTIAGO":"SCL","BUENOS AIRES":"EZE","LIMA":"LIM",
  "DUBAI":"DXB","HONG KONG":"HKG","SHANGHAI":"PVG","BEIJING":"PEK",
  "TOKYO":"NRT","SINGAPORE":"SIN","SYDNEY":"SYD","AUCKLAND":"AKL",
  "JOHANNESBURG":"JNB","NAIROBI":"NBO","ADDIS ABABA":"ADD",
};

function extractIATA(loc) {
  if (!loc) return "";
  const t = loc.trim();
  const paren = t.match(/\(([A-Z]{3})\)/i);
  if (paren) return paren[1].toUpperCase();
  if (/^[A-Z]{3}$/i.test(t)) return t.toUpperCase();
  const upper = t.toUpperCase().replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (IATA_CITY_MAP[upper]) return IATA_CITY_MAP[upper];
  const firstWord = upper.split(" ")[0];
  if (firstWord && firstWord.length > 3 && IATA_CITY_MAP[firstWord]) return IATA_CITY_MAP[firstWord];
  const endMatch = t.match(/[\s-]([A-Z]{3})$/i);
  if (endMatch) return endMatch[1].toUpperCase();
  return t.replace(/[^A-Za-z]/g, "").substring(0, 3).toUpperCase();
}

// ─── Main route ───
app.get('/tracking-aereo', async (req, res) => {
  try {
    const normalizeDesc = s => (s || '').toUpperCase().trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Step 1: event codes lookup
    const eventsRows = await queryWithRetry(`SELECT id, code, descricao_en FROM dados_dachser.t_eventos_awb`);
    const eventMap = {};
    const EXACT_MAP = new Map();
    const KEYWORD_INDEX = [];
    for (const e of eventsRows || []) {
      const code = (e.code || '').toString().trim().toUpperCase();
      if (!code) continue;
      eventMap[code] = { id: Number(e.id), descricao_en: e.descricao_en || '' };
      const desc = normalizeDesc(e.descricao_en || '');
      if (desc) { if (!EXACT_MAP.has(desc)) EXACT_MAP.set(desc, code); KEYWORD_INDEX.push({ needle: desc, code }); }
    }

    // Step 2: description_eventos lookup
    const descRows = await queryWithRetry(`SELECT code, description FROM dados_dachser.t_description_eventos`);
    const descLookup = (descRows || []).map(d => ({ code: d.code || '', description: (d.description || '').toUpperCase() }));
    for (const d of descRows || []) {
      const code = (d.code || '').toString().trim().toUpperCase();
      const desc = normalizeDesc(d.description || '');
      if (!code || !desc) continue;
      if (!EXACT_MAP.has(desc)) EXACT_MAP.set(desc, code);
      KEYWORD_INDEX.push({ needle: desc, code });
    }
    KEYWORD_INDEX.sort((a, b) => b.needle.length - a.needle.length);

    // Step 3: Main query
    const sql = `
      with base as (
        select tda.awb_number as AWB, tda.hawb_number as HAWB, tda.consignee_nome as CLIENTE,
            tda.tipo_servico as TIPO_SERVICO, tda.etd as ETD,
            tdaf.origin as ORIGEM, tdaf.destination as DESTINO, tda.clerk as ANALISTA,
            tdaf.last_status_code,
            tdaf.timeline_json as TIMELINE,
            json_unquote(json_extract(tdaf.timeline_json,'$[0].description')) as desc0,
            json_unquote(json_extract(tdaf.timeline_json,'$[1].description')) as desc1,
            json_unquote(json_extract(tdaf.timeline_json,'$[2].description')) as desc2,
            json_unquote(json_extract(tdaf.timeline_json,'$[3].description')) as desc3,
            json_unquote(json_extract(tdaf.timeline_json,'$[4].description')) as desc4,
            json_unquote(json_extract(tdaf.timeline_json,'$[5].description')) as desc5,
            json_unquote(json_extract(tdaf.timeline_json,'$[0].location'))    as loc0,
            json_unquote(json_extract(tdaf.timeline_json,'$[1].location'))    as loc1,
            json_unquote(json_extract(tdaf.timeline_json,'$[2].location'))    as loc2,
            json_unquote(json_extract(tdaf.timeline_json,'$[3].location'))    as loc3,
            json_unquote(json_extract(tdaf.timeline_json,'$[4].location'))    as loc4,
            json_unquote(json_extract(tdaf.timeline_json,'$[5].location'))    as loc5,
            json_unquote(json_extract(tdaf.timeline_json,'$[0].date'))        as date0,
            json_unquote(json_extract(tdaf.timeline_json,'$[1].date'))        as date1,
            json_unquote(json_extract(tdaf.timeline_json,'$[2].date'))        as date2,
            json_unquote(json_extract(tdaf.timeline_json,'$[3].date'))        as date3,
            json_unquote(json_extract(tdaf.timeline_json,'$[4].date'))        as date4,
            json_unquote(json_extract(tdaf.timeline_json,'$[5].date'))        as date5,
            json_unquote(json_extract(tdaf.timeline_json,'$[0].time'))        as time0,
            json_unquote(json_extract(tdaf.timeline_json,'$[0].status_code')) as code0_native,
            json_unquote(json_extract(tdaf.timeline_json,'$[1].status_code')) as code1_native,
            json_unquote(json_extract(tdaf.timeline_json,'$[2].status_code')) as code2_native,
            json_unquote(json_extract(tdaf.timeline_json,'$[3].status_code')) as code3_native,
            json_unquote(json_extract(tdaf.timeline_json,'$[4].status_code')) as code4_native,
            json_unquote(json_extract(tdaf.timeline_json,'$[5].status_code')) as code5_native
        from dados_dachser.t_dados_aereo tda
        left join dados_dachser.t_fato_aereo tdaf
            on tdaf.awb collate utf8mb4_unicode_ci = tda.awb_number collate utf8mb4_unicode_ci
           and json_valid(tdaf.hawbs_json)
           and json_contains(tdaf.hawbs_json, json_array(tda.hawb_number))
        where (tda.master_insert >= '2026-03-20' or tda.created_at >= '2026-03-20')
      ),
      event_time as (
        select b.*,
            str_to_date(concat(nullif(b.date0,''), case when nullif(b.time0,'') is not null then concat(' ',b.time0) else ' 00:00' end),'%d %b %Y %H:%i') as data_evento_base
        from base b
      ),
      sla_calc as (
        select e.*,
            timestampdiff(second, e.data_evento_base, now())/3600 as sla_hours_in_status,
            case
                when e.last_status_code in ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') then null
                when e.last_status_code='BKD' then 12 when e.last_status_code='RCS' then 12
                when e.last_status_code='MAN' then 3  when e.last_status_code='PRE' then 6
                when e.last_status_code='RCF' then 6  when e.last_status_code='DEP' then 48
                when e.last_status_code='FOH' then 12 when e.last_status_code='FWB' then 24
                when e.last_status_code='RDP' then 3  when e.last_status_code='RFC' then 6
                else 24
            end as sla_limite_horas
        from event_time e
      )
      select s.*,
          round(s.sla_hours_in_status,2) as hours_in_status_rounded,
          case when s.sla_limite_horas is null or s.sla_limite_horas=0 then null
               else round(s.sla_hours_in_status/s.sla_limite_horas,4) end as sla_ratio,
          case when s.last_status_code in ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') then 'VERDE'
               when s.sla_limite_horas is null or s.sla_limite_horas=0 then null
               when s.sla_hours_in_status/s.sla_limite_horas<0.7 then 'VERDE'
               when s.sla_hours_in_status/s.sla_limite_horas<1.0 then 'AMARELO'
               else 'VERMELHO' end as sla_cor,
          case when s.sla_hours_in_status is null then null
               when s.sla_hours_in_status<24 then concat(floor(s.sla_hours_in_status),'h',lpad(floor((s.sla_hours_in_status-floor(s.sla_hours_in_status))*60),2,'0'))
               else concat(floor(s.sla_hours_in_status/24),'d',lpad(floor(mod(s.sla_hours_in_status,24)),2,'0'),'h') end as sla_tempo_formatado,
          case when s.last_status_code in ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') then 'Status pós-chegada/final'
               when s.sla_limite_horas is null then null
               else concat(round(s.sla_hours_in_status/s.sla_limite_horas*100,1),'% do limite') end as sla_tooltip
      from sla_calc s
    `;

    const rows = await queryWithRetry(sql);
    console.log(`Query returned ${rows?.length || 0} rows`);

    // Step 3b: missing CLIENTE
    const missingClienteHawbs = (rows || []).filter(r => !r.CLIENTE || r.CLIENTE.toString().trim() === '').map(r => r.HAWB).filter(h => h && h !== 'NI');
    const clienteMap = {};
    if (missingClienteHawbs.length > 0) {
      const unique = [...new Set(missingClienteHawbs)];
      for (let i = 0; i < unique.length; i += 100) {
        const chunk = unique.slice(i, i + 100);
        const placeholders = chunk.map(() => '?').join(',');
        const masterRows = await queryWithRetry(`SELECT hawb, cliente FROM dados_dachser.t_master_dados WHERE hawb IN (${placeholders}) AND cliente IS NOT NULL AND cliente != ''`, chunk);
        for (const mr of masterRows || []) { if (mr.hawb && mr.cliente) clienteMap[mr.hawb] = mr.cliente; }
      }
    }

    // Step 3c: visibility
    let visibilityMap = {};
    try {
      const visRows = await queryWithRetry(`SELECT awb, hawb, hide_reason FROM dados_dachser.t_air_process_visibility`);
      for (const v of visRows || []) { visibilityMap[`${v.awb||''}|${v.hawb||''}`] = v.hide_reason || ''; }
    } catch {}

    // Step 3d: discrepancy cache
    let discrepancyMap = {};
    if (discrepancyCache && Date.now() - discrepancyCache.at < CACHE_TTL) {
      discrepancyMap = discrepancyCache.data;
    } else {
      try {
        const activeAwbs = [...new Set((rows||[]).map(r => (r.AWB||'').toString().trim()).filter(a => a.length > 0))];
        const awbInClause = activeAwbs.length > 0 ? `AND tda.awb_number IN (${activeAwbs.map(a=>`'${a.replace(/'/g,"''")}'`).join(',')})` : 'AND 1=0';
        const discSql = `
          WITH base_disc AS (
            SELECT tda.awb_number AS awb, tda.hawb_number AS hawb, tdaf.timeline_json
            FROM dados_dachser.t_dados_aereo tda
            INNER JOIN dados_dachser.t_fato_aereo tdaf ON tdaf.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci AND JSON_VALID(tdaf.hawbs_json) AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
            WHERE (tda.master_insert>='2026-03-20' OR tda.created_at>='2026-03-20') ${awbInClause} AND tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json)
          ),
          eventos_disc AS (
            SELECT b.awb, b.hawb, jt.ordem, jt.description,
              CASE WHEN UPPER(COALESCE(jt.description,'')) REGEXP '(^|[^A-Z])(BOOKED|BOOKING)([^A-Z]|$)' THEN NULL
                   WHEN UPPER(COALESCE(jt.description,'')) REGEXP 'OFFLOADED|OFLD' AND (UPPER(jt.description) REGEXP '(^|[^0-9])0[[:space:]]+PIECES?([^A-Z]|$)' OR UPPER(jt.description) REGEXP 'QTY:[[:space:]]*0([^0-9]|$)') THEN NULL
                   WHEN UPPER(jt.description) REGEXP 'QTY:[[:space:]]*[1-9][0-9]*' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'QTY:[[:space:]]*[1-9][0-9]*'),'[1-9][0-9]*') AS UNSIGNED)
                   WHEN UPPER(jt.description) REGEXP 'PIECES?:[[:space:]]*[1-9][0-9]*' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'PIECES?:[[:space:]]*[1-9][0-9]*'),'[1-9][0-9]*') AS UNSIGNED)
                   WHEN UPPER(jt.description) REGEXP '[1-9][0-9]*[[:space:]]+PIECES?' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'[1-9][0-9]*[[:space:]]+PIECES?'),'[1-9][0-9]*') AS UNSIGNED)
                   ELSE NULL END AS pieces_extraidas,
              CASE WHEN UPPER(COALESCE(jt.description,'')) REGEXP '(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)' THEN 1 ELSE 0 END AS is_dis_event
            FROM base_disc b
            JOIN JSON_TABLE(b.timeline_json,'$[*]' COLUMNS(ordem FOR ORDINALITY, description VARCHAR(1000) PATH '$.description')) jt
          ),
          baseline_pieces AS (
            SELECT awb,hawb,pieces_extraidas AS baseline_pecas FROM (SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem) AS rn FROM eventos_disc e WHERE e.pieces_extraidas IS NOT NULL AND e.pieces_extraidas>0) x WHERE x.rn=1
          ),
          ultimo_evento_absoluto AS (
            SELECT awb,hawb,is_dis_event AS ultimo_is_dis_event FROM (SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem DESC) AS rn FROM eventos_disc e) x WHERE x.rn=1
          ),
          eventos_validos_pecas AS (
            SELECT e.awb,e.hawb,e.ordem,e.pieces_extraidas,ROW_NUMBER() OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem DESC) AS rn_desc,SUM(e.pieces_extraidas) OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS soma_pecas_desc
            FROM eventos_disc e WHERE e.pieces_extraidas IS NOT NULL AND e.pieces_extraidas>0
          ),
          ultimo_evento_pecas AS (SELECT awb,hawb,pieces_extraidas AS ultimo_evento_pecas FROM eventos_validos_pecas WHERE rn_desc=1),
          normalizado_por_soma_final AS (SELECT v.awb,v.hawb,MAX(CASE WHEN bp.baseline_pecas IS NOT NULL AND v.rn_desc>=2 AND v.soma_pecas_desc=bp.baseline_pecas THEN 1 ELSE 0 END) AS normalizado_soma_final FROM eventos_validos_pecas v LEFT JOIN baseline_pieces bp ON bp.awb=v.awb AND bp.hawb=v.hawb GROUP BY v.awb,v.hawb),
          agregado_disc AS (SELECT ev.awb,ev.hawb,MIN(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas>0 THEN ev.pieces_extraidas END) AS min_pieces,MAX(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas>0 THEN ev.pieces_extraidas END) AS max_pieces FROM eventos_disc ev GROUP BY ev.awb,ev.hawb),
          final_classificacao AS (
            SELECT a.awb,a.hawb,bp.baseline_pecas,up.ultimo_evento_pecas,
              CASE WHEN bp.baseline_pecas IS NOT NULL AND a.min_pieces IS NOT NULL AND a.max_pieces IS NOT NULL AND a.min_pieces<>a.max_pieces AND NOT(up.ultimo_evento_pecas IS NOT NULL AND up.ultimo_evento_pecas=bp.baseline_pecas) AND COALESCE(ns.normalizado_soma_final,0)=0 THEN 1 ELSE 0 END AS pieces_discrepancy,
              CASE WHEN ua.ultimo_is_dis_event=1 THEN 1 ELSE 0 END AS has_dis_event,
              CASE WHEN ua.ultimo_is_dis_event=1 THEN 'DIS_ULTIMO_EVENTO' WHEN bp.baseline_pecas IS NOT NULL AND a.min_pieces IS NOT NULL AND a.max_pieces IS NOT NULL AND a.min_pieces<>a.max_pieces AND NOT(up.ultimo_evento_pecas IS NOT NULL AND up.ultimo_evento_pecas=bp.baseline_pecas) AND COALESCE(ns.normalizado_soma_final,0)=0 THEN 'DISCREPANCIA_REAL' ELSE 'SEM_DISCREPANCIA' END AS status_final
            FROM agregado_disc a LEFT JOIN baseline_pieces bp ON bp.awb=a.awb AND bp.hawb=a.hawb LEFT JOIN ultimo_evento_pecas up ON up.awb=a.awb AND up.hawb=a.hawb LEFT JOIN ultimo_evento_absoluto ua ON ua.awb=a.awb AND ua.hawb=a.hawb LEFT JOIN normalizado_por_soma_final ns ON ns.awb=a.awb AND ns.hawb=a.hawb
          )
          SELECT awb AS AWB,hawb AS HAWB,baseline_pecas AS BASELINE_PECAS,ultimo_evento_pecas AS ULTIMO_EVENTO_PECAS,pieces_discrepancy AS PIECES_DISCREPANCY,has_dis_event AS HAS_DIS_EVENT,status_final AS STATUS_FINAL
          FROM final_classificacao WHERE status_final IN ('DIS_ULTIMO_EVENTO','DISCREPANCIA_REAL')
        `;
        const discRows = await queryWithRetry(discSql);
        for (const dr of discRows || []) {
          discrepancyMap[`${dr.AWB||''}|${dr.HAWB||''}`] = { pieces_discrepancy: Number(dr.PIECES_DISCREPANCY)===1, baseline_pieces: dr.BASELINE_PECAS!=null?Number(dr.BASELINE_PECAS):null, has_dis_event: Number(dr.HAS_DIS_EVENT)===1 };
        }
        discrepancyCache = { at: Date.now(), data: discrepancyMap };
      } catch (err) {
        console.warn('Discrepancy query failed:', err.message);
        if (discrepancyCache) discrepancyMap = discrepancyCache.data;
      }
    }

    // Step 3e: route map (background refresh)
    let routeMap = {};
    const routeCacheStale = !routeCache || (Date.now() - routeCache.at >= CACHE_TTL);
    if (routeCache) routeMap = routeCache.data;

    if (routeCacheStale) {
      const activeAwbsRoute = [...new Set((rows||[]).map(r=>(r.AWB||'').toString().trim()).filter(a=>a.length>0))];
      const awbInClauseRoute = activeAwbsRoute.length > 0 ? `AND tda.awb_number IN (${activeAwbsRoute.map(a=>`'${a.replace(/'/g,"''")}'`).join(',')})` : 'AND 1=0';
      const routeSql = `
        WITH base_rota AS (
          SELECT tda.awb_number AS awb,tda.hawb_number AS hawb,tdaf.timeline_json,TRIM(COALESCE(tdaf.origin,'')) AS origin_raw,TRIM(COALESCE(tdaf.destination,'')) AS destination_raw
          FROM dados_dachser.t_dados_aereo tda
          INNER JOIN dados_dachser.t_fato_aereo tdaf ON tdaf.awb COLLATE utf8mb4_unicode_ci=tda.awb_number COLLATE utf8mb4_unicode_ci AND JSON_VALID(tdaf.hawbs_json) AND JSON_CONTAINS(tdaf.hawbs_json,JSON_ARRAY(tda.hawb_number))
          WHERE tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json) ${awbInClauseRoute}
        ),
        base_parse AS (
          SELECT b.awb,b.hawb,b.timeline_json,b.origin_raw,b.destination_raw,
            CASE WHEN b.origin_raw REGEXP '\\\\([A-Za-z]{3}\\\\)' THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(b.origin_raw,'(',-1),')',1))) WHEN b.origin_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(b.origin_raw)) ELSE NULL END COLLATE utf8mb4_unicode_ci AS origin_candidate_code,
            CASE WHEN b.destination_raw REGEXP '\\\\([A-Za-z]{3}\\\\)' THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(b.destination_raw,'(',-1),')',1))) WHEN b.destination_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(b.destination_raw)) ELSE NULL END COLLATE utf8mb4_unicode_ci AS destination_candidate_code,
            UPPER(TRIM(b.origin_raw)) COLLATE utf8mb4_unicode_ci AS origin_alias_key,
            UPPER(TRIM(b.destination_raw)) COLLATE utf8mb4_unicode_ci AS destination_alias_key
          FROM base_rota b
        ),
        base_resolvida AS (
          SELECT b.awb,b.hawb,b.timeline_json,
            COALESCE(ai_origin.iata_code,an_origin.iata_code,ac_origin.iata_code) AS origin_code,
            COALESCE(ai_dest.iata_code,an_dest.iata_code,ac_dest.iata_code) AS destination_code
          FROM base_parse b
          LEFT JOIN dados_dachser.t_iata_airports ai_origin ON ai_origin.iata_code COLLATE utf8mb4_unicode_ci=b.origin_candidate_code COLLATE utf8mb4_unicode_ci AND ai_origin.is_active=1
          LEFT JOIN dados_dachser.t_iata_airports an_origin ON UPPER(TRIM(an_origin.airport_name)) COLLATE utf8mb4_unicode_ci=b.origin_alias_key COLLATE utf8mb4_unicode_ci AND an_origin.is_active=1
          LEFT JOIN dados_dachser.t_iata_airports ac_origin ON UPPER(TRIM(ac_origin.city_name)) COLLATE utf8mb4_unicode_ci=b.origin_alias_key COLLATE utf8mb4_unicode_ci AND ac_origin.is_active=1
          LEFT JOIN dados_dachser.t_iata_airports ai_dest ON ai_dest.iata_code COLLATE utf8mb4_unicode_ci=b.destination_candidate_code COLLATE utf8mb4_unicode_ci AND ai_dest.is_active=1
          LEFT JOIN dados_dachser.t_iata_airports an_dest ON UPPER(TRIM(an_dest.airport_name)) COLLATE utf8mb4_unicode_ci=b.destination_alias_key COLLATE utf8mb4_unicode_ci AND an_dest.is_active=1
          LEFT JOIN dados_dachser.t_iata_airports ac_dest ON UPPER(TRIM(ac_dest.city_name)) COLLATE utf8mb4_unicode_ci=b.destination_alias_key COLLATE utf8mb4_unicode_ci AND ac_dest.is_active=1
        ),
        eventos_raw AS (SELECT b.awb,b.hawb,jt.ordem,TRIM(COALESCE(jt.location,'')) AS location_raw FROM base_resolvida b JOIN JSON_TABLE(b.timeline_json,'$[*]' COLUMNS(ordem FOR ORDINALITY,location VARCHAR(255) PATH '$.location')) jt WHERE jt.location IS NOT NULL AND TRIM(jt.location)<>''),
        eventos_parse AS (
          SELECT e.awb,e.hawb,e.ordem,e.location_raw,
            CASE WHEN e.location_raw REGEXP '\\\\([A-Za-z]{3}\\\\)' THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(e.location_raw,'(',-1),')',1))) WHEN e.location_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(e.location_raw)) ELSE NULL END COLLATE utf8mb4_unicode_ci AS location_candidate_code,
            UPPER(TRIM(e.location_raw)) COLLATE utf8mb4_unicode_ci AS location_alias_key
          FROM eventos_raw e
        ),
        eventos_resolvidos AS (
          SELECT e.awb,e.hawb,e.ordem,COALESCE(ai.iata_code,an.iata_code,ac.iata_code) AS location_code
          FROM eventos_parse e
          LEFT JOIN dados_dachser.t_iata_airports ai ON ai.iata_code COLLATE utf8mb4_unicode_ci=e.location_candidate_code COLLATE utf8mb4_unicode_ci AND ai.is_active=1
          LEFT JOIN dados_dachser.t_iata_airports an ON UPPER(TRIM(an.airport_name)) COLLATE utf8mb4_unicode_ci=e.location_alias_key COLLATE utf8mb4_unicode_ci AND an.is_active=1
          LEFT JOIN dados_dachser.t_iata_airports ac ON UPPER(TRIM(ac.city_name)) COLLATE utf8mb4_unicode_ci=e.location_alias_key COLLATE utf8mb4_unicode_ci AND ac.is_active=1
        ),
        eventos_validos AS (SELECT awb,hawb,ordem,location_code FROM eventos_resolvidos WHERE location_code IS NOT NULL AND TRIM(location_code)<>''),
        eventos_sem_rep AS (SELECT e.awb,e.hawb,e.ordem,e.location_code,LAG(e.location_code) OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem) AS prev FROM eventos_validos e),
        rota_timeline_limpa AS (SELECT awb,hawb,ordem,location_code FROM eventos_sem_rep WHERE prev IS NULL OR location_code COLLATE utf8mb4_unicode_ci<>prev COLLATE utf8mb4_unicode_ci),
        timeline_stats AS (SELECT awb,hawb,COUNT(*) AS qtd_pontos,COUNT(DISTINCT location_code) AS qtd_distintos FROM rota_timeline_limpa GROUP BY awb,hawb),
        primeiro_ultimo AS (
          SELECT x.awb,x.hawb,MAX(CASE WHEN x.rn_asc=1 THEN x.location_code END) AS first_code,MAX(CASE WHEN x.rn_desc=1 THEN x.location_code END) AS last_code
          FROM (SELECT r.awb,r.hawb,r.location_code,ROW_NUMBER() OVER(PARTITION BY r.awb,r.hawb ORDER BY r.ordem ASC) AS rn_asc,ROW_NUMBER() OVER(PARTITION BY r.awb,r.hawb ORDER BY r.ordem DESC) AS rn_desc FROM rota_timeline_limpa r) x
          GROUP BY x.awb,x.hawb
        ),
        rota_base_final AS (
          SELECT b.awb,b.hawb,
            CASE WHEN b.origin_code IS NOT NULL AND (b.destination_code IS NULL OR b.origin_code COLLATE utf8mb4_unicode_ci<>b.destination_code COLLATE utf8mb4_unicode_ci) THEN b.origin_code
                 WHEN b.origin_code IS NULL AND b.destination_code IS NULL AND ts.qtd_distintos>=2 AND p.first_code IS NOT NULL AND p.last_code IS NOT NULL AND p.first_code COLLATE utf8mb4_unicode_ci<>p.last_code COLLATE utf8mb4_unicode_ci THEN p.first_code
                 ELSE NULL END AS origin_final,
            CASE WHEN b.destination_code IS NOT NULL AND (b.origin_code IS NULL OR b.destination_code COLLATE utf8mb4_unicode_ci<>b.origin_code COLLATE utf8mb4_unicode_ci) THEN b.destination_code
                 WHEN b.origin_code IS NULL AND b.destination_code IS NULL AND ts.qtd_distintos>=2 AND p.first_code IS NOT NULL AND p.last_code IS NOT NULL AND p.first_code COLLATE utf8mb4_unicode_ci<>p.last_code COLLATE utf8mb4_unicode_ci THEN p.last_code
                 ELSE NULL END AS destination_final,
            ts.qtd_pontos,ts.qtd_distintos,p.first_code,p.last_code
          FROM base_resolvida b LEFT JOIN timeline_stats ts ON ts.awb=b.awb AND ts.hawb=b.hawb LEFT JOIN primeiro_ultimo p ON p.awb=b.awb AND p.hawb=b.hawb
        ),
        conexoes_inter AS (
          SELECT r.awb,r.hawb,GROUP_CONCAT(r.location_code ORDER BY r.ordem SEPARATOR ',') AS conexoes
          FROM rota_timeline_limpa r INNER JOIN rota_base_final f ON f.awb=r.awb AND f.hawb=r.hawb
          WHERE (f.origin_final IS NULL OR r.location_code COLLATE utf8mb4_unicode_ci<>f.origin_final COLLATE utf8mb4_unicode_ci)
            AND (f.destination_final IS NULL OR r.location_code COLLATE utf8mb4_unicode_ci<>f.destination_final COLLATE utf8mb4_unicode_ci)
          GROUP BY r.awb,r.hawb
        )
        SELECT f.awb AS AWB,f.hawb AS HAWB,f.origin_final AS ORIGEM_FINAL,f.destination_final AS DESTINO_FINAL,ci.conexoes AS CONEXOES,
          CASE WHEN f.origin_final IS NULL AND f.destination_final IS NULL THEN 'SEM_ORIGEM_DESTINO_CONFIAVEIS'
               WHEN f.origin_final IS NULL OR f.destination_final IS NULL THEN 'ROTA_INCOMPLETA'
               WHEN f.origin_final COLLATE utf8mb4_unicode_ci=f.destination_final COLLATE utf8mb4_unicode_ci THEN 'ORIGEM_DESTINO_IGUAIS'
               ELSE 'OK' END AS STATUS_ROTA
        FROM rota_base_final f LEFT JOIN conexoes_inter ci ON ci.awb=f.awb AND ci.hawb=f.hawb
      `;
      // run in background — don't block response
      queryWithRetry(routeSql).then(routeRows => {
        const fresh = {};
        for (const rr of routeRows || []) {
          fresh[`${rr.AWB||''}|${rr.HAWB||''}`] = { origin: rr.ORIGEM_FINAL||null, destination: rr.DESTINO_FINAL||null, conexoes: rr.CONEXOES||null, status: rr.STATUS_ROTA||'' };
        }
        routeCache = { at: Date.now(), data: fresh };
        console.log(`[ROUTE-BG] Cache refreshed: ${Object.keys(fresh).length} records`);
      }).catch(err => console.warn('[ROUTE-BG] Failed:', err.message));
    }

    // ─── Step 4: JS processing (idêntico à edge function) ───
    const IATA_WEIGHT = { POD:44,DLV:43,NFD:42,RCF:41,AWD:40,ARR:39,TRM:38,TFD:37,DEP:36,MAN:35,RCS:34,RCT:34,FOH:33,BKD:32,AWR:40,CCD:40,FWB:4,DOC:12,PRE:20,TRA:32,DIS:30,OFLD:28 };
    const VALID_IATA = new Set([...Object.keys(IATA_WEIGHT),'OFLD','NIL','NIF','DIS','TFD','RCT','TRM','POD','UNK']);
    const validate = c => { if (!c) return null; const u = c.toString().trim().toUpperCase(); return VALID_IATA.has(u)?u:null; };

    function resolveCode(desc) {
      if (!desc||desc==='null') return null;
      const upper = desc.toUpperCase();
      if (upper.includes('OFFLOADED')) return 'OFLD';
      if (upper.includes('READY FOR PICK-UP')||upper.includes('AGENT NOTIFIED')||upper.includes('NOTIFIED FOR DELIVERY')) return 'NFD';
      if (upper.includes('DOCUMENTS DELIVERED')) return 'AWD';
      if (upper.includes('RECEIVED FROM FLIGHT')) return 'RCF';
      if (upper.includes('RECEIVED FROM CARRIER')) return 'RCT';
      if (upper.includes('RECEIVED FROM SHIPPER')||upper.includes('READY FOR CARRIAGE')) return 'RCS';
      if (upper.includes('FREIGHT ON HAND')) return 'FOH';
      if (upper.includes('MANIFESTED')) return 'MAN';
      if (upper.includes('DEPARTED')) return 'DEP';
      if (upper.includes('ARRIVED')) return 'ARR';
      if (upper.includes('DELIVERED')) return 'DLV';
      for (const d of descLookup) { if (upper.startsWith(d.description)) return d.code; }
      return null;
    }

    function resolveCodeFromSlot(nativeCode, desc) {
      const native = (nativeCode||'').trim().toUpperCase();
      if (native && /^[A-Z]{2,5}$/.test(native)) { const v=validate(native); if(v) return v; }
      if (!desc||desc==='null') return null;
      const normDesc = normalizeDesc(desc);
      if (normDesc) { const exact=EXACT_MAP.get(normDesc); const v=validate(exact); if(v) return v; }
      if (normDesc) { for (const {needle,code} of KEYWORD_INDEX) { if(needle&&normDesc.includes(needle)){const v=validate(code);if(v)return v;} } }
      const ibs = desc.match(/\|\s*Code\s+([A-Z]{2,5})\s*\|/i);
      if (ibs) { const v=validate(ibs[1]); if(v) return v; }
      const startCode = desc.trim().match(/^([A-Z]{2,5})\b/);
      if (startCode) { const v=validate(startCode[1]); if(v) return v; }
      const paren = desc.match(/\(([A-Z]{2,5})\)/);
      if (paren) { const v=validate(paren[1]); if(v) return v; }
      return validate(resolveCode(desc));
    }

    function parseSlotDateMs(s) {
      if (!s) return 0;
      const direct = new Date(s).getTime();
      if (!isNaN(direct)&&direct>0) return direct;
      const m = String(s).match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/);
      if (m) { const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}; const mo=months[m[2].toLowerCase()]; if(mo!==undefined) return Date.UTC(parseInt(m[3]),mo,parseInt(m[1]),parseInt(m[4]||'0'),parseInt(m[5]||'0')); }
      return 0;
    }

    function pickTopByIATA(row) {
      const allSlots = [
        {code:resolveCodeFromSlot(row.code0_native,row.desc0),desc:row.desc0,loc:row.loc0,date:row.date0,idx:0},
        {code:resolveCodeFromSlot(row.code1_native,row.desc1),desc:row.desc1,loc:row.loc1,date:row.date1,idx:1},
        {code:resolveCodeFromSlot(row.code2_native,row.desc2),desc:row.desc2,loc:row.loc2,date:row.date2,idx:2},
        {code:resolveCodeFromSlot(row.code3_native,row.desc3),desc:row.desc3,loc:row.loc3,date:row.date3,idx:3},
        {code:resolveCodeFromSlot(row.code4_native,row.desc4),desc:row.desc4,loc:row.loc4,date:row.date4,idx:4},
        {code:resolveCodeFromSlot(row.code5_native,row.desc5),desc:row.desc5,loc:row.loc5,date:row.date5,idx:5},
      ].filter(s=>s.desc||s.code);
      if (allSlots.length===0) return {code:null,desc:null,loc:null,date:null,idx:-1};
      const isBkd = c => { const u=(c||'').toString().trim().toUpperCase(); return u==='BKD'||u==='BKG'||u==='BOOKED'; };
      const nonBkd = allSlots.filter(s=>!isBkd(s.code));
      const slots = nonBkd.length>0?nonBkd:allSlots;
      const slotsWithDate = slots.map(slot=>({...slot,dateMs:parseSlotDateMs(slot.date)}));
      const latestDateMs = Math.max(...slotsWithDate.map(s=>s.dateMs));
      if (latestDateMs<=0) return slots.reduce((b,s)=>s.idx<b.idx?s:b,slots[0]);
      const bestGroup = slotsWithDate.filter(s=>s.dateMs===latestDateMs);
      let winner=bestGroup[0], winnerW=IATA_WEIGHT[(winner.code||'').toUpperCase()]||0;
      for (let i=1;i<bestGroup.length;i++) { const w=IATA_WEIGHT[(bestGroup[i].code||'').toUpperCase()]||0; if(w>winnerW||(w===winnerW&&bestGroup[i].idx<winner.idx)){winner=bestGroup[i];winnerW=w;} }
      return winner;
    }

    const stopWordsConn = new Set([
      // Cargo status/event codes
      'NIL','NIF','DIS','OFD','OFL','BUP','RDP','LAT','TKG','SCR','ECC',
      'TFD','TRM','RFC','DMG','RET','AWB','PRE','DEP','ARR','RCF','RCS',
      'MAN','NFD','DLV','POD','BKD','BKG','BKF','FOH','AWD','CCD','ASN',
      'MOV','OFLD','FWB','DOC','AWR','TDE','LOF','TFS','MIS','BCBP','UNK',
      'TRA','PRD','RCP','CAN','LRC','FSH','FSU',
      // Common English words that appear in cargo descriptions and are not airport codes
      'AND','THE','FOR','BUT','NOT','ALL','ANY','ARE','OUR','ONE','TWO',
      'NEW','OLD','WAY','OUT','OFF','END','NOW','WHO','HOW','ITS','HIM',
      'HER','HIS','OWN','GET','PUT','SET','LET','HAS','HAD','USE','ACT',
      'AGE','AIR','FAR','YET','TOP','DAY','MAY','FLT','AGT','SHT',
    ]);

    const SUPPRESSED_DISCREPANCY_AWBS = new Set(['047-32916380']);

    const data = [];
    const failed = [];

    for (const row of rows || []) {
      let timeline = [];
      try { if (row.TIMELINE) { timeline = typeof row.TIMELINE==='string'?JSON.parse(row.TIMELINE):row.TIMELINE; } } catch {}

      const lastStatusCode = row.last_status_code||'';
      const top = pickTopByIATA(row);
      const codeFromTimeline = top.code;
      const routeKey = `${row.AWB||''}|${row.HAWB||''}`;
      const routeEntry = routeMap[routeKey];

      const allCodes = [top.code, resolveCodeFromSlot(row.code1_native,row.desc1), resolveCodeFromSlot(row.code2_native,row.desc2), resolveCodeFromSlot(row.code3_native,row.desc3), resolveCodeFromSlot(row.code4_native,row.desc4), resolveCodeFromSlot(row.code5_native,row.desc5)];
      const sanitizedLastStatus = (lastStatusCode||'').toString().toUpperCase().trim();
      const safeLastStatus = VALID_IATA.has(sanitizedLastStatus)?sanitizedLastStatus:null;
      const FINAL_STATUSES = new Set(['DLV','POD']);
      let finalCode;
      if (allCodes.some(c=>c&&FINAL_STATUSES.has(c))||FINAL_STATUSES.has(sanitizedLastStatus)) {
        finalCode = allCodes.some(c=>c==='POD')||sanitizedLastStatus==='POD'?'POD':'DLV';
      } else {
        finalCode = codeFromTimeline||safeLastStatus||null;
      }

      const electedLoc = top.loc||row.loc0||'';
      const electedDate = top.date||row.date0||'';

      if (finalCode==='ARR') {
        const loc = extractIATA(electedLoc);
        const authDest = routeEntry?.destination||null;
        const dest = authDest||extractIATA(row.DESTINO||'');
        if (dest&&loc&&loc===dest) finalCode='ARR - DESTINO';
        else if (authDest&&loc&&loc!==authDest) finalCode='ARR - CONEXÃO';
      }

      let dateStr = electedDate||null;
      if (!dateStr) dateStr = ((row.date0||'')+' '+(row.time0||'')).trim()||null;
      if (!dateStr&&timeline&&timeline.length>0) { for (const evt of timeline){const d=(evt.date||'').trim();if(d){dateStr=d;break;}} }

      let arrDestinoDate = null;
      const destIATA = routeEntry?.destination||extractIATA(row.DESTINO||'');
      if (destIATA&&timeline&&timeline.length>0) {
        for (const evt of timeline) {
          const desc=(evt.description||'').toUpperCase();
          const evtLoc=extractIATA(evt.location||'');
          if(desc.includes('ARRIVED')&&evtLoc===destIATA){const d=(evt.date||'').trim();if(d){arrDestinoDate=d;break;}}
        }
      }

      const hideReason = visibilityMap[routeKey]||'';
      let disc = discrepancyMap[routeKey]||{pieces_discrepancy:false,baseline_pieces:null,has_dis_event:false};
      if (SUPPRESSED_DISCREPANCY_AWBS.has(String(row.AWB||'').trim())) disc={pieces_discrepancy:false,baseline_pieces:null,has_dis_event:false};

      // Determine working origin/destination with origin=destination correction
      let workingOrigin = routeEntry?.origin||extractIATA(row.ORIGEM||'');
      let workingDest   = routeEntry?.destination||extractIATA(row.DESTINO||'');
      if (workingOrigin&&workingDest&&workingOrigin===workingDest&&timeline?.length>0) {
        const chronoScan=[...timeline].reverse();
        let foundAny=false, derivedDest=workingDest;
        for (const evt of chronoScan) {
          const loc=(evt.location||'').trim().toUpperCase();
          let apt=(loc.length===3&&!stopWordsConn.has(loc))?loc:null;
          if (!apt) {
            const d=(evt.description||'').toUpperCase();
            const m=d.match(/\b(?:FROM|IN|AT|DEPARTED|ARRIVED|TO)\s+([A-Z]{3})\b/);
            if(m&&!stopWordsConn.has(m[1]))apt=m[1];
          }
          if (!apt) continue;
          if (!foundAny){workingOrigin=apt;foundAny=true;}
          derivedDest=apt;
        }
        if(foundAny)workingDest=derivedDest;
      }
      const originIATAforConn=workingOrigin;
      const destinIATAforConn=workingDest;

      // Extract connections from timeline
      const seenAirports=[], seenSet=new Set();
      if (timeline&&timeline.length>0) {
        const chronological=[...timeline].reverse();
        let destReached=false;
        for (const evt of chronological) {
          if(destReached)break;
          const candidates=[];
          const loc=extractIATA(evt.location||'');
          if(loc)candidates.push(loc);
          const desc=(evt.description||'').toUpperCase();
          const evtPrefix=desc.match(/^\s*(?:DEP|ARR|RCF|RCS|MAN|NFD|DLV|TRM|TFD|FOH|AWD)\s+([A-Z]{3})\b/);
          if(evtPrefix)candidates.push(evtPrefix[1]);
          const prepMatch=desc.match(/\b(?:FROM|IN|AT|DEPARTED|ARRIVED)\s+([A-Z]{3})\b/);
          if(prepMatch)candidates.push(prepMatch[1]);
          const routeMatches=[...desc.matchAll(/\b([A-Z]{3})\s*(?:->|-|→|\/)\s*([A-Z]{3})\b/g)];
          for(const m of routeMatches){candidates.push(m[1]);candidates.push(m[2]);}
          const parenMatch=desc.match(/\(([A-Z]{3})\)/);
          if(parenMatch)candidates.push(parenMatch[1]);
          for(const apt of candidates){
            if(!apt||apt.length!==3)continue;
            if(stopWordsConn.has(apt))continue;
            if(apt===originIATAforConn||apt===destinIATAforConn)continue;
            if(seenSet.has(apt))continue;
            seenSet.add(apt);seenAirports.push(apt);
          }
          if(loc&&!stopWordsConn.has(loc)&&loc===destinIATAforConn)destReached=true;
        }
      }
      const conexao=seenAirports.length>0?seenAirports.join(','):null;

      const rawConexao=routeEntry?(routeEntry.conexoes||null):conexao;
      const finalConexao=rawConexao
        ?rawConexao.split(',').map(c=>c.trim()).filter(c=>c.length===3&&!stopWordsConn.has(c.toUpperCase())).join(',')||null
        :null;

      const finalOrigin=workingOrigin||row.ORIGEM||'';
      const finalDestination=workingDest||row.DESTINO||'';

      // Ground transport detection
      const hasGroundFlightPattern=val=>{const clean=(val||'').toUpperCase().replace(/\\\//g,'/').trim().replace(/[,;]\s*$/,'').replace(/\s+/g,' ');return /\b[A-Z]{2,3}\s?\d{2,5}-T\b/.test(clean)||/\b[A-Z]{2,3}\s?\d{2,5}\s*X\s*\/\s*D\b/.test(clean);};
      const electedDesc=String(top.desc||(row[`desc${top.idx}`])||'');
      let isGroundTransport=false;
      if(electedDesc&&hasGroundFlightPattern(electedDesc))isGroundTransport=true;

      if(!finalCode)failed.push({awb:row.AWB||'',hawb:row.HAWB||'',cliente:row.CLIENTE||''});

      data.push({
        awb_number:row.AWB||'', hawb_number:row.HAWB||'', consignee_nome:row.CLIENTE||clienteMap[row.HAWB]||'',
        tipo_servico:row.TIPO_SERVICO||'', etd:row.ETD||null,
        clerk:row.ANALISTA||'', origin:finalOrigin, destination:finalDestination, conexao:finalConexao,
        route_status:routeEntry?.status||null, timeline_json:timeline,
        last_event:finalCode||'', last_event_description:eventMap[finalCode]?.descricao_en||'',
        last_status_code:finalCode||'', last_event_date:dateStr, last_event_location:electedLoc,
        penultimate_location:row.loc1||'', arr_destino_date:arrDestinoDate, hide_reason:hideReason,
        pieces_discrepancy:disc.pieces_discrepancy, baseline_pieces:disc.baseline_pieces, has_dis_event:disc.has_dis_event,
        hours_in_status:row.hours_in_status_rounded!=null?Number(row.hours_in_status_rounded):null,
        sla_limite_horas:row.sla_limite_horas!=null?Number(row.sla_limite_horas):null,
        sla_ratio:row.sla_ratio!=null?Number(row.sla_ratio):null,
        sla_cor:row.sla_cor||null, sla_tempo_formatado:row.sla_tempo_formatado||null,
        sla_tooltip:row.sla_tooltip||null, is_ground_transport:isGroundTransport,
      });
    }

    // Filter hidden AWBs via Supabase REST (optional)
    let filteredData = data;
    try {
      const supaUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (supaUrl && supaKey) {
        const resp = await fetch(`${supaUrl}/rest/v1/air_hidden_awbs?select=awb`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } });
        if (resp.ok) {
          const hidden = await resp.json();
          const hiddenSet = new Set((hidden||[]).map(h=>String(h.awb).trim()));
          if (hiddenSet.size>0) filteredData = data.filter(d=>!hiddenSet.has(String(d.awb_number).trim()));
        }
      }
    } catch {}

    res.json({ success: true, data: filteredData, failed_count: failed.length });
  } catch (error) {
    const msg = (error?.message || String(error) || 'Unknown error');
    console.error('fetch-tracking-aereo error:', msg);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: msg });
    }
  }
});

// Express error handler — ensures JSON even for unhandled errors
app.use((err, req, res, _next) => {
  const msg = err?.message || String(err) || 'Internal error';
  console.error('[express]', msg);
  if (!res.headersSent) res.status(500).json({ success: false, error: msg });
});

app.listen(PORT, async () => {
  console.log(`\n✅ Servidor tracking-aereo rodando em http://localhost:${PORT}`);
  console.log(`   GET http://localhost:${PORT}/tracking-aereo\n`);

  // Validate DB connection at startup
  const cfg = {
    host: process.env.MARIADB_AIR_HOST || process.env.MARIADB_OPS_HOST,
    user: process.env.MARIADB_AIR_USER || process.env.MARIADB_OPS_USER,
    database: process.env.MARIADB_AIR_DATABASE || process.env.MARIADB_OPS_DATABASE,
  };
  if (!cfg.host || !cfg.user || !cfg.database) {
    console.error('⚠️  CREDENCIAIS MARIADB INCOMPLETAS no .env!');
    console.error('   Defina: MARIADB_AIR_HOST, MARIADB_AIR_USER, MARIADB_AIR_PASSWORD, MARIADB_AIR_DATABASE');
  } else {
    try {
      const db = getPool();
      const conn = await db.getConnection();
      conn.release();
      console.log(`✅ MariaDB conectado: ${cfg.user}@${cfg.host}/${cfg.database}`);
    } catch (err) {
      console.error(`❌ Falha ao conectar no MariaDB (${cfg.user}@${cfg.host}/${cfg.database}): ${err.message}`);
    }
  }
});
