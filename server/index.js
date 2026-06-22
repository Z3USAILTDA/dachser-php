// Local server — substitui a Supabase edge function fetch-tracking-aereo
// Rode com: node server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { Resend } from 'resend';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// ─── Configurações de schema/database por fase ──────────────────────────────
//
// Cada fase usa suas próprias variáveis MARIADB_<FASE>_*. Se a fase não tiver
// variáveis próprias definidas, cai no fallback genérico (DB_HOST/DB_USER/...).
// Isso permite que cada fase aponte para servidores/credenciais diferentes.
//
// Fase 1 (Auth)     → MARIADB_AUTH_*   | database: ai_agente
// Fase 2 (Air)      → MARIADB_AIR_*    | database: dados_dachser
// Fase 3 (Sea/Est.) → MARIADB_SEA_*    | database: dados_dachser
// Fase 4 (Draft)    → MARIADB_DRAFT_*  | database: dados_dachser
// Fase 5 (Admin)    → MARIADB_ADMIN_*  | database: ai_agente
// Fase 6 (Ops)      → MARIADB_OPS_*    | database: dados_dachser + ai_agente
//
// Se todas as fases estiverem no mesmo servidor, basta copiar os mesmos valores
// para cada conjunto de variáveis — a separação existe para permitir migração
// independente sem quebrar o restante.

const AIR_DB = process.env.MARIADB_AIR_DATABASE || process.env.DB_NAME || 'dados_dachser';

const ETD_CUTOFF = process.env.AIR_ETD_CUTOFF || '2026-06-01';

app.use(cors());
app.use(express.json());

// ─── In-memory caches (mesma lógica da edge function) ───
let discrepancyCache = null;
let routeCache = null;
const CACHE_TTL = 60_000;

// ─── Pool registry — um pool por fase (lazy init) ────────────────────────────
const _pools = {};

/**
 * Retorna (criando se necessário) um pool de conexão para a fase especificada.
 * @param {'air'|'auth'|'sea'|'draft'|'admin'|'ops'} phase
 */
function getPoolFor(phase) {
  if (_pools[phase]) return _pools[phase];

  const prefix = `MARIADB_${phase.toUpperCase()}`;
  const e = process.env;

  const host     = e[`${prefix}_HOST`]     || e.DB_HOST;
  const port     = parseInt(e[`${prefix}_PORT`]     || e.DB_PORT     || '3306');
  const database = e[`${prefix}_DATABASE`] || e.DB_NAME;
  const user     = e[`${prefix}_USER`]     || e.DB_USER     || undefined;
  const password = e[`${prefix}_PASSWORD`] || e.DB_PASSWORD || undefined;

  if (!host || !database) {
    throw new Error(
      `[pool:${phase}] Variáveis de ambiente incompletas. ` +
      `Defina ${prefix}_HOST e ${prefix}_DATABASE no .env`
    );
  }

  _pools[phase] = mysql.createPool({
    host, port, database, user, password,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 8000,
  });

  return _pools[phase];
}

// Atalhos por fase
const getPool      = () => getPoolFor('air');   // legado — air tracking usa este
const getAuthPool  = () => getPoolFor('auth');

async function queryWithRetry(sql, params = [], maxRetries = 1, phase = 'air') {
  const db = getPoolFor(phase);
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

// ─── Core: produz os dados do tracking aéreo (reutilizado por várias rotas) ───
async function computeTrackingData() {
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
        where tda.etd >= ?
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

    const rows = await queryWithRetry(sql, [ETD_CUTOFF]);
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
            WHERE tda.etd >= '${ETD_CUTOFF}' ${awbInClause} AND tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json)
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

    // Ocultação de AWBs é tratada via dados_dachser.t_air_process_visibility (hide_reason),
    // já incluído em cada item e aplicado no front. Sem dependência de Supabase nesta tela.
    return { success: true, data, failed_count: failed.length };
}

// ─── Route handlers (/api/air/*) ───

async function handleTrackingAereo(_req, res) {
  try {
    const result = await computeTrackingData();
    console.log(`[tracking-aereo] ${result.data.length} registros (${result.failed_count} falhas de rastreio)`);
    res.json(result);
  } catch (error) {
    const msg = error?.message || String(error) || 'Unknown error';
    console.error('[tracking-aereo] error:', msg);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Falha ao carregar tracking aéreo.' });
  }
}

// Opções de filtro derivadas do banco (companhias, analistas, serviços).
async function handleFilters(_req, res) {
  try {
    const { data } = await computeTrackingData();
    const airlines = [...new Set(data.map(d => (d.awb_number || '').substring(0, 3)).filter(Boolean))].sort();
    const analysts = [...new Set(data.map(d => (d.clerk || '').trim()).filter(Boolean))].sort();
    const services = [...new Set(data.map(d => (d.tipo_servico || '').trim()).filter(Boolean))].sort();
    res.json({ success: true, filters: { airlines, analysts, services } });
  } catch (error) {
    console.error('[tracking-aereo/filters] error:', error?.message || error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Falha ao carregar filtros.' });
  }
}

// Métricas agregadas para os cards (visão geral, sem filtros de UI).
async function handleSummary(_req, res) {
  try {
    const { data } = await computeTrackingData();
    const inTransit = new Set(['DEP', 'MAN', 'RCF', 'ARR']);
    const criticalCodes = new Set(['NIL', 'NIF', 'OFLD']);
    let total = 0, transit = 0, alert = 0, critical = 0;
    for (const a of data) {
      const code = (a.last_status_code || a.last_event || '').toUpperCase().trim();
      if (code === 'DLV' || code === 'POD') continue;
      if (a.hide_reason) continue;
      total++;
      if (inTransit.has(code)) transit++;
      if (code === 'DIS' || (a.has_dis_event && !a.pieces_discrepancy)) alert++;
      if (criticalCodes.has(code) || a.pieces_discrepancy) critical++;
    }
    res.json({ success: true, summary: { total, transit, alert, critical } });
  } catch (error) {
    console.error('[tracking-aereo/summary] error:', error?.message || error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Falha ao carregar métricas.' });
  }
}

// Best-effort: registra AWBs com falha de rastreio (e-mail de alerta fica pendente).
async function handleFailedAlert(req, res) {
  const awbs = Array.isArray(req.body?.awbs) ? req.body.awbs : [];
  console.log(`[tracking-aereo] failed-alert: ${awbs.length} AWB(s) com falha de rastreio`);
  res.json({ success: true, count: awbs.length, emailed: false });
}

// Badges de troca de master para os AWBs visíveis.
async function handleMasterSwaps(req, res) {
  try {
    const awbs = Array.isArray(req.body?.awbs)
      ? req.body.awbs.filter(x => x && typeof x === 'string')
      : [];
    if (awbs.length === 0) return res.json({ success: true, data: [] });
    const ph = awbs.map(() => '?').join(',');
    const rows = await queryWithRetry(
      `SELECT id, hawb, awb_antigo, awb_novo, fonte, id_olss,
              flight_number, departure_airport, destination_airport,
              data_atualizacao, flag_troca_master, resolvido_manual
         FROM ${AIR_DB}.t_aereo_master_swap
        WHERE TRIM(awb_novo) COLLATE utf8mb4_unicode_ci IN (${ph})
        ORDER BY data_atualizacao DESC`,
      awbs.map(a => a.trim())
    );
    res.json({ success: true, data: rows || [] });
  } catch (e) {
    console.warn('[master-swaps]', e.message);
    res.json({ success: true, data: [] });
  }
}

// Discrepâncias pendentes de troca de master.
async function handleDiscrepancyList(_req, res) {
  try {
    const rows = await queryWithRetry(
      `SELECT id, hawb, id_olss, data_inclusao_nova, awbs_candidatos,
              status, awb_escolhido, resolvido_em, resolvido_por, created_at
         FROM ${AIR_DB}.t_aereo_master_discrepancia
        WHERE status = 'PENDENTE'
        ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows || [] });
  } catch (e) {
    console.warn('[master-discrepancies]', e.message);
    res.json({ success: true, data: [] });
  }
}

// Resolve uma discrepância escolhendo o master correto.
async function handleDiscrepancyResolve(req, res) {
  try {
    const id = Number(req.body?.id);
    const awbEscolhido = (req.body?.awb_escolhido || '').toString().trim();
    const user = (req.body?.user || 'system').toString();
    if (!id || !awbEscolhido) {
      return res.status(400).json({ success: false, error: 'id e awb_escolhido são obrigatórios.' });
    }
    const discRows = await queryWithRetry(
      `SELECT id, hawb, id_olss, data_inclusao_nova, awbs_candidatos
         FROM ${AIR_DB}.t_aereo_master_discrepancia
        WHERE id = ? AND status = 'PENDENTE' LIMIT 1`,
      [id]
    );
    if (!discRows || discRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Discrepância não encontrada.' });
    }
    const disc = discRows[0];
    let candidatos = [];
    try {
      candidatos = typeof disc.awbs_candidatos === 'string'
        ? JSON.parse(disc.awbs_candidatos)
        : (disc.awbs_candidatos || []);
    } catch { candidatos = []; }
    const descartados = candidatos.filter(a => a !== awbEscolhido);

    for (const awbAntigo of descartados) {
      try {
        await queryWithRetry(
          `INSERT IGNORE INTO ${AIR_DB}.t_aereo_master_swap
             (hawb, awb_antigo, awb_novo, fonte, id_olss, data_atualizacao, flag_troca_master, resolvido_manual)
           VALUES (?, ?, ?, 'DADOS_AEREO', ?, NOW(), 1, 1)`,
          [disc.hawb, awbAntigo, awbEscolhido, disc.id_olss]
        );
      } catch (e) { console.warn('[disc_resolve insert swap]', e.message); }
      try {
        await queryWithRetry(
          `UPDATE ${AIR_DB}.t_fato_aereo
              SET last_status_code = 'DLV'
            WHERE TRIM(awb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
              AND TRIM(COALESCE(hawb,'')) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci`,
          [awbAntigo, disc.hawb]
        );
      } catch (e) { console.warn('[disc_resolve dlv]', e.message); }
    }

    await queryWithRetry(
      `UPDATE ${AIR_DB}.t_aereo_master_discrepancia
          SET status='RESOLVIDA', awb_escolhido=?, resolvido_em=NOW(), resolvido_por=?
        WHERE id = ?`,
      [awbEscolhido, user, id]
    );
    res.json({ success: true, descartados, awb_escolhido: awbEscolhido });
  } catch (e) {
    console.error('[master-discrepancies/resolve]', e.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Falha ao resolver discrepância.' });
  }
}

// Log de uso/telemetria da tela (best-effort).
async function handleUsageLog(req, res) {
  try {
    const { username, endpoint, method, sessionId, eventType, durationMs } = req.body || {};
    if (!username || !endpoint || username === 'unknown') return res.json({ success: true });

    let storedMethod = method || 'GET';
    let storedEndpoint = endpoint;
    if (eventType === 'view_start') {
      storedMethod = 'VI';
    } else if (eventType === 'view_end') {
      storedMethod = 'VO';
      if (typeof durationMs === 'number' && durationMs >= 0) {
        storedEndpoint = `${endpoint}#dur=${Math.round(durationMs)}`;
      }
    }
    const safeMethod = String(storedMethod).slice(0, 4);
    await queryWithRetry(
      `INSERT INTO dados_dachser.t_usage_logs (username, endpoint, method, session_id, event_time)
       VALUES (?, ?, ?, ?, NOW())`,
      [username, storedEndpoint, safeMethod, sessionId || null]
    );
    res.json({ success: true });
  } catch (e) {
    console.warn('[usage-log]', e.message);
    res.json({ success: true });
  }
}

// ─── Auth routes (/api/auth/*) ──────────────────────────────────────────────
// Pool: MARIADB_AUTH_* (Fase 1) — database padrão: ai_agente

const AUTH_USERS_TABLE = process.env.AUTH_USERS_TABLE || 'dados_dachser.t_users_dachser';
const AUTH_CODES_TABLE = process.env.AUTH_CODES_TABLE || 'dados_dachser.t_password_reset';

// Instância do Resend (reaproveitada entre requisições)
const resend = new Resend(process.env.RESEND_API_KEY);

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios.' });
    }
    const db = getAuthPool();

    const [rows] = await db.query(
      `SELECT id, email, username, password_hash,
              is_admin, must_change_password, olimpo_only, metrics_only,
              esteira_role, esteira_active, supervisor_id
         FROM ${AUTH_USERS_TABLE}
        WHERE username = ?
        LIMIT 1`,
      [username.trim()]
    );

    if (!rows || rows.length === 0) {
      console.warn(`[auth/login] Usuário não encontrado: "${username}"`);
      return res.status(401).json({ success: false, error: 'Usuário ou Senha incorretos.' });
    }
    const user = rows[0];

    const storedHash = user.password_hash || '';
    console.log(`[auth/login] Usuário encontrado: id=${user.id}, hash_prefix="${storedHash.substring(0, 10)}...", hash_len=${storedHash.length}`);

    let passwordOk = false;
    const bcrypt = await import('bcryptjs').catch(() => null);
    if (bcrypt && storedHash.startsWith('$2')) {
      console.log('[auth/login] Tentando bcrypt compare...');
      passwordOk = await bcrypt.default.compare(password, storedHash);
      console.log(`[auth/login] bcrypt result: ${passwordOk}`);
    } else {
      const crypto = await import('crypto');
      const md5    = crypto.default.createHash('md5').update(password).digest('hex');
      const sha256 = crypto.default.createHash('sha256').update(password).digest('hex');
      const sha1   = crypto.default.createHash('sha1').update(password).digest('hex');
      console.log(`[auth/login] Comparando hashes — md5=${md5.substring(0,8)}... sha256=${sha256.substring(0,8)}... sha1=${sha1.substring(0,8)}... stored=${storedHash.substring(0,8)}...`);
      passwordOk = storedHash === md5
                || storedHash === sha256
                || storedHash === sha1
                || storedHash === password;
      console.log(`[auth/login] hash match: ${passwordOk}`);
    }

    if (!passwordOk) {
      console.warn(`[auth/login] Senha incorreta para usuário "${username}"`);
      return res.status(401).json({ success: false, error: 'Usuário ou Senha incorretos.' });
    }

    const { password_hash: _h, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao autenticar.' });
  }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, esteira_role } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Usuário, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres.' });
    }

    const db = getAuthPool();

    // Verifica duplicidade
    const [existing] = await db.query(
      `SELECT id FROM ${AUTH_USERS_TABLE} WHERE username = ? OR email = ? LIMIT 1`,
      [username.trim(), email.trim()]
    );
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Usuário ou e-mail já cadastrado.' });
    }

    let hashedPassword = password;
    const bcrypt = await import('bcryptjs').catch(() => null);
    if (bcrypt) {
      hashedPassword = await bcrypt.default.hash(password, 10);
    }

    const [result] = await db.query(
      `INSERT INTO ${AUTH_USERS_TABLE}
         (username, email, password_hash, is_admin, must_change_password, esteira_role, esteira_active)
       VALUES (?, ?, ?, 0, 1, ?, 1)`,
      [username.trim(), email.trim(), hashedPassword, esteira_role || null]
    );

    // Envia e-mail de boas-vindas via Resend (best-effort)
    if (process.env.RESEND_API_KEY) {
      try {
        const u = username.trim();
        const logoLight = 'https://i.ibb.co/TgXzCqz/logo-preto.png';
        const logoDark  = 'https://i.ibb.co/sJkY7y5/logo-branco.png';
        const accessUrl = 'https://dachser.z3us.app';

        const htmlBody = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Boas-vindas</title>
<style>
  .bg{background:#fff}
  .panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}
  .text{color:#111}.muted{color:#666}
  .btn{display:inline-block;background:#ffa500;color:#111;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 20px}
  @media (prefers-color-scheme: dark){
    .bg{background:#0b0b0b!important}
    .panel{background:#141414!important;border-color:#262626!important}
    .text{color:#ededed!important}.muted{color:#bdbdbd!important}
    .logo-light{display:none!important}.logo-dark{display:block!important}
  }
</style>
</head>
<body class="bg" style="margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
        <tr><td style="padding:28px 28px 0" align="center">
          <img src="${logoLight}" width="120" alt="Z3US" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
          <img src="${logoDark}" width="120" alt="Z3US" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
        </td></tr>
        <tr><td style="padding:8px 28px 0" align="left" class="text">
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Bem-vindo(a), ${u}!</h1>
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            Sua conta foi criada com sucesso no <span style="color:inherit;text-decoration:none">Z3US&#8203;.AI</span> @ Dachser
            (<a href="${accessUrl}" target="_blank" rel="noopener" style="color:#ffa500;text-decoration:none">dachser.z3us.app</a>).
            Seguem seus dados iniciais de acesso:
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 12px" align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Usuário:</b> ${u}</td></tr>
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Senha atual:</b> <code style="font-family:Consolas,monospace;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,.06)">${password}</code></td></tr>
          </table>
          <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px" class="muted">Por segurança, altere sua senha no primeiro acesso.</p>
        </td></tr>
        <tr><td style="padding:10px 28px 22px" align="left">
          <a href="${accessUrl}" class="btn" style="font-family:Arial,Helvetica,sans-serif">Alterar senha</a>
        </td></tr>
        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">Caso não tenha solicitado este cadastro, ignore este e-mail.</p>
        </td></tr>
      </table>
      <div style="height:20px;line-height:20px">&nbsp;</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;text-align:center" class="muted">
        © Z3US — Esta é uma mensagem automática.
      </div>
    </td></tr>
  </table>
</body>
</html>`;

        const textBody = `Bem-vindo(a), ${u}!\n\nSua conta foi criada com sucesso no Z3US.AI @ Dachser (dachser.z3us.app).\nUsuário: ${u}\nSenha temporária: ${password}\n\nAlterar senha: ${accessUrl}\n\nPor segurança, altere a senha no primeiro acesso.`;

        await resend.emails.send({
          from: 'Z3US.AI - DACHSER <noreply@hermes.z3us.ai>',
          to: email.trim(),
          subject: 'Bem-vindo(a) ao Z3US',
          html: htmlBody,
          text: textBody,
        });
      } catch (mailErr) {
        console.warn('[auth/register] Falha ao enviar e-mail:', mailErr.message);
      }
    }

    res.json({ success: true, user: { id: result.insertId, username: username.trim(), email: email.trim() } });
  } catch (err) {
    console.error('[auth/register]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao cadastrar usuário.' });
  }
});

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'E-mail é obrigatório.' });

    const db = getAuthPool();
    const [users] = await db.query(
      `SELECT id, username, email FROM ${AUTH_USERS_TABLE} WHERE email = ? LIMIT 1`,
      [email.trim()]
    );
    if (!users || users.length === 0) {
      // Responde sucesso mesmo se e-mail não encontrado (não vaza informação)
      return res.json({ success: true });
    }
    const user = users[0];

    // Gera código de 6 dígitos
    const { default: crypto } = await import('crypto');
    const code = String(Math.floor(100000 + crypto.randomInt(900000)));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await db.query(
      `INSERT INTO ${AUTH_CODES_TABLE} (user_id, email, code, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())
       ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), used = 0, created_at = NOW()`,
      [user.id, email.trim(), code, expiresAt]
    );

    const resendFrom = process.env.RESEND_FROM || 'noreply@z3us.ai';
    if (process.env.RESEND_API_KEY) {
      const { error: mailError } = await resend.emails.send({
        from: resendFrom,
        to: email.trim(),
        subject: 'Código de recuperação de senha — DACHSER',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px">
            <h2 style="color:#041021;margin-bottom:8px">Recuperação de Senha</h2>
            <p style="color:#374151">Olá, <b>${user.username}</b>!</p>
            <p style="color:#374151">Seu código de verificação é:</p>
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;text-align:center;margin:20px 0">
              <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#041021">${code}</span>
            </div>
            <p style="color:#6b7280;font-size:14px">Este código expira em <b>15 minutos</b>.</p>
            <p style="color:#6b7280;font-size:13px">Se não foi você quem solicitou, ignore este e-mail.</p>
          </div>`,
      });
      if (mailError) {
        console.error('[auth/forgot-password] Resend error:', mailError);
      }
    } else {
      console.warn('[auth/forgot-password] RESEND_API_KEY não configurada — código gerado mas e-mail não enviado:', code);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao enviar código de recuperação.' });
  }
});

// POST /api/auth/verify-reset-code
app.post('/api/auth/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ success: false, error: 'E-mail e código são obrigatórios.' });

    const db = getAuthPool();
    const [rows] = await db.query(
      `SELECT rc.id, rc.user_id, u.username
         FROM ${AUTH_CODES_TABLE} rc
         JOIN ${AUTH_USERS_TABLE} u ON u.id = rc.user_id
        WHERE rc.email = ? AND rc.code = ? AND rc.used = 0 AND rc.expires_at > NOW()
        ORDER BY rc.created_at DESC LIMIT 1`,
      [email.trim(), String(code).trim()]
    );
    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Código inválido ou expirado.' });
    }
    const row = rows[0];

    // Marca código como usado
    await db.query(`UPDATE ${AUTH_CODES_TABLE} SET used = 1 WHERE id = ?`, [row.id]);

    res.json({ success: true, user: { id: row.user_id, username: row.username } });
  } catch (err) {
    console.error('[auth/verify-reset-code]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao verificar código.' });
  }
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, password, username } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres.' });

    const db = getAuthPool();

    // Hash bcrypt se disponível
    let hashedPassword = password;
    const bcrypt = await import('bcryptjs').catch(() => null);
    if (bcrypt) {
      hashedPassword = await bcrypt.default.hash(password, 10);
    }

    await db.query(
      `UPDATE ${AUTH_USERS_TABLE} SET password_hash = ?, must_change_password = 0 WHERE email = ?`,
      [hashedPassword, email.trim()]
    );

    if (username) {
      try {
        await db.query(
          `INSERT INTO dados_dachser.t_usage_logs (username, endpoint, method, session_id, event_time)
           VALUES (?, ?, ?, NULL, NOW())`,
          [username, '/reset-password', 'POST']
        );
      } catch { /* uso log é best-effort */ }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao redefinir senha.' });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, password } = req.body || {};
    if (!userId || !password) return res.status(400).json({ success: false, error: 'userId e senha são obrigatórios.' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres.' });

    const db = getAuthPool();

    let hashedPassword = password;
    const bcrypt = await import('bcryptjs').catch(() => null);
    if (bcrypt) {
      hashedPassword = await bcrypt.default.hash(password, 10);
    }

    await db.query(
      `UPDATE ${AUTH_USERS_TABLE} SET password_hash = ?, must_change_password = 0 WHERE id = ?`,
      [hashedPassword, Number(userId)]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[auth/change-password]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao alterar senha.' });
  }
});

// ═══════════════════════════════════════════════════════════
//  FASE 2 — CHECK AWB × CNPJ
// ═══════════════════════════════════════════════════════════

const CHECK_TABLE    = 'dados_dachser.t_awb_check';
const PARSED_TABLE   = 'dados_dachser.t_awb_parsed';
const DOCUMENT_TABLE = 'dados_dachser.t_awb_document';
const LOG_TABLE      = 'dados_dachser.t_awb_check_log';
const MATRIX_TABLE   = 'dados_dachser.t_awb_rule_matrix';
const RULE_TABLE     = 'dados_dachser.t_awb_rule_row';

const getCheckPool = () => getPoolFor('air');

// GET /api/air/check-awb — lista validações com JOIN completo
app.get('/api/air/check-awb', async (req, res) => {
  try {
    const db = getCheckPool();
    const [rows] = await db.query(`
      SELECT
        c.*,
        p.extracted_awb, p.extracted_cnpj, p.extracted_origin, p.extracted_destination,
        p.extracted_customer, p.confidence_score, p.shipper, p.consignee, p.carrier,
        p.gross_weight_kg, p.chargeable_weight_kg, p.mrn, p.routing_legs,
        p.flight_numbers, p.hs_codes, p.dims, p.incoterms, p.references,
        d.filename  AS hawb_file_name,
        d.id        AS hawb_document_id,
        r.email_despachante AS rule_email,
        r.airport_code      AS rule_airport,
        r.ref_othello       AS rule_ref_othello
      FROM ${CHECK_TABLE} c
      LEFT JOIN ${PARSED_TABLE}   p ON p.awb_check_id = c.id
      LEFT JOIN ${DOCUMENT_TABLE} d ON d.id = p.document_id
      LEFT JOIN ${RULE_TABLE}     r ON r.id = c.matched_rule_id
      ORDER BY c.created_at DESC
      LIMIT 200
    `);
    res.json({ success: true, checks: rows });
  } catch (err) {
    console.error('[check-awb/list]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar validações.' });
  }
});

// DELETE /api/air/check-awb/:id
app.delete('/api/air/check-awb/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { performed_by } = req.body || {};
    const db = getCheckPool();

    const [parsedRows] = await db.query(
      `SELECT document_id FROM ${PARSED_TABLE} WHERE awb_check_id = ? LIMIT 1`, [id]
    );
    const documentId = parsedRows[0]?.document_id;

    await db.query(`DELETE FROM ${PARSED_TABLE}   WHERE awb_check_id = ?`, [id]);
    if (documentId) {
      await db.query(`DELETE FROM ${DOCUMENT_TABLE} WHERE id = ?`, [documentId]);
    }
    await db.query(`DELETE FROM ${CHECK_TABLE} WHERE id = ?`, [id]);
    await db.query(
      `INSERT INTO ${LOG_TABLE} (action, entity_type, entity_id, performed_by) VALUES ('delete', 'awb_check', ?, ?)`,
      [id, performed_by || 'system']
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('[check-awb/delete]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao excluir validação.' });
  }
});

// POST /api/air/check-awb/upload — salva arquivo como BLOB em t_awb_document
app.post('/api/air/check-awb/upload', async (req, res) => {
  try {
    const { fileName, mimeType, fileBase64, uploadedBy } = req.body || {};
    if (!fileName || !fileBase64) {
      return res.status(400).json({ success: false, error: 'fileName e fileBase64 são obrigatórios.' });
    }
    const db = getCheckPool();
    const buffer = Buffer.from(fileBase64, 'base64');
    const [result] = await db.query(
      `INSERT INTO ${DOCUMENT_TABLE} (filename, file_type, file_size, file_content, uploaded_by) VALUES (?, ?, ?, ?, ?)`,
      [fileName, mimeType || 'application/pdf', buffer.length, buffer, uploadedBy || null]
    );
    res.json({ success: true, documentId: result.insertId });
  } catch (err) {
    console.error('[check-awb/upload]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao salvar documento.' });
  }
});

// GET /api/air/check-awb/document/:id — devolve binário do arquivo
app.get('/api/air/check-awb/document/:id', async (req, res) => {
  try {
    const db = getCheckPool();
    const [rows] = await db.query(
      `SELECT filename, file_type, file_content FROM ${DOCUMENT_TABLE} WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows || rows.length === 0 || !rows[0].file_content) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado.' });
    }
    const doc = rows[0];
    res.setHeader('Content-Type', doc.file_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
    res.send(doc.file_content);
  } catch (err) {
    console.error('[check-awb/document]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao servir documento.' });
  }
});

// POST /api/air/check-awb/parse — extrai dados do PDF/imagem via Claude
app.post('/api/air/check-awb/parse', async (req, res) => {
  try {
    const { fileBase64, mimeType = 'application/pdf', documentType = 'house_awb' } = req.body || {};
    if (!fileBase64) return res.status(400).json({ success: false, error: 'fileBase64 é obrigatório.' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY não configurada.' });

    let systemPrompt, userPrompt;
    if (documentType === 'house_awb') {
      systemPrompt = `Você é um especialista em extração de dados de documentos AWB (Air Waybill) e House AWB para operações logísticas.
Extraia as informações com ALTA PRECISÃO seguindo estas REGRAS:
1. CNPJ: EXATAMENTE 14 dígitos numéricos. Ignore sufixos como "01-76".
2. ORIGEM: Código IATA. Se não explícito, deduza do prefixo AWB (HAJ-xxxxx → HAJ)
3. DESTINO: Código IATA da cidade do destinatário (São Paulo=GRU, Rio=GIG, Curitiba=CWB, Viracopos=VCP)
4. CLIENTE: Procure "KLABIN" ou "ZF" no shipper/consignee
5. AWB NUMBER: Formato XXX-XXXXXXXX ou XXX XXXX XXXX
Retorne APENAS JSON válido.`;
      userPrompt = `Analise este documento AWB/HAWB e retorne JSON:
{
  "awbNumber": "string (XXX-XXXXXXXX) ou null",
  "cnpj": "string (14 dígitos sem formatação) ou null",
  "origin": "string (código IATA 3 letras) ou null",
  "destination": "string (código IATA 3 letras) ou null",
  "shipper": "string (NOME + ENDEREÇO COMPLETO) ou null",
  "consignee": "string (NOME + ENDEREÇO + TELEFONE + CNPJ) ou null",
  "customer": "KLABIN ou ZF ou null",
  "carrier": "string (código 2 letras da cia aérea) ou null",
  "grossWeight": "number (kg) ou null",
  "chargeableWeight": "number (kg) ou null",
  "routingLegs": ["array IATA"] ou null,
  "flightNumbers": ["array voos"] ou null,
  "mrn": "string ou null",
  "hsCodes": ["array NCM/HS"] ou null,
  "dimensions": "string ou null",
  "incoterms": "string ou null",
  "references": ["array refs/POs"] ou null,
  "confidence": "high | medium | low"
}`;
    } else {
      systemPrompt = `Você é um especialista em documentos de instrução logística. Extraia padrões de sufixo CNPJ.`;
      userPrompt = `Extraia sufixo CNPJ e retorne JSON:
{
  "cnpjSuffix": "string (4 dígitos) ou null",
  "cnpjSuffixes": [{ "suffix": "string", "criteria": "string", "addressPattern": "string ou null" }],
  "defaultSuffix": "string ou null",
  "references": ["array de padrões XX-XX"],
  "confidence": "high | medium | low"
}`;
    }

    const isImage = mimeType.startsWith('image/');
    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } };

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: userPrompt }] }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[check-awb/parse] Claude API error:', claudeRes.status, errText);
      return res.status(502).json({ success: false, error: 'Erro ao chamar API de extração.' });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ success: false, error: 'Resposta inválida da API de extração.' });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ success: true, ...parsed });
  } catch (err) {
    console.error('[check-awb/parse]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao extrair dados do documento.' });
  }
});

// POST /api/air/check-awb — cria validação (t_awb_check + t_awb_parsed)
app.post('/api/air/check-awb', async (req, res) => {
  try {
    const {
      awbNumber, cnpj, origin, destination, customer,
      validationStatus, validationMessage, matchedRuleId, createdBy,
      documentId,
      extractedAwb, extractedCnpj, extractedOrigin, extractedDestination, extractedCustomer,
      confidenceScore, shipper, consignee, carrier, grossWeight, chargeableWeight,
      mrn, routingLegs, flightNumbers, hsCodes, dimensions, incoterms, references,
    } = req.body || {};

    const db = getCheckPool();
    const [checkResult] = await db.query(
      `INSERT INTO ${CHECK_TABLE}
         (awb_number, cnpj, origin, destination, customer, validation_status, validation_message, matched_rule_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [awbNumber || 'N/A', cnpj || 'N/A', origin || 'N/A', destination || 'N/A',
       customer || null, validationStatus || 'pending', validationMessage || null,
       matchedRuleId || null, createdBy || null]
    );
    const checkId = checkResult.insertId;

    await db.query(
      `INSERT INTO ${PARSED_TABLE}
         (awb_check_id, document_id, extracted_awb, extracted_cnpj, extracted_origin,
          extracted_destination, extracted_customer, confidence_score, shipper, consignee,
          carrier, gross_weight_kg, chargeable_weight_kg, mrn, routing_legs, flight_numbers,
          hs_codes, dims, incoterms, references)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [checkId, documentId || null, extractedAwb || null, extractedCnpj || null,
       extractedOrigin || null, extractedDestination || null, extractedCustomer || null,
       confidenceScore || null, shipper || null, consignee || null,
       carrier || null, grossWeight || null, chargeableWeight || null,
       mrn || null,
       routingLegs ? JSON.stringify(routingLegs) : null,
       flightNumbers ? JSON.stringify(flightNumbers) : null,
       hsCodes ? JSON.stringify(hsCodes) : null,
       dimensions || null, incoterms || null,
       references ? JSON.stringify(references) : null]
    );

    res.json({ success: true, checkId });
  } catch (err) {
    console.error('[check-awb/create]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao salvar validação.' });
  }
});

// PATCH /api/air/check-awb/:id/parsed — reatualiza dados extraídos
app.patch('/api/air/check-awb/:id/parsed', async (req, res) => {
  try {
    const checkId = Number(req.params.id);
    const { shipper, consignee, carrier, grossWeight, chargeableWeight, mrn,
            routingLegs, flightNumbers, hsCodes, dimensions, incoterms, references,
            extractedAwb, extractedCnpj, extractedOrigin, extractedDestination, extractedCustomer } = req.body || {};
    const db = getCheckPool();
    await db.query(
      `UPDATE ${PARSED_TABLE}
         SET shipper=?, consignee=?, carrier=?, gross_weight_kg=?, chargeable_weight_kg=?,
             mrn=?, routing_legs=?, flight_numbers=?, hs_codes=?, dims=?, incoterms=?,
             references=?, extracted_awb=?, extracted_cnpj=?, extracted_origin=?,
             extracted_destination=?, extracted_customer=?
       WHERE awb_check_id=?`,
      [shipper||null, consignee||null, carrier||null, grossWeight||null, chargeableWeight||null,
       mrn||null,
       routingLegs ? JSON.stringify(routingLegs) : null,
       flightNumbers ? JSON.stringify(flightNumbers) : null,
       hsCodes ? JSON.stringify(hsCodes) : null,
       dimensions||null, incoterms||null,
       references ? JSON.stringify(references) : null,
       extractedAwb||null, extractedCnpj||null, extractedOrigin||null,
       extractedDestination||null, extractedCustomer||null, checkId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[check-awb/patch-parsed]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao atualizar dados.' });
  }
});

// GET /api/air/check-awb/matrices — lista matrizes de regras
app.get('/api/air/check-awb/matrices', async (req, res) => {
  try {
    const db = getCheckPool();
    const [rows] = await db.query(
      `SELECT * FROM ${MATRIX_TABLE} ORDER BY customer, version DESC`
    );
    const matrices = rows.map(m => ({ ...m, is_active: Boolean(m.is_active), effective_from: m.effective_date }));
    res.json({ success: true, matrices });
  } catch (err) {
    console.error('[check-awb/matrices]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar matrizes.' });
  }
});

// GET /api/air/check-awb/rules — regras de uma matriz (+ filtro por CNPJ)
app.get('/api/air/check-awb/rules', async (req, res) => {
  try {
    const { matrixId, cnpj } = req.query;
    if (!matrixId) return res.status(400).json({ success: false, error: 'matrixId é obrigatório.' });
    const db = getCheckPool();
    let sql = `SELECT * FROM ${RULE_TABLE} WHERE matrix_id = ? AND is_active = 1`;
    const params = [matrixId];
    if (cnpj) { sql += ' AND cnpj = ?'; params.push(cnpj); }
    sql += ' ORDER BY id';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, rules: rows });
  } catch (err) {
    console.error('[check-awb/rules]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar regras.' });
  }
});

// GET /api/air/check-awb/matrices/active — matrizes ativas (usada na validação)
app.get('/api/air/check-awb/matrices/active', async (req, res) => {
  try {
    const db = getCheckPool();
    const [rows] = await db.query(
      `SELECT * FROM ${MATRIX_TABLE} WHERE is_active = 1 ORDER BY customer`
    );
    res.json({ success: true, matrices: rows.map(m => ({ ...m, is_active: true })) });
  } catch (err) {
    console.error('[check-awb/matrices/active]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar matrizes ativas.' });
  }
});

// POST /api/air/check-awb/rules — adiciona regra
app.post('/api/air/check-awb/rules', async (req, res) => {
  try {
    const { matrixId, cnpj, airportCode, addressPattern, emailDespachante,
            refOthello, empresa, endereco, cidade, estado, cep, pais } = req.body || {};
    if (!matrixId || !cnpj) return res.status(400).json({ success: false, error: 'matrixId e cnpj são obrigatórios.' });
    const db = getCheckPool();
    const [result] = await db.query(
      `INSERT INTO ${RULE_TABLE}
         (matrix_id, cnpj, airport_code, address_pattern, email_despachante,
          ref_othello, empresa, endereco, cidade, estado, cep, pais)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [matrixId, cnpj.replace(/\D/g, ''), airportCode||null, addressPattern||null,
       emailDespachante||null, refOthello||null, empresa||null, endereco||null,
       cidade||null, estado||null, cep||null, pais||null]
    );
    res.json({ success: true, ruleId: result.insertId });
  } catch (err) {
    console.error('[check-awb/rules/create]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao criar regra.' });
  }
});

// DELETE /api/air/check-awb/rules/:id — remove regra (soft delete)
app.delete('/api/air/check-awb/rules/:id', async (req, res) => {
  try {
    const db = getCheckPool();
    await db.query(`UPDATE ${RULE_TABLE} SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[check-awb/rules/delete]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao excluir regra.' });
  }
});

// POST /api/air/check-awb/matrices/import — importa Excel (.xlsx)
app.post('/api/air/check-awb/matrices/import', async (req, res) => {
  try {
    const { fileBase64, fileName } = req.body || {};
    if (!fileBase64) return res.status(400).json({ success: false, error: 'fileBase64 é obrigatório.' });

    const XLSX = await import('xlsx');
    const buffer = Buffer.from(fileBase64, 'base64');
    const workbook = XLSX.default.read(buffer, { type: 'buffer', raw: false });

    const db = getCheckPool();
    const version = Math.floor(Date.now() / 1000);
    const effectiveDate = new Date().toISOString().split('T')[0];
    let klabinCount = 0, zfCount = 0;

    const processSheet = async (sheetName, customer) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return 0;
      const rows = XLSX.default.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) return 0;

      // Desativa matrizes anteriores do mesmo cliente
      await db.query(`UPDATE ${MATRIX_TABLE} SET is_active = 0 WHERE customer = ?`, [customer]);

      const [matResult] = await db.query(
        `INSERT INTO ${MATRIX_TABLE} (customer, version, effective_date, is_active) VALUES (?, ?, ?, 1)`,
        [customer, version, effectiveDate]
      );
      const matrixId = matResult.insertId;

      const getVal = (row, keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find(rk => rk.toLowerCase().includes(k.toLowerCase()));
          if (found && row[found] !== '' && row[found] !== null && row[found] !== undefined) return String(row[found]);
        }
        return null;
      };

      let count = 0;
      for (const row of rows) {
        const cnpj = getVal(row, ['cnpj'])?.replace(/\D/g, '') || '';
        if (cnpj.length !== 14) continue;
        await db.query(
          `INSERT INTO ${RULE_TABLE}
             (matrix_id, cnpj, airport_code, address_pattern, email_despachante,
              ref_othello, empresa, endereco, cidade, estado, cep, pais)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [matrixId, cnpj,
           getVal(row, ['aeroporto', 'airport']) || null,
           getVal(row, ['endereço', 'endereco', 'address']) || null,
           getVal(row, ['email', 'despachante']) || null,
           getVal(row, ['ref', 'othello', 'referencia']) || null,
           getVal(row, ['empresa', 'company', 'nome']) || null,
           getVal(row, ['endereço', 'endereco', 'address']) || null,
           getVal(row, ['cidade', 'city']) || null,
           getVal(row, ['estado', 'uf', 'state']) || null,
           getVal(row, ['cep', 'zip']) || null,
           getVal(row, ['pais', 'país', 'country']) || null]
        );
        count++;
      }
      return count;
    };

    const klabinSheet = workbook.SheetNames.find(n => n.toLowerCase().includes('klabin'));
    const zfSheet = workbook.SheetNames.find(n => n.toLowerCase().includes('zf'));

    if (klabinSheet) klabinCount = await processSheet(klabinSheet, 'KLABIN');
    if (zfSheet) zfCount = await processSheet(zfSheet, 'ZF');

    res.json({
      success: true,
      message: `Importação concluída: ${klabinCount} regras Klabin, ${zfCount} regras ZF.`,
    });
  } catch (err) {
    console.error('[check-awb/matrices/import]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao importar matriz.' });
  }
});

// GET /api/air/stats — estatísticas de t_master_dados
app.get('/api/air/stats', async (req, res) => {
  try {
    const db = getPool();
    const [lastRows] = await db.query(`
      SELECT MAX(data_insert) AS last_update
      FROM dados_dachser.t_master_dados
      WHERE active = 1 AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
    `);
    const lastUpdate = lastRows[0]?.last_update || null;

    const [statsRows] = await db.query(
      `SELECT COUNT(*) AS total_records
       FROM dados_dachser.t_master_dados
       WHERE active = 1 AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT') AND data_insert = ?`,
      [lastUpdate]
    );

    const [breakRows] = await db.query(
      `SELECT LEFT(mawb, 3) AS airline_code, COUNT(*) AS count
       FROM dados_dachser.t_master_dados
       WHERE active = 1 AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
         AND mawb IS NOT NULL AND mawb != '' AND data_insert = ?
       GROUP BY LEFT(mawb, 3) ORDER BY count DESC`,
      [lastUpdate]
    );

    const airlineNames = {
      "001":"American Airlines","020":"Lufthansa Cargo","045":"LATAM Cargo",
      "057":"Air France Cargo","074":"AF/KL Cargo","075":"IAG Cargo",
      "125":"British Airways","157":"Qatar Airways","176":"Emirates SkyCargo",
      "235":"Turkish Airlines","577":"Azul Cargo","724":"Swiss WorldCargo",
      "729":"Avianca Cargo",
    };

    const airlineBreakdown = breakRows.map(r => ({
      code: r.airline_code || '???',
      name: airlineNames[r.airline_code] || r.airline_code,
      count: Number(r.count || 0),
    }));

    res.json({ success: true, stats: { lastUpdate, totalRecords: Number(statsRows[0]?.total_records || 0), airlineBreakdown } });
  } catch (err) {
    console.error('[air/stats]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas.' });
  }
});

// GET /api/air/status-aereo — dados de status para a tela principal (Index.tsx)
// Reutiliza computeTrackingData() e remapeia os campos para o formato esperado pelo frontend.
app.get('/api/air/status-aereo', async (req, res) => {
  try {
    const { data } = await computeTrackingData();
    const IN_TRANSIT_CODES = new Set(['DEP','MAN','RCF','ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','TRA','FOH']);
    const mapped = data.map((item, index) => ({
      id: index,
      awb: item.awb_number || '',
      hawb: item.hawb_number || '',
      'destinatário': item.consignee_nome || '',
      nome_analista: item.clerk || '',
      email_analista: null,
      email_cliente: null,
      origem: item.origin || 'N/A',
      destino: item.destination || 'N/A',
      conexao: item.conexao || null,
      'último_status': item.last_status_code || '',
      status_info: item.last_event_description || null,
      'última atualização': item.last_event_date || null,
      tipo_servico: item.tipo_servico || 'N/A',
      tipo_processo: null,
      hours_in_status: item.hours_in_status ?? null,
      pieces_discrepancy: item.pieces_discrepancy || false,
      baseline_pieces: item.baseline_pieces ?? null,
      has_dis_event: item.has_dis_event || false,
      etd: item.etd || null,
      master_changed: false,
      last_event_date: item.last_event_date || null,
      in_transit: IN_TRANSIT_CODES.has((item.last_status_code || '').toUpperCase()),
      tracking_failed: !item.last_status_code,
      is_ground_transport: item.is_ground_transport || false,
    }));
    res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('[air/status-aereo]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar dados de status.' });
  }
});

// GET /api/air/awb-list — lista AWBs rastreados (AWBList.tsx)
app.get('/api/air/awb-list', async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const db = getPool();
    let sql = `
      SELECT awb, LEFT(awb,3) AS airline_code, destinatário AS consignee_name,
             ultimo_evento AS last_event, ultimo_status AS status, data_insert AS created_at
      FROM dados_dachser.t_aereo_ws
      WHERE 1=1`;
    const params = [];
    if (search) { sql += ` AND (awb LIKE ? OR destinatário LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    if (status) { sql += ` AND ultimo_status = ?`; params.push(status); }
    sql += ` ORDER BY data_insert DESC LIMIT 200`;
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[air/awb-list]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar AWBs.' });
  }
});

// GET /api/air/timeline/:awb — timeline de eventos de rastreio (AwbTimelineModal.tsx)
app.get('/api/air/timeline/:awb', async (req, res) => {
  const queryAwb = (req.params.awb || '').trim();
  if (!queryAwb) return res.status(400).json({ success: false, error: 'AWB é obrigatório' });

  const errorPhrases = [
    'não foi possível detectar', 'nao foi possivel detectar', 'could not detect',
    'carrier not supported', 'operadora não suportada', 'erro ao rastrear',
    'error tracking', 'timeout', 'failed to fetch',
    'unable to detect', 'envie-me o número', 'send me the tracking number',
    'adicionarei suporte', 'add support for',
  ];
  const isErrorEvent = (text) => {
    if (!text) return false;
    const lower = String(text).toLowerCase();
    return errorPhrases.some(p => lower.includes(p));
  };

  const extractStatusCode = (description) => {
    if (!description) return 'UNK';
    const upper = description.toUpperCase();
    const knownCodes = ['DEP','ARR','RCF','DLV','NFD','MAN','BKD','RCS','DIS','NIL','OFLD','FOH','TRM','PRE','AWD','CCD','TGC','DDL','AWR','POD','TFD','RCT','RCP','LOF','TDE','ASN','MIS','TFS','BKF','FWB','CAN','NIF'];
    const parenMatch = description.match(/\(([A-Z]{2,5})\)/);
    if (parenMatch && knownCodes.includes(parenMatch[1])) return parenMatch[1];
    for (const code of knownCodes) {
      if (upper.startsWith(code + ' ') || upper.startsWith(code + '-') || upper === code) return code;
    }
    for (const code of knownCodes) { if (upper.includes(code)) return code; }
    const descPatterns = [
      [/\bbooked\b/i, 'BKD'], [/\bdelivered\b/i, 'DLV'], [/\barrived?\b/i, 'ARR'],
      [/\bdeparted?\b/i, 'DEP'], [/\breceived?\s+from\s+flight\b/i, 'RCF'],
      [/\breceived?\s+from\s+shipper\b/i, 'RCS'], [/\bmanifested?\b/i, 'MAN'],
      [/\bnotified?\s+(for\s+)?delivery\b/i, 'NFD'], [/\bawaitin[g]?\s+delivery\b/i, 'AWD'],
      [/\bavailable\s+for\s+delivery\b/i, 'AWD'], [/\bdocuments?\s+available\b/i, 'AWD'],
      [/\bdiscrepancy\b/i, 'DIS'], [/\boffloaded?\b/i, 'OFLD'], [/\bfreight\s+on\s+hand\b/i, 'FOH'],
      [/\btransferred?\b/i, 'TFD'], [/\bproof\s+of\s+delivery\b/i, 'POD'],
      [/\bnot\s+found\b/i, 'NIF'], [/\bcancell?ed\b/i, 'CAN'], [/\breceived\b/i, 'RCF'],
    ];
    for (const [pattern, code] of descPatterns) { if (pattern.test(description)) return code; }
    return 'UNK';
  };

  const extractPiecesFromDesc = (text) => {
    if (!text) return null;
    if (/(OFLD|OFFLOAD|OFFLOADED)/i.test(text) && /(^|[^0-9])0\s+PIECES?([^A-Z]|$)/i.test(text)) return null;
    if (/(^|[^A-Z])(BOOKED|BOOKING)([^A-Z]|$)/i.test(text)) return null;
    const pcsWtMatch = text.match(/Pcs\s*\/\s*Wt\s*[:=]?\s*(\d+)\s*\/\s*[\d.,]+/i);
    if (pcsWtMatch) return parseInt(pcsWtMatch[1], 10);
    const longMatch = text.match(/Pieces:\s*(\d+)/i);
    if (longMatch) return parseInt(longMatch[1], 10);
    const shortMatch = text.match(/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/i);
    if (shortMatch) return parseInt(shortMatch[1], 10);
    const qtyMatch = text.match(/qty:\s*(\d+)/i);
    if (qtyMatch) return parseInt(qtyMatch[1], 10);
    const piecesMatch = text.match(/(\d+)\s*piece(?:s|\(s\))?/i);
    if (piecesMatch) return parseInt(piecesMatch[1], 10);
    return null;
  };

  const extractWeightFromDesc = (text) => {
    if (!text) return null;
    const wMatch = text.match(/Weight:\s*([\d.,]+\s*(?:K|KGS?|kg))/i);
    if (wMatch) return wMatch[1];
    const kgsMatch = text.match(/([\d.,]+)\s*KGS/i);
    if (kgsMatch) return `${kgsMatch[1]} KGS`;
    return null;
  };

  const parseFlexibleDate = (dateStr) => {
    if (!dateStr) return null;
    const direct = new Date(dateStr);
    if (!isNaN(direct.getTime())) return direct;
    const ptMonths = { jan:'01',fev:'02',mar:'03',abr:'04',mai:'05',jun:'06',jul:'07',ago:'08',set:'09',out:'10',nov:'11',dez:'12' };
    const enMonths = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
    const match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:\s+(\d{2}:\d{2}))?/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const monthStr = match[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const year = match[3];
      const time = match[4] || '00:00';
      const month = ptMonths[monthStr] || enMonths[monthStr] || null;
      if (month) return new Date(`${year}-${month}-${day}T${time}:00`);
    }
    return null;
  };

  try {
    // ── 1. Query t_aereo_ws_firecrawl (primary source) ──
    let wsRows;
    try {
      wsRows = await queryWithRetry(
        `SELECT id, awb, timeline_json, scraped_at, last_status_code
         FROM dados_dachser.t_aereo_ws_firecrawl
         WHERE TRIM(awb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
         ORDER BY id DESC LIMIT 1`,
        [queryAwb]
      );
    } catch (e) {
      wsRows = [];
    }

    if (!wsRows || wsRows.length === 0) {
      return res.json({ success: true, data: [], tracking_failed: true });
    }

    const wsRecord = wsRows[0];
    let timelineData = [];
    if (wsRecord.timeline_json) {
      try {
        const raw = typeof wsRecord.timeline_json === 'string'
          ? JSON.parse(wsRecord.timeline_json) : wsRecord.timeline_json;
        if (Array.isArray(raw)) timelineData = raw;
      } catch (_) { /* malformed json */ }
    }

    const invalidStatuses = new Set(['', 'N/A', 'NOT_FOUND', 'ERRO', 'UNK']);
    const wsStatus = (wsRecord.last_status_code || '').trim().toUpperCase();
    const needsFallback = timelineData.length === 0
      || isErrorEvent(wsRecord.timeline_json ? String(wsRecord.timeline_json) : null)
      || invalidStatuses.has(wsStatus)
      || !wsRecord.last_status_code;

    // ── 2. Query t_aereo_api for enrichment / fallback ──
    let apiTimelineRaw = [];
    try {
      const apiRows = await queryWithRetry(
        `SELECT historico_status FROM dados_dachser.t_aereo_api
         WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
           AND historico_status IS NOT NULL
         ORDER BY id DESC LIMIT 1`,
        [queryAwb]
      );
      if (apiRows && apiRows.length > 0 && apiRows[0].historico_status) {
        const parsed = typeof apiRows[0].historico_status === 'string'
          ? JSON.parse(apiRows[0].historico_status) : apiRows[0].historico_status;
        if (Array.isArray(parsed)) apiTimelineRaw = parsed;
      }
    } catch (_) { /* api fallback unavailable */ }

    if (needsFallback && timelineData.length > 0 && apiTimelineRaw.length > 0) {
      // MERGE: enrich firecrawl events with API pecas/peso, add API-only events
      for (const apiEvt of apiTimelineRaw) {
        const apiStatus = (apiEvt.status || '').toUpperCase();
        const apiAirport = (apiEvt.aeroporto || '').toUpperCase();
        const apiDate = apiEvt.dataEvento ? new Date(apiEvt.dataEvento).getTime() : 0;
        let matched = false;
        for (const fcEvt of timelineData) {
          const fcDesc = (fcEvt.Description || fcEvt.description || '').toUpperCase();
          const fcLoc  = (fcEvt.Location  || fcEvt.location  || '').toUpperCase();
          const fcRaw  = fcEvt.Timestamp || fcEvt.timestamp || fcEvt.date || fcEvt.Date || fcEvt.datetime || fcEvt.dataEvento || fcEvt.time;
          const fcTime = fcRaw ? new Date(fcRaw).getTime() : 0;
          const statusMatch = fcDesc.includes(apiStatus) || fcLoc.includes(apiAirport);
          const timeClose   = apiDate && fcTime && Math.abs(apiDate - fcTime) < 2 * 3600 * 1000;
          if (statusMatch && (timeClose || !apiDate || !fcTime)) {
            fcEvt._pecas = apiEvt.quantidadeCargo ?? apiEvt.quantidadeCarga ?? null;
            fcEvt._peso  = apiEvt.pesoCarga ?? null;
            matched = true; break;
          }
        }
        if (!matched) {
          timelineData.push({ ...apiEvt, _fromApi: true,
            _pecas: apiEvt.quantidadeCargo ?? apiEvt.quantidadeCarga ?? null,
            _peso:  apiEvt.pesoCarga ?? null });
        }
      }
    } else if (needsFallback && timelineData.length === 0 && apiTimelineRaw.length > 0) {
      timelineData = apiTimelineRaw.map(evt => ({
        ...evt, _fromApi: true,
        _pecas: evt.quantidadeCargo ?? evt.quantidadeCarga ?? null,
        _peso:  evt.pesoCarga ?? null,
      }));
    } else if (!needsFallback && apiTimelineRaw.length > 0) {
      for (const apiEvt of apiTimelineRaw) {
        const apiStatus  = (apiEvt.status || '').toUpperCase();
        const apiAirport = (apiEvt.aeroporto || '').toUpperCase();
        for (const fcEvt of timelineData) {
          const fcDesc = (fcEvt.Description || fcEvt.description || '').toUpperCase();
          const fcLoc  = (fcEvt.Location  || fcEvt.location  || '').toUpperCase();
          if (fcDesc.includes(apiStatus) || fcLoc.includes(apiAirport)) {
            fcEvt._pecas = apiEvt.quantidadeCargo ?? apiEvt.quantidadeCarga ?? null;
            fcEvt._peso  = apiEvt.pesoCarga ?? null;
            break;
          }
        }
      }
    }

    const allAreErrors = timelineData.length === 0 || timelineData.every(entry => {
      const desc = entry.Description || entry.description || entry.status || '';
      return isErrorEvent(String(desc));
    });
    if (allAreErrors) return res.json({ success: true, data: [], tracking_failed: true });

    // ── 3. Normalize events ──
    const events = timelineData.map((entry, idx) => {
      if ((entry.status && !entry.Description && !entry.description) || entry._fromApi) {
        const statusCode = (entry.status || '').toUpperCase();
        const airport    = entry.aeroporto || '';
        const flight     = entry.voo || '';
        const qty        = entry._pecas ?? entry.quantidadeCargo ?? entry.quantidadeCarga;
        const weight     = entry._peso ?? entry.pesoCarga;
        let desc = statusCode;
        if (airport) desc += ` - ${airport}`;
        if (flight)  desc += `, Flight ${flight}`;
        if (qty && qty > 0)               desc += `, Pieces: ${qty}`;
        if (weight && weight !== 'N/A')   desc += `, Weight: ${weight}`;
        return {
          id: idx + 1, codigo_evento: statusCode || 'UNK', descricao_evento: desc,
          data_hora_evento: entry.dataEvento || null, fonte: 'API', aeroporto: airport || null,
          pecas: qty && qty > 0 ? Number(qty) : null,
          peso: weight && weight !== 'N/A' ? String(weight) : null,
        };
      }
      const description   = entry.Description || entry.description || entry.status || '';
      const codigoEvento  = extractStatusCode(description);
      const eventDateTime = entry.Timestamp || entry.timestamp || entry.date || entry.Date || entry.datetime || entry.dataEvento || entry.time || null;
      return {
        id: idx + 1, codigo_evento: codigoEvento, descricao_evento: description,
        data_hora_evento: eventDateTime, fonte: entry.Carrier || entry.carrier || 'TRACKING',
        aeroporto: entry.Location || entry.location || entry.aeroporto || null,
        pecas: entry._pecas ? Number(entry._pecas) : extractPiecesFromDesc(description),
        peso: entry._peso && entry._peso !== 'N/A' ? String(entry._peso) : extractWeightFromDesc(description),
      };
    });

    const VALID_IATA_CODES = new Set([
      'DEP','ARR','RCF','DLV','NFD','MAN','BKD','RCS','DIS','NIL','OFLD','FOH','TRM','PRE',
      'AWD','CCD','TGC','DDL','AWR','POD','TFD','RCT','RCP','LOF','TDE','ASN','MIS','TFS',
      'BKF','FWB','CAN','NIF','UNK','NOVO_MASTER','BCBP','RCD',
    ]);
    const validEvents = events.filter(e =>
      !isErrorEvent(e.descricao_evento) &&
      VALID_IATA_CODES.has((e.codigo_evento || '').toUpperCase())
    );

    // IATA tiebreaker for top-4 events with same timestamp
    const IATA_WEIGHT = { POD:44,DLV:43,NFD:42,RCF:41,AWD:40,ARR:39,TRM:38,TFD:37,DEP:36,MAN:35,RCS:34,FOH:33,BKD:32,AWR:40,CCD:40,FWB:4,RCT:11,PRE:20,DIS:30,OFLD:28 };
    if (validEvents.length >= 2) {
      const topN = Math.min(4, validEvents.length);
      const topWithDate = validEvents.slice(0, topN).map((ev, idx) => ({
        ev, idx, dateMs: ev.data_hora_evento ? new Date(ev.data_hora_evento).getTime() : 0,
      }));
      const latestDateMs = Math.max(...topWithDate.map(({ dateMs }) => isNaN(dateMs) ? 0 : dateMs));
      if (latestDateMs > 0) {
        const bestGroup = topWithDate.filter(({ dateMs }) => !isNaN(dateMs) && dateMs === latestDateMs);
        let bestIdx = bestGroup[0].idx;
        let bestW   = IATA_WEIGHT[(bestGroup[0].ev.codigo_evento || '').toUpperCase()] || 0;
        for (let i = 1; i < bestGroup.length; i++) {
          const w = IATA_WEIGHT[(bestGroup[i].ev.codigo_evento || '').toUpperCase()] || 0;
          if (w > bestW || (w === bestW && bestGroup[i].idx < bestIdx)) { bestW = w; bestIdx = bestGroup[i].idx; }
        }
        if (bestIdx > 0) { const [winner] = validEvents.splice(bestIdx, 1); validEvents.unshift(winner); }
      }
    }

    // ── 4. ETD cutoff filter ──
    let etdCutoff = null;
    try {
      const etdRows = await queryWithRetry(
        `SELECT etd, data_insert FROM dados_dachser.t_master_dados
         WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
           AND etd IS NOT NULL ORDER BY data_insert DESC LIMIT 1`,
        [queryAwb]
      );
      if (etdRows && etdRows.length > 0 && etdRows[0].etd) {
        const etdDate = new Date(etdRows[0].etd);
        const now = new Date();
        if (etdDate <= now) {
          etdCutoff = new Date(etdDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        } else {
          const dataInsert = new Date(etdRows[0].data_insert);
          if (!isNaN(dataInsert.getTime())) etdCutoff = new Date(dataInsert.getTime() - 7 * 24 * 60 * 60 * 1000);
        }
      }
    } catch (_) { /* ETD unavailable */ }

    const now = new Date();
    const futureThreshold = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const filteredEvents = validEvents.filter(e => {
      if (!e.data_hora_evento) return e.fonte !== 'API';
      const eventDate = parseFlexibleDate(e.data_hora_evento);
      if (!eventDate) return e.fonte !== 'API';
      if (eventDate > futureThreshold) return false;
      if (etdCutoff && eventDate < etdCutoff) return false;
      return true;
    });

    if (filteredEvents.length === 0 || filteredEvents.every(e => e.codigo_evento === 'UNK')) {
      return res.json({ success: true, data: filteredEvents, tracking_failed: true });
    }

    // ── 5. Inject NOVO_MASTER synthetic events ──
    try {
      const swapRows = await queryWithRetry(
        `SELECT hawb_number, old_mawb, new_mawb, swapped_at FROM dados_dachser.t_master_swap_log
         WHERE TRIM(new_mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
         ORDER BY swapped_at DESC`,
        [queryAwb]
      );
      if (swapRows && swapRows.length > 0) {
        for (const swap of swapRows) {
          filteredEvents.push({
            id: `swap-${swap.old_mawb}-${swap.new_mawb}`,
            codigo_evento: 'NOVO_MASTER',
            descricao_evento: `Master atualizado: ${swap.old_mawb} → ${swap.new_mawb}`,
            data_hora_evento: swap.swapped_at || null,
            fonte: 'SISTEMA', aeroporto: '', pecas: null, peso: null,
          });
        }
        filteredEvents.sort((a, b) => {
          const da = a.data_hora_evento ? new Date(a.data_hora_evento).getTime() : 0;
          const db = b.data_hora_evento ? new Date(b.data_hora_evento).getTime() : 0;
          return db - da;
        });
      }
    } catch (_) { /* swap log unavailable */ }

    // ── 6. Discrepancy detection ──
    let discrepancy = null;
    const allPieces = filteredEvents.map(e => e.pecas).filter(v => v != null && v > 0);
    if (allPieces.length >= 2) {
      const minP = Math.min(...allPieces);
      const maxP = Math.max(...allPieces);
      if (minP !== maxP) discrepancy = { field: 'pecas', values: [...new Set(allPieces)], min: minP, max: maxP };
    }
    if (!discrepancy) {
      const hasDis = filteredEvents.some(e => {
        const txt = String(e.descricao_evento || '');
        return /(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)/i.test(txt) || /\b(DISCREPANCY|IRREGULAR|MISSING|SHORT\s+SHIPPED|OVERAGE)\b/i.test(txt);
      });
      if (hasDis) discrepancy = { field: 'dis', values: [], min: null, max: null };
    }

    res.json({ success: true, data: filteredEvents, ...(discrepancy ? { discrepancy } : {}) });
  } catch (err) {
    console.error('[air/timeline]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar timeline.' });
  }
});

// GET /api/air/email-regras
app.get('/api/air/email-regras', async (req, res) => {
  try {
    const rows = await queryWithRetry(
      `SELECT id, cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo, created_at, updated_at
       FROM dados_dachser.t_email_cliente ORDER BY id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[air/email-regras GET]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar regras de e-mail.' });
  }
});

// POST /api/air/email-regras
app.post('/api/air/email-regras', async (req, res) => {
  try {
    const { cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo } = req.body || {};
    await queryWithRetry(
      `INSERT INTO dados_dachser.t_email_cliente (cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        cliente_nome || null, cnpj_consignatario || null, email_cliente || null,
        typeof aeroportos === 'string' ? aeroportos : JSON.stringify(aeroportos || []),
        typeof eventos_disparo === 'string' ? eventos_disparo : JSON.stringify(eventos_disparo || []),
        typeof canais === 'string' ? canais : JSON.stringify(canais || []),
        ativo != null ? (ativo ? 1 : 0) : 1,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[air/email-regras POST]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao criar regra de e-mail.' });
  }
});

// PATCH /api/air/email-regras/:id
app.patch('/api/air/email-regras/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo } = req.body || {};
    const sets = [];
    const params = [];
    if (cliente_nome     !== undefined) { sets.push('cliente_nome = ?');      params.push(cliente_nome); }
    if (cnpj_consignatario !== undefined) { sets.push('cnpj_consignatario = ?'); params.push(cnpj_consignatario); }
    if (email_cliente    !== undefined) { sets.push('email_cliente = ?');     params.push(email_cliente); }
    if (aeroportos       !== undefined) { sets.push('aeroportos = ?');        params.push(typeof aeroportos === 'string' ? aeroportos : JSON.stringify(aeroportos)); }
    if (eventos_disparo  !== undefined) { sets.push('eventos_disparo = ?');   params.push(typeof eventos_disparo === 'string' ? eventos_disparo : JSON.stringify(eventos_disparo)); }
    if (canais           !== undefined) { sets.push('canais = ?');            params.push(typeof canais === 'string' ? canais : JSON.stringify(canais)); }
    if (ativo            !== undefined) { sets.push('ativo = ?');             params.push(ativo ? 1 : 0); }
    if (sets.length === 0) return res.json({ success: true });
    sets.push('updated_at = NOW()');
    params.push(id);
    await queryWithRetry(
      `UPDATE dados_dachser.t_email_cliente SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[air/email-regras PATCH]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao atualizar regra de e-mail.' });
  }
});

// DELETE /api/air/email-regras/:id
app.delete('/api/air/email-regras/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await queryWithRetry(
      `DELETE FROM dados_dachser.t_email_cliente WHERE id = ?`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[air/email-regras DELETE]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao excluir regra de e-mail.' });
  }
});

// ─── CCT routes (/api/cct/*) ────────────────────────────────────────────────

// GET /api/cct/profiles — lista analistas distintos de t_status_aereo
app.get('/api/cct/profiles', async (req, res) => {
  try {
    const rows = await queryWithRetry(
      `SELECT DISTINCT nome_analista AS nome, email_analista AS email
       FROM dados_dachser.t_status_aereo
       WHERE nome_analista IS NOT NULL AND nome_analista != ''
       ORDER BY nome_analista`
    );
    const profiles = (rows || []).map((row, idx) => ({
      id: `analyst-${idx + 1}`, nome: row.nome || '', email: row.email || '', ativo: true,
    }));
    res.json({ success: true, data: profiles });
  } catch (err) {
    console.error('[cct/profiles]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar perfis.' });
  }
});

// GET /api/cct/regras-notificacao
app.get('/api/cct/regras-notificacao', async (req, res) => {
  try {
    const rows = await queryWithRetry(
      `SELECT * FROM dados_dachser.t_cct_regras_notificacao ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[cct/regras-notificacao GET]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar regras.' });
  }
});

// POST /api/cct/regras-notificacao
app.post('/api/cct/regras-notificacao', async (req, res) => {
  try {
    const { cliente_nome, cnpj_consignatario, aeroportos, eventos_disparo, canais, template_id, ativo } = req.body || {};
    await queryWithRetry(
      `INSERT INTO dados_dachser.t_cct_regras_notificacao (cliente_nome, cnpj_consignatario, aeroportos, eventos_disparo, canais, template_id, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_nome || null, cnpj_consignatario || null,
        typeof aeroportos === 'string' ? aeroportos : JSON.stringify(aeroportos || []),
        typeof eventos_disparo === 'string' ? eventos_disparo : JSON.stringify(eventos_disparo || []),
        typeof canais === 'string' ? canais : JSON.stringify(canais || []),
        template_id || 'default', ativo !== false ? 1 : 0,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[cct/regras-notificacao POST]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao criar regra.' });
  }
});

// PATCH /api/cct/regras-notificacao/:id
app.patch('/api/cct/regras-notificacao/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { cliente_nome, cnpj_consignatario, aeroportos, eventos_disparo, canais, template_id, ativo } = req.body || {};
    const sets = []; const params = [];
    if (cliente_nome      !== undefined) { sets.push('cliente_nome = ?');       params.push(cliente_nome); }
    if (cnpj_consignatario !== undefined) { sets.push('cnpj_consignatario = ?'); params.push(cnpj_consignatario); }
    if (aeroportos        !== undefined) { sets.push('aeroportos = ?');         params.push(typeof aeroportos === 'string' ? aeroportos : JSON.stringify(aeroportos)); }
    if (eventos_disparo   !== undefined) { sets.push('eventos_disparo = ?');    params.push(typeof eventos_disparo === 'string' ? eventos_disparo : JSON.stringify(eventos_disparo)); }
    if (canais            !== undefined) { sets.push('canais = ?');             params.push(typeof canais === 'string' ? canais : JSON.stringify(canais)); }
    if (template_id       !== undefined) { sets.push('template_id = ?');        params.push(template_id); }
    if (ativo             !== undefined) { sets.push('ativo = ?');              params.push(ativo ? 1 : 0); }
    if (sets.length === 0) return res.json({ success: true });
    params.push(id);
    await queryWithRetry(`UPDATE dados_dachser.t_cct_regras_notificacao SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    console.error('[cct/regras-notificacao PATCH]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao atualizar regra.' });
  }
});

// DELETE /api/cct/regras-notificacao/:id
app.delete('/api/cct/regras-notificacao/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await queryWithRetry(`DELETE FROM dados_dachser.t_cct_regras_notificacao WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[cct/regras-notificacao DELETE]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao excluir regra.' });
  }
});

// GET /api/cct/leadcomex-logs/stats
app.get('/api/cct/leadcomex-logs/stats', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const DATE_THRESHOLD = '2026-01-26';
    let where = `WHERE DATE(dep_date) >= '${DATE_THRESHOLD}'`;
    const params = [];
    if (date_from) { where += ` AND DATE(created_at) >= ?`; params.push(date_from); }
    if (date_to)   { where += ` AND DATE(created_at) <= ?`; params.push(date_to); }
    const rows = await queryWithRetry(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
              SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS error_count,
              AVG(total_time_ms) AS avg_time_ms,
              AVG(CASE WHEN success = 1 THEN offset_days ELSE NULL END) AS avg_offset_days,
              AVG(total_attempts) AS avg_attempts,
              COUNT(DISTINCT DATE(created_at)) AS days_with_data
       FROM dados_dachser.t_leadcomex_enrichment_logs ${where}`,
      params
    );
    const row = rows[0] || {};
    res.json({ success: true, stats: {
      total: Number(row.total) || 0,
      success_count: Number(row.success_count) || 0,
      error_count: Number(row.error_count) || 0,
      success_rate: row.total > 0 ? (Number(row.success_count || 0) / Number(row.total) * 100).toFixed(1) : '0.0',
      avg_time_ms: Math.round(Number(row.avg_time_ms) || 0),
      avg_offset_days: Number(row.avg_offset_days || 0).toFixed(1),
      avg_attempts: Number(row.avg_attempts || 0).toFixed(1),
      days_with_data: Number(row.days_with_data) || 0,
    }});
  } catch (err) {
    console.error('[cct/leadcomex-logs/stats]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas.' });
  }
});

// GET /api/cct/leadcomex-logs/:id
app.get('/api/cct/leadcomex-logs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = await queryWithRetry(
      `SELECT * FROM dados_dachser.t_leadcomex_enrichment_logs WHERE id = ?`, [id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, error: 'Log não encontrado' });
    const row = rows[0];
    const parseSafe = (col) => { try { return col ? JSON.parse(col) : []; } catch { return []; } };
    const log = {
      ...row, success: row.success === 1,
      lc_bloqueios_ativos:     parseSafe(row.lc_bloqueios_ativos_json),
      lc_bloqueios_baixados:   parseSafe(row.lc_bloqueios_baixados_json),
      lc_divergencias:         parseSafe(row.lc_divergencias_json),
      lc_viagens_associadas:   parseSafe(row.lc_viagens_associadas_json),
      lc_mawb_associados:      parseSafe(row.lc_mawb_associados_json),
      lc_partes_estoque:       parseSafe(row.lc_partes_estoque_json),
      lc_itens_carga:          parseSafe(row.lc_itens_carga_json),
      lc_frete:                row.lc_frete_json ? JSON.parse(row.lc_frete_json) : null,
      attempts:                parseSafe(row.attempts_json),
      raw_response:            row.raw_response_json ? JSON.parse(row.raw_response_json) : null,
    };
    res.json({ success: true, log });
  } catch (err) {
    console.error('[cct/leadcomex-logs/:id]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar log.' });
  }
});

// GET /api/cct/leadcomex-logs
app.get('/api/cct/leadcomex-logs', async (req, res) => {
  try {
    const { limit = '100', offset = '0', hawb, success: filterSuccess, date_from, date_to, execution_source } = req.query;
    const DATE_THRESHOLD = '2026-01-26';
    let where = `WHERE DATE(dep_date) >= '${DATE_THRESHOLD}'`;
    const params = [];
    if (hawb)            { where += ` AND (hawb LIKE ? OR mawb LIKE ? OR lc_hawb LIKE ?)`; params.push(`%${hawb}%`, `%${hawb}%`, `%${hawb}%`); }
    if (filterSuccess !== undefined && filterSuccess !== '' && filterSuccess !== 'all') {
      where += ` AND success = ?`; params.push(filterSuccess === 'true' || filterSuccess === '1' ? 1 : 0);
    }
    if (execution_source) { where += ` AND execution_source = ?`; params.push(execution_source); }
    if (date_from)        { where += ` AND DATE(created_at) >= ?`; params.push(date_from); }
    if (date_to)          { where += ` AND DATE(created_at) <= ?`; params.push(date_to); }

    const countRows = await queryWithRetry(
      `SELECT COUNT(*) AS total FROM dados_dachser.t_leadcomex_enrichment_logs ${where}`, params
    );
    const total = Number(countRows[0]?.total) || 0;

    const lim = Math.min(parseInt(limit, 10) || 100, 500);
    const off = parseInt(offset, 10) || 0;
    const rows = await queryWithRetry(
      `SELECT id, hawb, mawb, dep_date, success, matched_date, offset_days, total_attempts, total_time_ms,
              execution_source, lc_hawb, lc_data_emissao, lc_situacao_lead, lc_situacao_portal, lc_tipo,
              lc_situacao_carga, lc_categoria_carga, lc_aeroporto_origem, lc_aeroporto_destino,
              lc_peso_bruto, lc_quantidade_volumes, lc_cnpj_consignatario, lc_nome_consignatario,
              lc_nome_embarcador, lc_cidade_embarcador, lc_pais_embarcador,
              lc_frete_valor_total, lc_frete_moeda_codigo,
              lc_bloqueios_ativos_json, lc_viagens_associadas_json, attempts_json, created_at
       FROM dados_dachser.t_leadcomex_enrichment_logs ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, lim, off]
    );
    const logs = rows.map(row => ({
      ...row, success: row.success === 1,
      lc_bloqueios_ativos:   row.lc_bloqueios_ativos_json   ? JSON.parse(row.lc_bloqueios_ativos_json)   : [],
      lc_viagens_associadas: row.lc_viagens_associadas_json ? JSON.parse(row.lc_viagens_associadas_json) : [],
      attempts:              row.attempts_json               ? JSON.parse(row.attempts_json)               : [],
    }));
    res.json({ success: true, logs, total, limit: lim, offset: off });
  } catch (err) {
    console.error('[cct/leadcomex-logs]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar logs.' });
  }
});

// ─── SEA: Status Doc Exportação ───────────────────────────────────────────────

const SEA_SHIPPING_LINES = [
  { code: 'HLC', name: 'Hapag-Lloyd', prefixes: ['HLC'] },
  { code: 'MSC', name: 'MSC',         prefixes: ['MSC', 'MEDU'] },
  { code: 'ONE', name: 'ONE',         prefixes: ['ONEY', 'ONEU', 'EBKG', 'NYKU', 'MOLU', 'KKFU', 'MOAU', 'KKLU'] },
];
const seaQuery = (sql, params = []) => queryWithRetry(sql, params, 1, 'sea');

const SEA_ACTIVE_WHERE = `
  m.active = 1 AND m.tipo_processo = 'SEA EXPORT'
  AND m.mawb IS NOT NULL AND TRIM(m.mawb) != ''
  AND (
    m.mawb LIKE 'HLC%'  OR m.mawb LIKE 'MSC%'  OR m.mawb LIKE 'MEDU%'
    OR m.mawb LIKE 'ONEY%' OR m.mawb LIKE 'ONEU%' OR m.mawb LIKE 'EBKG%'
    OR m.mawb LIKE 'NYKU%' OR m.mawb LIKE 'MOLU%' OR m.mawb LIKE 'KKFU%'
    OR m.mawb LIKE 'MOAU%' OR m.mawb LIKE 'KKLU%'
  )
  AND (m.etd >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) OR m.etd IS NULL)
`;

// GET /api/sea/draft-exportacao/stats — painel SeaDbStatsPanel
app.get('/api/sea/draft-exportacao/stats', async (req, res) => {
  try {
    const [totalRows, lastRows] = await Promise.all([
      seaQuery(`SELECT COUNT(*) AS total FROM dados_dachser.t_master_dados m WHERE ${SEA_ACTIVE_WHERE}`),
      seaQuery(`SELECT MAX(data_insert) AS last_update FROM dados_dachser.t_master_dados WHERE tipo_processo = 'SEA EXPORT'`),
    ]);

    const shippingLineBreakdown = [];
    for (const line of SEA_SHIPPING_LINES) {
      const likeClauses = line.prefixes.map(p => `m.mawb LIKE '${p}%'`).join(' OR ');
      const rows = await seaQuery(`
        SELECT COUNT(*) AS count FROM dados_dachser.t_master_dados m
        WHERE m.active = 1 AND m.tipo_processo = 'SEA EXPORT'
          AND m.mawb IS NOT NULL AND TRIM(m.mawb) != ''
          AND (${likeClauses})
          AND (m.etd >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) OR m.etd IS NULL)
      `);
      shippingLineBreakdown.push({ code: line.code, name: line.name, count: Number(rows[0]?.count ?? 0) });
    }

    res.json({
      success: true,
      stats: {
        lastUpdate: lastRows[0]?.last_update ?? null,
        totalRecords: Number(totalRows[0]?.total ?? 0),
        shippingLineBreakdown,
      },
    });
  } catch (err) {
    console.error('[sea/draft-exportacao/stats]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas SEA.' });
  }
});

// GET /api/sea/draft-exportacao — MBLs + tracking status combinados
app.get('/api/sea/draft-exportacao', async (req, res) => {
  try {
    const [mblRows, trackingRows] = await Promise.all([
      seaQuery(`
        SELECT TRIM(m.mawb) AS mbl_id, m.tipo_processo, m.etd, m.cliente AS shipper
        FROM dados_dachser.t_master_dados m
        WHERE ${SEA_ACTIVE_WHERE}
        ORDER BY m.etd DESC, m.mawb
      `),
      seaQuery(`
        SELECT id, mbl_id, booking, origem, destino, navio, voyage,
               etd, eta, tipo_processo, status_armador,
               transaction_id, hash_hapag_lloyd, api_endpoint,
               data_hora_servidor, data_hora_consulta, created_at
        FROM dados_dachser.t_consulta_armador
      `),
    ]);

    const trackingStatus = {};
    for (const row of trackingRows) {
      const key = (row.mbl_id || '').trim();
      if (!key) continue;
      const existing = trackingStatus[key];
      const rowDate  = new Date(row.data_hora_consulta || row.created_at || 0).getTime();
      const exDate   = existing ? new Date(existing.data_hora_consulta || existing.created_at || 0).getTime() : -1;
      if (!existing || rowDate >= exDate) trackingStatus[key] = row;
    }

    res.json({ success: true, mbls: mblRows, trackingStatus });
  } catch (err) {
    console.error('[sea/draft-exportacao]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar dados SEA.' });
  }
});

// GET /api/sea/regras-notificacao
app.get('/api/sea/regras-notificacao', async (req, res) => {
  try {
    const rows = await seaQuery(
      `SELECT * FROM dados_dachser.t_sea_regras_notificacao ORDER BY is_default DESC, created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[sea/regras-notificacao GET]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar regras.' });
  }
});

// POST /api/sea/regras-notificacao
app.post('/api/sea/regras-notificacao', async (req, res) => {
  try {
    const {
      cliente_nome, cnpj_consignatario, tipo_processo,
      portos_origem, portos_destino, eventos_disparo,
      frequencia, canais, emails_import, emails_export,
      template_id, ativo, is_default,
    } = req.body;

    if (is_default) {
      await seaQuery(`UPDATE dados_dachser.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE`);
    }
    await seaQuery(`
      INSERT INTO dados_dachser.t_sea_regras_notificacao
        (cliente_nome, cnpj_consignatario, tipo_processo, portos_origem, portos_destino,
         eventos_disparo, frequencia, canais, emails_import, emails_export, template_id, ativo, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cliente_nome, cnpj_consignatario, tipo_processo || 'BOTH',
      portos_origem || '[]', portos_destino || '[]', eventos_disparo || '[]',
      frequencia || 'IMEDIATO', canais || '[]',
      emails_import, emails_export, template_id || 'default',
      ativo !== false ? 1 : 0, is_default ? 1 : 0,
    ]);
    res.json({ success: true, message: 'Regra criada com sucesso' });
  } catch (err) {
    console.error('[sea/regras-notificacao POST]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao criar regra.' });
  }
});

// PATCH /api/sea/regras-notificacao/:id
app.patch('/api/sea/regras-notificacao/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const {
      cliente_nome, cnpj_consignatario, tipo_processo,
      portos_origem, portos_destino, eventos_disparo,
      frequencia, canais, emails_import, emails_export,
      template_id, ativo, is_default,
    } = req.body;

    if (is_default === true) {
      await seaQuery(
        `UPDATE dados_dachser.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE AND id != ?`,
        [id]
      );
    }

    const fields = [];
    const values = [];
    if (cliente_nome !== undefined)       { fields.push('cliente_nome = ?');       values.push(cliente_nome); }
    if (cnpj_consignatario !== undefined) { fields.push('cnpj_consignatario = ?'); values.push(cnpj_consignatario); }
    if (tipo_processo !== undefined)      { fields.push('tipo_processo = ?');       values.push(tipo_processo); }
    if (portos_origem !== undefined)      { fields.push('portos_origem = ?');       values.push(portos_origem); }
    if (portos_destino !== undefined)     { fields.push('portos_destino = ?');      values.push(portos_destino); }
    if (eventos_disparo !== undefined)    { fields.push('eventos_disparo = ?');     values.push(eventos_disparo); }
    if (frequencia !== undefined)         { fields.push('frequencia = ?');          values.push(frequencia); }
    if (canais !== undefined)             { fields.push('canais = ?');              values.push(canais); }
    if (emails_import !== undefined)      { fields.push('emails_import = ?');       values.push(emails_import); }
    if (emails_export !== undefined)      { fields.push('emails_export = ?');       values.push(emails_export); }
    if (template_id !== undefined)        { fields.push('template_id = ?');         values.push(template_id); }
    if (ativo !== undefined)              { fields.push('ativo = ?');               values.push(ativo ? 1 : 0); }
    if (is_default !== undefined)         { fields.push('is_default = ?');          values.push(is_default ? 1 : 0); }

    if (fields.length > 0) {
      values.push(id);
      await seaQuery(
        `UPDATE dados_dachser.t_sea_regras_notificacao SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }
    res.json({ success: true, message: 'Regra atualizada com sucesso' });
  } catch (err) {
    console.error('[sea/regras-notificacao PATCH]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao atualizar regra.' });
  }
});

// DELETE /api/sea/regras-notificacao/:id
app.delete('/api/sea/regras-notificacao/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await seaQuery(`DELETE FROM dados_dachser.t_sea_regras_notificacao WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Regra excluída com sucesso' });
  } catch (err) {
    console.error('[sea/regras-notificacao DELETE]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao excluir regra.' });
  }
});

// ─── SEA: Marítimo — CRUD (Análise Documental) ───────────────────────────────

// GET /api/sea/maritimo/items
app.get('/api/sea/maritimo/items', async (req, res) => {
  try {
    const { analysisType, status, search } = req.query;
    let query = `
      SELECT i.id, i.view, i.arquivo_id, i.arquivo_label AS base_file_name,
             i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
             i.status, i.active, i.created_at,
             (SELECT COUNT(*) FROM ai_agente.t_dachser_sea_runs r WHERE r.item_id = i.id) AS run_count
      FROM ai_agente.t_dachser_sea_items i
      WHERE i.active = 1
    `;
    const params = [];
    if (analysisType) { query += ` AND i.view = ?`;                                                                 params.push(analysisType); }
    if (status && status !== 'todos') { query += ` AND i.status = ?`;                                               params.push(status); }
    if (search) { query += ` AND (i.arquivo_label LIKE ? OR i.consignee LIKE ? OR i.container LIKE ?)`; const p = `%${search}%`; params.push(p, p, p); }
    query += ` ORDER BY i.created_at DESC`;
    const items = await seaQuery(query, params);
    res.json({ success: true, items: items || [] });
  } catch (err) {
    console.error('[sea/maritimo/items GET]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar itens.' });
  }
});

// GET /api/sea/maritimo/items/:id
app.get('/api/sea/maritimo/items/:id', async (req, res) => {
  try {
    const items = await seaQuery(`
      SELECT i.id, i.view, i.arquivo_id, i.arquivo_label AS base_file_name,
             i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
             i.status, i.active, i.created_at
      FROM ai_agente.t_dachser_sea_items i WHERE i.id = ?
    `, [req.params.id]);
    res.json({ success: true, item: items[0] || null });
  } catch (err) {
    console.error('[sea/maritimo/items/:id GET]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar item.' });
  }
});

// GET /api/sea/maritimo/items/:id/history
app.get('/api/sea/maritimo/items/:id/history', async (req, res) => {
  try {
    const id = req.params.id;
    const [items, runs] = await Promise.all([
      seaQuery(`
        SELECT i.id, i.arquivo_id, i.arquivo_label AS base_file_name, i.consignee,
               i.container, i.status, i.view AS analysis_type, i.created_at, i.updated_at
        FROM ai_agente.t_dachser_sea_items i WHERE i.id = ?
      `, [id]),
      seaQuery(`
        SELECT r.id, r.item_id, r.mode, r.thread_id, r.run_id, r.status, r.result_text, r.created_at
        FROM ai_agente.t_dachser_sea_runs r WHERE r.item_id = ?
        ORDER BY r.created_at DESC
      `, [id]),
    ]);
    const arquivoId = items[0]?.arquivo_id;
    let itemFiles = [];
    if (arquivoId) {
      itemFiles = await seaQuery(`
        SELECT f.id, f.filename AS file_name, f.url AS file_url, f.mime AS file_type, f.size_bytes, f.created_at
        FROM ai_agente.t_dachser_sea_files f WHERE f.id = ? ORDER BY f.created_at ASC
      `, [arquivoId]);
    }
    const runsWithFiles = runs.map(r => ({ ...r, files: itemFiles }));
    res.json({ success: true, item: items[0] || { base_file_name: '' }, runs: runsWithFiles });
  } catch (err) {
    console.error('[sea/maritimo/items/:id/history]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar histórico.' });
  }
});

// GET /api/sea/maritimo/items/:id/files
app.get('/api/sea/maritimo/items/:id/files', async (req, res) => {
  try {
    const id = req.params.id;
    const items = await seaQuery(`SELECT arquivo_id FROM ai_agente.t_dachser_sea_items WHERE id = ?`, [id]);
    const arquivoId = items[0]?.arquivo_id;
    const files = await seaQuery(`
      SELECT DISTINCT id, filename, mime, size_bytes, url, rel_path, created_at
      FROM ai_agente.t_dachser_sea_files
      WHERE id = ? OR item_id = ?
      ORDER BY created_at ASC
    `, [arquivoId || 0, id]);
    // Separar arquivo base dos demais
    const baseFile = files.find(f => f.id === arquivoId);
    const analysisFiles = files.filter(f => f.id !== arquivoId);
    res.json({ success: true, files: analysisFiles, baseFileName: baseFile?.filename || '' });
  } catch (err) {
    console.error('[sea/maritimo/items/:id/files]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar arquivos.' });
  }
});

// DELETE /api/sea/maritimo/items/:id  (soft delete)
app.delete('/api/sea/maritimo/items/:id', async (req, res) => {
  try {
    await seaQuery(`UPDATE ai_agente.t_dachser_sea_items SET active = 0, active_at = NOW() WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[sea/maritimo/items DELETE]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao excluir item.' });
  }
});

// POST /api/sea/maritimo/complete-analysis
app.post('/api/sea/maritimo/complete-analysis', async (req, res) => {
  try {
    const { analysisId, itemId, completed } = req.body;
    await seaQuery(
      `UPDATE ai_agente.t_dachser_sea_runs SET status = ? WHERE id = ?`,
      [completed ? 'completed' : 'error', analysisId]
    );
    if (completed) {
      await seaQuery(`UPDATE ai_agente.t_dachser_sea_items SET status = 'realizado' WHERE id = ?`, [itemId]);
      // Salvar container em t_dachser_container ao concluir análise
      try {
        const itemData = await seaQuery(`SELECT container, consignee FROM ai_agente.t_dachser_sea_items WHERE id = ?`, [itemId]);
        const runData  = await seaQuery(`SELECT result_json FROM ai_agente.t_dachser_sea_runs WHERE item_id = ? AND status = 'completed' ORDER BY updated_at DESC LIMIT 1`, [itemId]);
        if (itemData.length > 0 && itemData[0].container) {
          const containerNum = itemData[0].container;
          const consignee   = itemData[0].consignee || '';
          let vessel = '', voyage = '', origem = '', destino = '';
          if (runData.length > 0 && runData[0].result_json) {
            try {
              const rj = typeof runData[0].result_json === 'string' ? JSON.parse(runData[0].result_json) : runData[0].result_json;
              if (rj.hblShippingData) {
                vessel  = rj.hblShippingData.vessel || '';
                voyage  = rj.hblShippingData.voyage || '';
                origem  = rj.hblShippingData.origin || rj.hblShippingData.portOfLoading || '';
                destino = rj.hblShippingData.destination || rj.hblShippingData.portOfDischarge || '';
              }
            } catch (_) {}
          }
          const existing = await seaQuery(`SELECT id FROM ai_agente.t_dachser_container WHERE container = ?`, [containerNum.trim()]);
          if (!existing.length) {
            await seaQuery(
              `INSERT INTO ai_agente.t_dachser_container (container, vessel, voyage, origem, destino, consignee) VALUES (?, ?, ?, ?, ?, ?)`,
              [containerNum.trim(), vessel, voyage, origem, destino, consignee]
            );
          }
        }
      } catch (containerErr) {
        console.error('[complete-analysis] container save error (não crítico):', containerErr.message);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[sea/maritimo/complete-analysis]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao completar análise.' });
  }
});

// POST /api/sea/maritimo/reextract-metadata
app.post('/api/sea/maritimo/reextract-metadata', async (req, res) => {
  try {
    const { forceAll, itemId } = req.body;
    let query = `SELECT id, arquivo_label FROM ai_agente.t_dachser_sea_items WHERE active = 1`;
    const params = [];
    if (itemId) { query += ` AND id = ?`; params.push(itemId); }
    else if (!forceAll) { query += ` AND (consignee IS NULL OR container IS NULL)`; }
    const items = await seaQuery(query, params);
    let processed = 0;
    for (const item of items) {
      const match = item.arquivo_label?.match(/([A-Z]{4}\d{7})/);
      if (match) {
        await seaQuery(`UPDATE ai_agente.t_dachser_sea_items SET container = ? WHERE id = ?`, [match[1], item.id]);
        processed++;
      }
    }
    res.json({ success: true, processed, updated: processed });
  } catch (err) {
    console.error('[sea/maritimo/reextract-metadata]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao reextrair metadados.' });
  }
});

// GET /api/sea/maritimo/system-logs
app.get('/api/sea/maritimo/system-logs', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await seaQuery(
      `SELECT * FROM ai_agente.t_dachser_sea_runs ORDER BY created_at DESC LIMIT ?`, [limit]
    );
    res.json({ success: true, logs });
  } catch (err) {
    console.error('[sea/maritimo/system-logs]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar logs.' });
  }
});

// GET /api/sea/maritimo/export-report
app.get('/api/sea/maritimo/export-report', async (req, res) => {
  try {
    const { analysisType, dateFrom, dateTo, status } = req.query;
    let query = `
      SELECT i.id, i.arquivo_label AS arquivo, i.mbl_number, i.carrier AS armador,
             i.consignee AS cliente, i.ata_date AS data_atracacao, i.container,
             i.view AS tipo_analise, i.status, i.created_at AS data_criacao
      FROM ai_agente.t_dachser_sea_items i WHERE i.active = 1
    `;
    const params = [];
    if (analysisType && analysisType !== 'todos') { query += ` AND i.view = ?`;                   params.push(analysisType); }
    if (status && status !== 'todos')             { query += ` AND i.status = ?`;                  params.push(status); }
    if (dateFrom)                                 { query += ` AND DATE(i.created_at) >= ?`;       params.push(dateFrom); }
    if (dateTo)                                   { query += ` AND DATE(i.created_at) <= ?`;       params.push(dateTo); }
    query += ` ORDER BY i.created_at DESC LIMIT 5000`;
    const items = await seaQuery(query, params);
    res.json({ success: true, items: items || [] });
  } catch (err) {
    console.error('[sea/maritimo/export-report]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao exportar relatório.' });
  }
});

// GET /api/sea/mbls-export — exportação Excel de MBLs marítimos
app.get('/api/sea/mbls-export', async (req, res) => {
  try {
    const rows = await seaQuery(`
      SELECT DISTINCT
        tmd.mawb, tmd.tipo_processo,
        DATE_FORMAT(tmd.etd, '%Y-%m-%d') AS etd,
        DATE_FORMAT(tmd.eta, '%Y-%m-%d') AS eta,
        tmd.shipper, tmd.consignee, tmd.coordenador,
        tmd.origem AS origin, tmd.destino AS destination
      FROM dados_dachser.t_master_dados tmd
      WHERE tmd.tipo_processo LIKE '%SEA%'
        AND tmd.etd >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
        AND tmd.mawb IS NOT NULL AND tmd.mawb != ''
      ORDER BY tmd.etd DESC, tmd.mawb
    `);
    const data = rows.map(r => ({
      mawb: (r.mawb || '').toString().trim(),
      tipo_processo: (r.tipo_processo || '').toString().trim(),
      etd: r.etd || null,
      eta: r.eta || null,
      shipper: r.shipper ? r.shipper.toString().trim() : null,
      consignee: r.consignee ? r.consignee.toString().trim() : null,
      coordenador: r.coordenador ? r.coordenador.toString().trim() : null,
      origin: r.origin ? r.origin.toString().trim() : null,
      destination: r.destination ? r.destination.toString().trim() : null,
    }));
    res.json({ success: true, data, count: data.length });
  } catch (err) {
    console.error('[sea/mbls-export]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao exportar MBLs.' });
  }
});

// ─── SEA: Exemplos aprovados (IA learning) ───────────────────────────────────

// GET /api/sea/maritimo/approved-examples/list  (mais específico — antes de /:id)
app.get('/api/sea/maritimo/approved-examples/list', async (req, res) => {
  try {
    const { analysisType, isActive, limit: lim, offset: off } = req.query;
    let query = `SELECT id, run_id, item_id, analysis_type, scenario_type, hbl_count,
                        consignee, approved_by_name, approved_at, is_active,
                        usage_count, effectiveness_score, last_used_at
                 FROM ai_agente.t_dachser_sea_approved_examples WHERE 1=1`;
    const params = [];
    if (analysisType) { query += ` AND analysis_type = ?`; params.push(analysisType); }
    if (isActive !== undefined && isActive !== '') { query += ` AND is_active = ?`; params.push(isActive === 'true' ? 1 : 0); }
    query += ` ORDER BY approved_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(lim) || 20, Number(off) || 0);
    const examples = await seaQuery(query, params);
    let cQuery = `SELECT COUNT(*) AS total FROM ai_agente.t_dachser_sea_approved_examples WHERE 1=1`;
    const cParams = [];
    if (analysisType) { cQuery += ` AND analysis_type = ?`; cParams.push(analysisType); }
    if (isActive !== undefined && isActive !== '') { cQuery += ` AND is_active = ?`; cParams.push(isActive === 'true' ? 1 : 0); }
    const total = await seaQuery(cQuery, cParams);
    res.json({ success: true, examples: examples || [], total: Number(total[0]?.total || 0) });
  } catch (err) {
    console.error('[sea/approved-examples/list]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao listar exemplos.' });
  }
});

// GET /api/sea/maritimo/approved-examples
app.get('/api/sea/maritimo/approved-examples', async (req, res) => {
  try {
    const { analysisType, hblCount, limit: lim } = req.query;
    const maxEx = Math.min(Number(lim) || 3, 5);
    const examples = await seaQuery(`
      SELECT id, run_id, analysis_type, scenario_type, hbl_count, consignee,
             input_summary, result_text, approved_by_name, approved_at,
             usage_count, effectiveness_score
      FROM ai_agente.t_dachser_sea_approved_examples
      WHERE analysis_type = ? AND is_active = TRUE AND effectiveness_score >= 50
      ORDER BY CASE WHEN hbl_count = ? THEN 0 ELSE 1 END, effectiveness_score DESC, approved_at DESC
      LIMIT ?
    `, [analysisType || '', Number(hblCount) || 1, maxEx]);
    if (examples.length > 0) {
      const ids = examples.map(e => e.id).join(',');
      await seaQuery(`UPDATE ai_agente.t_dachser_sea_approved_examples SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id IN (${ids})`);
    }
    res.json({ success: true, examples: examples || [] });
  } catch (err) {
    console.error('[sea/approved-examples GET]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao buscar exemplos.' });
  }
});

// POST /api/sea/maritimo/approved-examples
app.post('/api/sea/maritimo/approved-examples', async (req, res) => {
  try {
    const { runId, itemId, analysisType, consignee, scenarioType, hblCount, inputSummary, resultText, approvedBy, approvedByName } = req.body;
    if (!runId || !itemId || !analysisType || !resultText) {
      return res.status(400).json({ success: false, error: 'runId, itemId, analysisType e resultText são obrigatórios.' });
    }
    const existing = await seaQuery(`SELECT id FROM ai_agente.t_dachser_sea_approved_examples WHERE run_id = ? LIMIT 1`, [runId]);
    if (existing.length > 0) {
      await seaQuery(
        `UPDATE ai_agente.t_dachser_sea_approved_examples
         SET result_text = ?, scenario_type = ?, hbl_count = ?, input_summary = ?,
             approved_by = ?, approved_by_name = ?, approved_at = NOW(), is_active = TRUE
         WHERE run_id = ?`,
        [resultText, scenarioType || '1_hbl', hblCount || 1, inputSummary || '', approvedBy || null, approvedByName || null, runId]
      );
      return res.json({ success: true, action: 'updated', id: existing[0].id });
    }
    await seaQuery(
      `INSERT INTO ai_agente.t_dachser_sea_approved_examples
         (run_id, item_id, analysis_type, consignee, scenario_type, hbl_count, input_summary, result_text, approved_by, approved_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [runId, itemId, analysisType, consignee || null, scenarioType || '1_hbl', hblCount || 1, inputSummary || '', resultText, approvedBy || null, approvedByName || null]
    );
    const lastId = await seaQuery('SELECT LAST_INSERT_ID() AS id');
    res.json({ success: true, action: 'inserted', id: lastId[0]?.id });
  } catch (err) {
    console.error('[sea/approved-examples POST]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao salvar exemplo.' });
  }
});

// PATCH /api/sea/maritimo/approved-examples/:id/toggle
app.patch('/api/sea/maritimo/approved-examples/:id/toggle', async (req, res) => {
  try {
    const { isActive } = req.body;
    await seaQuery(`UPDATE ai_agente.t_dachser_sea_approved_examples SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[sea/approved-examples toggle]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao atualizar exemplo.' });
  }
});

// DELETE /api/sea/maritimo/approved-examples/:id
app.delete('/api/sea/maritimo/approved-examples/:id', async (req, res) => {
  try {
    await seaQuery(`DELETE FROM ai_agente.t_dachser_sea_approved_examples WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[sea/approved-examples DELETE]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao excluir exemplo.' });
  }
});

// ─── Registro de rotas ───
app.get('/tracking-aereo', handleTrackingAereo);                          // legado (compat)
app.get('/api/air/tracking-aereo', handleTrackingAereo);
app.get('/api/air/tracking-aereo/filters', handleFilters);
app.get('/api/air/tracking-aereo/summary', handleSummary);
app.post('/api/air/tracking-aereo/failed-alert', handleFailedAlert);
app.post('/api/air/master-swaps', handleMasterSwaps);
app.get('/api/air/master-discrepancies', handleDiscrepancyList);
app.post('/api/air/master-discrepancies/resolve', handleDiscrepancyResolve);
app.post('/api/air/usage-log', handleUsageLog);

// ═══════════════════════════════════════════════════════════════════
// FIN-1 — ESTEIRA / VOUCHERS
// ═══════════════════════════════════════════════════════════════════
const finQuery = (sql, params = []) => queryWithRetry(sql, params, 1, 'fin');

// helper: normaliza campo de data para YYYY-MM-DD HH:MM:SS
function formatDateForMariaDB(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (!s || s === 'null' || s === 'undefined' || s === 'Invalid Date') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return `${s.split('T')[0]} 00:00:00`;
  const p = new Date(s);
  if (!isNaN(p.getTime())) {
    return `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-${String(p.getDate()).padStart(2,'0')} 00:00:00`;
  }
  return null;
}

// GET /api/fin/stats
app.get('/api/fin/stats', async (req, res) => {
  try {
    const [lastRows, statsRows, etapaRows] = await Promise.all([
      finQuery(`SELECT MAX(data_insert) as last_update FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'`),
      finQuery(`SELECT COUNT(*) as total_records, COALESCE(SUM(valor_nf), 0) as total_valor FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'`),
      finQuery(`SELECT COALESCE(etapa_atual, 'OPERACAO') as etapa, COUNT(*) as count FROM dados_dachser.t_vouchers GROUP BY etapa_atual ORDER BY count DESC`),
    ]);
    const etapaLabels = { RASCUNHO:'Rascunho', OPERACAO:'Operação', FISCAL:'Fiscal', SUPERVISOR:'Supervisor', FINANCEIRO:'Financeiro', ROBO:'Robô', CONCLUIDO:'Concluído', CANCELADO:'Cancelado', A_PROCESSAR:'A Processar' };
    res.json({
      success: true,
      stats: {
        lastUpdate: lastRows[0]?.last_update || null,
        totalVouchers: Number(statsRows[0]?.total_records) || 0,
        totalValor: Number(statsRows[0]?.total_valor) || 0,
        etapaBreakdown: (etapaRows || []).map(r => ({ etapa: r.etapa, label: etapaLabels[r.etapa] || r.etapa, count: Number(r.count) || 0 })),
      },
    });
  } catch (err) {
    console.error('[GET /api/fin/stats]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/users
app.get('/api/fin/users', async (req, res) => {
  try {
    const users = await finQuery(
      `SELECT id, username, email, is_admin,
              COALESCE(esteira_role, NULL) as esteira_role,
              COALESCE(esteira_active, 1) as esteira_active,
              supervisor_id
       FROM ai_agente.t_users_dachser
       ORDER BY username ASC`
    );
    res.json({ success: true, users: users || [] });
  } catch (err) {
    console.error('[GET /api/fin/users]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/search-masters?spo_prefix=...
app.get('/api/fin/vouchers/search-masters', async (req, res) => {
  try {
    const { spo_prefix } = req.query;
    if (!spo_prefix || String(spo_prefix).length < 2) {
      return res.json({ success: true, data: [] });
    }
    const rows = await finQuery(
      `SELECT DISTINCT voucher_master_id, numero_spo
         FROM dados_dachser.t_vouchers
        WHERE voucher_master_id IS NOT NULL
          AND SUBSTRING_INDEX(TRIM(numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
        LIMIT 50`,
      [spo_prefix]
    );
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/search-masters]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/search?search=...
app.get('/api/fin/vouchers/search', async (req, res) => {
  try {
    const rawTerm = String(req.query.search || '').trim();
    if (!rawTerm || rawTerm.length < 2) return res.json({ success: true, data: [], count: 0 });
    const looksLikeFullNd = /^[A-Z0-9._\-\/]{4,}$/i.test(rawTerm);
    const exactNd = looksLikeFullNd ? rawTerm.split(' ')[0] : null;
    let vouchers = [];
    if (exactNd) {
      vouchers = await finQuery(`
        SELECT v.*,
          COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento,
          dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo,
          dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario,
          dfv.valor_nf as dfv_valor_nf,
          CASE WHEN v.is_master = 1 THEN COALESCE(
            (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'MASTER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
            v.criado_por_user_id)
          ELSE COALESCE(dfv.created_by,
            (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'VOUCHER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
            v.criado_por_user_id)
          END as dfv_created_by,
          (SELECT l.user_name FROM dados_dachser.t_voucher_logs l WHERE l.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND l.user_name IS NOT NULL AND l.user_name <> '' ORDER BY l.data_hora DESC LIMIT 1) AS enviado_por_user_name
        FROM dados_dachser.t_vouchers v
        LEFT JOIN (
          SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao,
            MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social,
            MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf
          FROM dados_dachser.t_dados_financeiro_voucher
          WHERE SUBSTRING_INDEX(TRIM(nd), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
          GROUP BY nd
        ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
        WHERE v.sync_status = 'ATIVO'
          AND (v.voucher_master_id IS NULL OR v.voucher_master_id = '')
          AND v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')
          AND (SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci OR dfv.nd IS NOT NULL)
        ORDER BY v.updated_at DESC LIMIT 100`,
      [exactNd, exactNd]);
    }
    res.json({ success: true, data: vouchers || [], count: vouchers?.length || 0 });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/pendentes-rm
app.get('/api/fin/vouchers/pendentes-rm', async (req, res) => {
  try {
    let pendentes;
    try {
      pendentes = await finQuery(`
        WITH spo AS (
          SELECT 'SPO' AS source, dfs.id_rm, dfs.nd, dfs.documento, dfs.nome_beneficiario,
                 dfs.nome_cobranca, dfs.numero_nf, dfs.numero_processo, dfs.modal,
                 dfs.tipo_pag, dfs.forma_pag, dfs.data_emissao, dfs.data_vencimento,
                 dfs.valor_nf, dfs.moeda, dfs.cnpj, dfs.razao_social, dfs.created_by, dfs.detalhes
            FROM dados_dachser.t_dados_financeiro_spo dfs
           WHERE (dfs.nome_beneficiario IS NULL OR LOWER(dfs.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfs.modal IS NULL OR dfs.modal <> 'ADM')
        ),
        voucher AS (
          SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
                 dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
                 dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
                 dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes
            FROM dados_dachser.t_dados_financeiro_voucher dfv
           WHERE (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
        ),
        unified AS (
          SELECT * FROM spo
          UNION ALL
          SELECT v.* FROM voucher v
           WHERE NOT EXISTS (
             SELECT 1 FROM spo s
              WHERE s.numero_processo IS NOT NULL
                AND s.numero_processo COLLATE utf8mb4_unicode_ci = v.numero_processo COLLATE utf8mb4_unicode_ci
           )
        )
        SELECT u.* FROM unified u
          LEFT JOIN dados_dachser.t_vouchers v
                 ON SUBSTRING_INDEX(TRIM(u.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
          LEFT JOIN dados_dachser.tbaixas b ON u.id_rm = b.IdLancamentoRM
         WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
         ORDER BY u.data_vencimento ASC`);
    } catch (e) {
      console.warn('[pendentes-rm] CTE fallback:', e.message);
      pendentes = await finQuery(`
        SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
               dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
               dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
               dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes
          FROM dados_dachser.t_dados_financeiro_voucher dfv
          LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
          LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
         WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
           AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
           AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
         ORDER BY dfv.data_vencimento ASC`);
    }
    const normalized = (pendentes || []).map(row => {
      let processos_associados = [];
      if (row.source === 'SPO' && row.detalhes) {
        const seen = new Set();
        processos_associados = String(row.detalhes).split(';').map(s => s.trim()).filter(s => s && !seen.has(s) && seen.add(s));
      }
      return { ...row, processos_associados };
    });
    res.json({ success: true, data: normalized });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/pendentes-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/combined?data_vencimento_inicio=&data_vencimento_fim=
app.get('/api/fin/vouchers/combined', async (req, res) => {
  try {
    const dataVencInicio = req.query.data_vencimento_inicio || req.query.data_emissao_inicio || null;
    const dataVencFim = req.query.data_vencimento_fim || req.query.data_emissao_fim || null;
    const hasMonthFilter = !!(dataVencInicio && dataVencFim);

    // backfill ref_fornecedor/mawb_mbl (idempotente, silencioso)
    try { await finQuery(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS ref_fornecedor VARCHAR(255) DEFAULT NULL`); } catch (_) {}
    try { await finQuery(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS mawb_mbl VARCHAR(255) DEFAULT NULL`); } catch (_) {}
    try {
      await finQuery(`UPDATE dados_dachser.t_vouchers v JOIN (SELECT SUBSTRING_INDEX(TRIM(nd), ' ', 1) AS nd_key, MAX(ref_fornecedor) AS ref_fornecedor, MAX(mawb_mbl) AS mawb_mbl FROM dados_dachser.t_dados_financeiro_voucher WHERE (ref_fornecedor IS NOT NULL AND ref_fornecedor <> '') OR (mawb_mbl IS NOT NULL AND mawb_mbl <> '') GROUP BY nd_key) dfv ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci = dfv.nd_key COLLATE utf8mb4_general_ci SET v.ref_fornecedor = COALESCE(NULLIF(v.ref_fornecedor,''), dfv.ref_fornecedor), v.mawb_mbl = COALESCE(NULLIF(v.mawb_mbl,''), dfv.mawb_mbl) WHERE (v.ref_fornecedor IS NULL OR v.ref_fornecedor = '' OR v.mawb_mbl IS NULL OR v.mawb_mbl = '')`);
    } catch (_) {}

    const ativosMonthClause = hasMonthFilter ? `AND (v.etapa_atual IN ('RASCUNHO','OPERACAO','FINANCEIRO') OR (v.vencimento >= ? AND v.vencimento < ?) OR (v.vencimento IS NULL AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?))` : '';
    const ativosParams = hasMonthFilter ? [dataVencInicio, dataVencFim, dataVencInicio, dataVencFim] : [];

    const combinedAtivos = await finQuery(`
      SELECT v.*,
        COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento,
        dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo,
        dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario,
        dfv.valor_nf as dfv_valor_nf, dfv.ref_fornecedor as dfv_ref_fornecedor, dfv.mawb_mbl as dfv_mawb_mbl,
        CASE WHEN v.is_master = 1 THEN COALESCE(
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'MASTER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        ELSE COALESCE(dfv.created_by,
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'VOUCHER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        END as dfv_created_by,
        (SELECT l.user_name FROM dados_dachser.t_voucher_logs l WHERE l.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND l.user_name IS NOT NULL AND l.user_name <> '' ORDER BY l.data_hora DESC LIMIT 1) AS enviado_por_user_name
      FROM dados_dachser.t_vouchers v
      LEFT JOIN (
        SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao,
          MAX(data_vencimento) as data_vencimento, MIN(numero_processo) as numero_processo,
          MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario,
          MAX(valor_nf) as valor_nf, MAX(ref_fornecedor) as ref_fornecedor, MAX(mawb_mbl) as mawb_mbl
        FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      WHERE sync_status = "ATIVO"
        AND (voucher_master_id IS NULL OR voucher_master_id = "")
        AND etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')
        AND (etapa_atual NOT IN ("CONCLUIDO","CANCELADO") OR (etapa_atual IN ("CONCLUIDO","CANCELADO") AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))
        ${ativosMonthClause}
      ORDER BY v.created_at DESC`, ativosParams);

    const pendentesMonthClause = hasMonthFilter ? `AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?` : '';
    const pendentesParams = hasMonthFilter ? [dataVencInicio, dataVencFim] : [];

    const combinedPendentes = await finQuery(`
      SELECT dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca,
             dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag,
             dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by
        FROM dados_dachser.t_dados_financeiro_voucher dfv
        LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci
        LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
       WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
         AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
         AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
         ${pendentesMonthClause}
       ORDER BY dfv.data_vencimento ASC`, pendentesParams);

    res.json({
      success: true,
      ativos: combinedAtivos || [],
      pendentes_rm: combinedPendentes || [],
      count_ativos: combinedAtivos?.length || 0,
      count_pendentes: combinedPendentes?.length || 0,
    });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/combined]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/esteira?search=&etapa=
app.get('/api/fin/vouchers/esteira', async (req, res) => {
  try {
    const { search, etapa } = req.query;
    const whereClauses = [
      '(v.voucher_master_id IS NULL OR v.voucher_master_id = "")',
      `v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')`,
      '(dfv.modal IS NULL OR dfv.modal <> "ADM")',
      '(v.etapa_atual != "CONCLUIDO" OR (v.etapa_atual = "CONCLUIDO" AND v.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))',
      `NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = dfv.id_rm AND b.StatusLan IN (1, 2, 3))`,
    ];
    const params = [];
    if (search) {
      whereClauses.push('(v.numero_spo LIKE ? OR v.fornecedor LIKE ? OR v.cnpj_fornecedor LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (etapa) { whereClauses.push('v.etapa_atual = ?'); params.push(etapa); }
    params.push(); // no extra needed
    const vouchers = await finQuery(`
      SELECT v.*, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo,
        dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf,
        (SELECT username FROM ai_agente.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1) AS criado_por_user_name,
        CASE WHEN v.is_master = 1 THEN COALESCE(
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'MASTER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        ELSE COALESCE(dfv.created_by,
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'VOUCHER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        END as dfv_created_by,
        (SELECT l.user_name FROM dados_dachser.t_voucher_logs l WHERE l.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND l.acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE','BAIXA_MANUAL','VOUCHER_CRIADO','RASCUNHO_ENVIADO','MASTER_APROVADO_OPERACAO') ORDER BY l.data_hora DESC LIMIT 1) AS enviado_por_user_name
      FROM dados_dachser.t_vouchers v
      LEFT JOIN (
        SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MIN(numero_processo) as numero_processo,
          MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf
        FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY v.id
      ORDER BY v.created_at DESC`, params);
    res.json({ success: true, data: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/esteira]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/:id
app.get('/api/fin/vouchers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const vouchers = await finQuery(`
      SELECT v.*,
        COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento,
        dfv.id_rm AS dfv_id_rm, dfv.numero_processo AS dfv_numero_processo,
        dfv.razao_social AS dfv_razao_social, dfv.nome_beneficiario AS dfv_nome_beneficiario,
        dfv.valor_nf AS dfv_valor_nf, dfv.moeda AS dfv_moeda, dfv.cnpj AS dfv_cnpj, dfv.nome_cobranca AS dfv_nome_cobranca
      FROM dados_dachser.t_vouchers v
      LEFT JOIN (
        SELECT nd, MIN(id_rm) AS id_rm, MAX(data_emissao) AS data_emissao, MIN(numero_processo) AS numero_processo,
          MAX(razao_social) AS razao_social, MAX(nome_beneficiario) AS nome_beneficiario, MAX(valor_nf) AS valor_nf,
          MAX(moeda) AS moeda, MAX(cnpj) AS cnpj, MAX(nome_cobranca) AS nome_cobranca
        FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      WHERE v.id = ?`, [id]);

    const voucher = vouchers?.[0] || null;
    if (!voucher) return res.json({ success: true, data: null, anexos: [], logs: [] });

    const [anexos, logs] = await Promise.all([
      finQuery(`SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC`, [id]).catch(() => []),
      finQuery(`SELECT id, voucher_id, user_id, user_name, acao, detalhe, data_hora FROM dados_dachser.t_voucher_logs WHERE voucher_id = ? ORDER BY data_hora DESC`, [id]).catch(() => []),
    ]);

    res.json({ success: true, data: voucher, anexos: anexos || [], logs: logs || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id
app.patch('/api/fin/vouchers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { updates: updatesObj, user_id, user_name, ...directFields } = req.body || {};
    const updateData = updatesObj || directFields;

    const ETAPAS_EDITAVEIS = ['RASCUNHO', 'A_PROCESSAR', 'OPERACAO', 'AJUSTE_OPERACAO'];
    const DATA_EDIT_FIELDS = new Set(['numero_spo','fornecedor','cnpj_fornecedor','valor','moeda','vencimento','data_emissao_documento','cobranca_em_nome_de','forma_pagamento','tipo_documento','filial','urgencia_tipo','cliente_email','remessa','chave_pix']);
    const hasDataEdit = Object.keys(updateData || {}).some(k => DATA_EDIT_FIELDS.has(k));

    const etapaRows = await finQuery(`SELECT etapa_atual, vencimento, valor, forma_pagamento, tipo_documento, fornecedor, cnpj_fornecedor, moeda, data_emissao_documento, cobranca_em_nome_de, filial, urgencia_tipo, chave_pix, numero_spo FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1`, [id]);
    const currentEtapa = etapaRows?.[0]?.etapa_atual || null;
    const beforeRow = etapaRows?.[0] || {};

    if (hasDataEdit && currentEtapa && !ETAPAS_EDITAVEIS.includes(currentEtapa)) {
      try {
        await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'VOUCHER_EDICAO_BLOQUEADA', ?, NOW())`,
          [id, user_id || null, user_name || 'Sistema', `Tentativa de edição bloqueada — etapa: ${currentEtapa}. Campos: ${Object.keys(updateData).join(', ')}`]);
      } catch (_) {}
      return res.status(403).json({ success: false, error: 'EDICAO_BLOQUEADA_ETAPA', message: 'Edição de dados permitida apenas nas etapas A Processar, Operacional e Ajuste Operacional.', etapa_atual: currentEtapa });
    }

    const novaEtapa = updateData?.etapa_atual;
    const ETAPAS_LIVRES_DESTINO = new Set(['A_PROCESSAR','OPERACAO','AJUSTE_OPERACAO','CANCELADO','DEVOLVIDO_FISCAL','RASCUNHO']);
    const ETAPAS_GATED_ORIGEM = new Set(['A_PROCESSAR','OPERACAO']);
    if (novaEtapa && currentEtapa && ETAPAS_GATED_ORIGEM.has(currentEtapa) && !ETAPAS_LIVRES_DESTINO.has(novaEtapa) && novaEtapa !== currentEtapa) {
      const anxRows = await finQuery(`SELECT COUNT(*) AS c FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [id]);
      if (Number(anxRows?.[0]?.c || 0) === 0) {
        try {
          await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'ETAPA_BLOQUEADA_SEM_ANEXO', ?, NOW())`,
            [id, user_id || null, user_name || 'Sistema', `Bloqueado: ${currentEtapa} → ${novaEtapa} sem anexos.`]);
        } catch (_) {}
        return res.status(400).json({ success: false, error: 'ANEXOS_OBRIGATORIOS', message: 'Anexe ao menos 1 documento antes de avançar o voucher.', etapa_atual: currentEtapa, etapa_destino: novaEtapa });
      }
    }

    const fieldMapping = {
      etapa_atual:'etapa_atual', status_baixa:'status_baixa', status_financeiro:'status_financeiro', status_envio_cliente:'status_envio_cliente',
      comentarios_operacao:'comentarios_operacao', comentarios_fiscal:'comentarios_fiscal', comentarios_financeiro:'comentarios_financeiro',
      ajuste_operacao:'ajuste_operacao', ajuste_fiscal:'ajuste_fiscal',
      responsavel_operacao_user_id:'responsavel_operacao_user_id', responsavel_fiscal_user_id:'responsavel_fiscal_user_id',
      responsavel_financeiro_user_id:'responsavel_financeiro_user_id', responsavel_supervisor_user_id:'responsavel_supervisor_user_id',
      aprovado_por_user_id:'aprovado_por_user_id',
      numero_spo:'numero_spo', fornecedor:'fornecedor', cnpj_fornecedor:'cnpj_fornecedor', valor:'valor', moeda:'moeda',
      vencimento:'vencimento', data_emissao_documento:'data_emissao_documento', cobranca_em_nome_de:'cobranca_em_nome_de',
      forma_pagamento:'forma_pagamento', tipo_documento:'tipo_documento', filial:'filial', urgencia_tipo:'urgencia_tipo',
      cliente_email:'cliente_email', remessa:'remessa', chave_pix:'chave_pix',
      status_documento_fiscal:'status_documento_fiscal', status_comprovante:'status_comprovante',
      origem_processo:'origem_processo', is_pronto_para_robo:'is_pronto_para_robo',
      linha_digitavel:'linha_digitavel',
    };
    const dateFields = new Set(['vencimento','data_emissao_documento']);

    const setClauses = [];
    const params = [];
    const diffParts = [];

    for (const [key, dbField] of Object.entries(fieldMapping)) {
      if (updateData[key] !== undefined) {
        setClauses.push(`${dbField} = ?`);
        const val = dateFields.has(key) ? formatDateForMariaDB(updateData[key]) : updateData[key];
        params.push(val);
        if (key in beforeRow) {
          const bv = String(beforeRow[key] ?? '');
          const av = String(updateData[key] ?? '');
          if (bv !== av) diffParts.push(`${key}: ${bv || '(vazio)'} → ${av || '(vazio)'}`);
        }
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = NOW()');
      params.push(id);
      await finQuery(`UPDATE dados_dachser.t_vouchers SET ${setClauses.join(', ')} WHERE id = ?`, params);
      const detalhe = diffParts.length > 0 ? `Voucher editado.\n${diffParts.join('\n')}` : `Voucher editado. Campos: ${Object.keys(updateData).filter(k => fieldMapping[k] !== undefined).join(', ')}`;
      try {
        await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'VOUCHER_EDITADO', ?, NOW())`,
          [id, user_id || null, user_name || 'Sistema', detalhe]);
      } catch (_) {}
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/:id/log
app.post('/api/fin/vouchers/:id/log', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, user_name, acao, detalhe, origin, entity_type, event_type, payload_json } = req.body || {};
    if (!acao) return res.status(400).json({ success: false, error: 'acao é obrigatório' });
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_logs
       (id, voucher_id, user_id, user_name, acao, detalhe, origin, entity_type, event_type, payload_json, data_hora)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, user_id || null, user_name || 'Sistema', acao, detalhe || null,
        origin || 'UI', entity_type || 'VOUCHER', event_type || null,
        payload_json ? JSON.stringify(payload_json) : null,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/log]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/vouchers/:id
app.delete('/api/fin/vouchers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [id]);
    try { await finQuery(`DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?`, [id]); } catch (_) {}
    await finQuery(`DELETE FROM dados_dachser.t_vouchers WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/vouchers/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/:id/disassemble
app.post('/api/fin/vouchers/:id/disassemble', async (req, res) => {
  try {
    const master_id = req.params.id;
    const { child_ids, keep_master } = req.body || {};
    const computeDestino = (urgencia, cobranca) => {
      if (String(urgencia || '').toUpperCase() === 'URGENTE_REAL') return 'SUPERVISOR';
      if (String(cobranca || '').toUpperCase() === 'CLIENTE') return 'FINANCEIRO';
      return 'FISCAL';
    };
    const targetIds = (child_ids && child_ids.length > 0)
      ? child_ids
      : ((await finQuery(`SELECT id FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?`, [master_id])) || []).map(r => r.id).filter(Boolean);

    let childrenRestored = 0;
    if (targetIds.length > 0) {
      const ph = targetIds.map(() => '?').join(',');
      const childRows = await finQuery(`SELECT id, urgencia_tipo, cobranca_em_nome_de FROM dados_dachser.t_vouchers WHERE id IN (${ph})`, targetIds);
      for (const c of childRows) {
        await finQuery(`UPDATE dados_dachser.t_vouchers SET voucher_master_id = NULL, etapa_atual = ?, updated_at = NOW() WHERE id = ?`, [computeDestino(c.urgencia_tipo, c.cobranca_em_nome_de), c.id]);
      }
      childrenRestored = childRows.length;
    }

    const remaining = await finQuery(`SELECT COUNT(*) as count FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?`, [master_id]);
    const remainingCount = Number(remaining?.[0]?.count || 0);

    if (!keep_master || remainingCount === 0) {
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [master_id]); } catch (_) {}
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?`, [master_id]); } catch (_) {}
      await finQuery(`DELETE FROM dados_dachser.t_vouchers WHERE id = ?`, [master_id]);
    }
    res.json({ success: true, childrenRestored, remainingChildren: remainingCount, masterDeleted: !keep_master || remainingCount === 0 });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/disassemble]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/by-nd?nd=...
app.get('/api/fin/vouchers/by-nd', async (req, res) => {
  try {
    const nd = String(req.query.nd || '').trim();
    if (!nd) return res.status(400).json({ success: false, error: 'nd é obrigatório' });

    const cols = `id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id`;
    let vouchers = await finQuery(`SELECT ${cols} FROM dados_dachser.t_vouchers WHERE id_rm = ? ORDER BY created_at DESC LIMIT 5`, [nd]);
    if (!vouchers?.length) {
      vouchers = await finQuery(`SELECT ${cols} FROM dados_dachser.t_vouchers WHERE processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY created_at DESC LIMIT 5`, [nd]);
    }
    if (!vouchers?.length) {
      vouchers = await finQuery(`SELECT ${cols} FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5`, [nd]);
    }
    const masterVouchers = await finQuery(`
      SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.is_master, m.nome_master, m.id_rm, m.processo_id, c.id as child_voucher_id, c.numero_spo as child_spo
      FROM dados_dachser.t_vouchers c
      JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id
      WHERE (c.id_rm = ? OR c.processo_id = ?) AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != ''
      LIMIT 5`, [nd, nd]).catch(() => []);

    res.json({ success: true, vouchers: vouchers || [], masterVouchers: masterVouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/by-nd]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/users/:id/role
app.patch('/api/fin/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { esteira_role } = req.body || {};
    await finQuery(`UPDATE ai_agente.t_users_dachser SET esteira_role = ? WHERE id = ?`, [esteira_role || null, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/users/:id/role]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/users/:id/active
app.patch('/api/fin/users/:id/active', async (req, res) => {
  try {
    const { id } = req.params;
    const { esteira_active } = req.body || {};
    await finQuery(`UPDATE ai_agente.t_users_dachser SET esteira_active = ? WHERE id = ?`, [esteira_active ? 1 : 0, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/users/:id/active]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-2: ACCRUAL ──────────────────────────────────────────────────────────

// GET /api/fin/accrual?search=
app.get('/api/fin/accrual', async (req, res) => {
  try {
    const { search } = req.query;
    let rows;
    if (search) {
      rows = await finQuery(`SELECT * FROM dados_dachser.t_accrual_entries WHERE fornecedor LIKE ? OR shared_code LIKE ? ORDER BY created_at DESC`, [`%${search}%`, `%${search}%`]);
    } else {
      rows = await finQuery(`SELECT * FROM dados_dachser.t_accrual_entries ORDER BY created_at DESC`);
    }
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/accrual]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/accrual
app.post('/api/fin/accrual', async (req, res) => {
  try {
    const { fornecedor, valor, shared_code, status_accrual, uploaded_by_user_id } = req.body || {};
    if (!fornecedor || valor == null) return res.status(400).json({ success: false, error: 'fornecedor e valor são obrigatórios' });
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    await finQuery(`INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, fornecedor, valor, shared_code || null, status_accrual || 'ATIVO', uploaded_by_user_id || null]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[POST /api/fin/accrual]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/accrual/bulk
app.post('/api/fin/accrual/bulk', async (req, res) => {
  try {
    const { entries } = req.body || {};
    if (!entries?.length) return res.json({ success: true, inserted: 0 });
    const { randomUUID } = await import('crypto');
    let inserted = 0;
    for (const e of entries) {
      await finQuery(`INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual) VALUES (?, ?, ?, ?, 'ATIVO')`,
        [randomUUID(), e.fornecedor, e.valor, e.shared_code || null]);
      inserted++;
    }
    res.json({ success: true, inserted });
  } catch (err) {
    console.error('[POST /api/fin/accrual/bulk]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/accrual/all
app.delete('/api/fin/accrual/all', async (req, res) => {
  try {
    await finQuery(`DELETE FROM dados_dachser.t_accrual_entries`);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/accrual/all]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/accrual/:id
app.delete('/api/fin/accrual/:id', async (req, res) => {
  try {
    await finQuery(`DELETE FROM dados_dachser.t_accrual_entries WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/accrual/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/sync/incremental
app.post('/api/fin/sync/incremental', async (req, res) => {
  try {
    // placeholder — sync lógica gerenciada pelo sistema externo RM
    res.json({ success: true, message: 'Sync iniciado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/sync/baixados
app.post('/api/fin/sync/baixados', async (req, res) => {
  try {
    try { await finQuery(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS sync_status ENUM('ATIVO', 'BAIXADO') DEFAULT 'ATIVO'`); } catch (_) {}
    const result = await finQuery(`
      UPDATE dados_dachser.t_vouchers v
      JOIN dados_dachser.t_dados_financeiro_voucher dfv ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci
      JOIN dados_dachser.tbaixas b ON CAST(dfv.id_rm AS UNSIGNED) = b.IdLancamentoRM
      SET v.sync_status = 'BAIXADO', v.etapa_atual = 'CONCLUIDO'
      WHERE v.sync_status = 'ATIVO'`);
    res.json({ success: true, marked: result?.affectedRows || 0 });
  } catch (err) {
    console.error('[POST /api/fin/sync/baixados]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-3: ANEXOS / COMPROVANTES / MASTER / FILHOS ──────────────────────────

// Migrations idempotentes na inicialização
(async () => {
  try {
    await finQuery(`ALTER TABLE dados_dachser.t_voucher_anexos ADD COLUMN IF NOT EXISTS file_content MEDIUMBLOB NULL`);
  } catch (_) {}
  try {
    await finQuery(`ALTER TABLE dados_dachser.t_voucher_anexos ADD COLUMN IF NOT EXISTS mime_type VARCHAR(200) NULL`);
  } catch (_) {}
  // FIN-5: colunas estendidas de log
  for (const col of [
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS origin VARCHAR(20) DEFAULT 'UI'`,
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30) DEFAULT 'VOUCHER'`,
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS event_type VARCHAR(30) NULL`,
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS payload_json JSON NULL`,
  ]) { try { await finQuery(col); } catch (_) {} }
  // FIN-5: tabela t_dados_rm
  try {
    await finQuery(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dados_rm (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_rm VARCHAR(50) NOT NULL,
        nd VARCHAR(60) DEFAULT NULL,
        nf_disputa TINYINT(1) DEFAULT 0,
        voucher_boleto VARCHAR(60) DEFAULT NULL,
        chave_pix VARCHAR(255) DEFAULT NULL,
        pix_tipo_chave VARCHAR(20) DEFAULT NULL,
        forma_pag VARCHAR(50) DEFAULT NULL,
        fornecedor VARCHAR(255) DEFAULT NULL,
        regras_forma_pag VARCHAR(100) DEFAULT NULL,
        tipo_exec VARCHAR(20) DEFAULT NULL,
        inicio_disputa DATE DEFAULT NULL,
        fim_disputa DATE DEFAULT NULL,
        responsavel_disp VARCHAR(100) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_id_rm (id_rm)
      )
    `);
  } catch (_) {}
  for (const col of [
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS nd VARCHAR(60) DEFAULT NULL AFTER id_rm`,
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(255) DEFAULT NULL AFTER voucher_boleto`,
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS pix_tipo_chave VARCHAR(20) DEFAULT NULL AFTER chave_pix`,
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS tipo_exec VARCHAR(20) DEFAULT NULL AFTER regras_forma_pag`,
    // FIN-5b: colunas de cancelamento e campos extras de voucher
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelamento_voucher_credito VARCHAR(100) NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelado_por_user_id VARCHAR(36) NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelado_por_user_name VARCHAR(100) NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelado_em DATETIME NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS is_pronto_para_robo TINYINT(1) DEFAULT 0 NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS origem_processo VARCHAR(255) NULL`,
  ]) { try { await finQuery(col); } catch (_) {} }
})();

// POST /api/fin/vouchers/anexos — upload arquivo como BLOB
app.post('/api/fin/vouchers/anexos', async (req, res) => {
  try {
    const { voucher_id, tipo, file_name, file_size, mime_type, file_base64, user_id, user_name } = req.body || {};
    if (!voucher_id || !file_name) return res.status(400).json({ success: false, error: 'voucher_id e file_name são obrigatórios' });

    const id = require('crypto').randomUUID();
    let fileBuffer = null;
    if (file_base64) {
      const base64Data = file_base64.replace(/^data:[^;]+;base64,/, '');
      fileBuffer = Buffer.from(base64Data, 'base64');
    }

    const file_url = `/api/fin/vouchers/anexos/${id}/download`;
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [id, voucher_id, tipo || 'OUTROS', file_name, file_url, file_size || 0, mime_type || null, fileBuffer]
    );

    if (user_id || user_name) {
      try {
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
           VALUES (UUID(), ?, ?, ?, 'ANEXO_ADICIONADO', ?, NOW())`,
          [voucher_id, user_id || null, user_name || 'Sistema', `Anexo "${file_name}" (${tipo || 'OUTROS'}) adicionado`]
        );
      } catch (_) {}
    }

    res.json({ success: true, id, file_url });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/anexos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/anexos/:id/download — serve BLOB
app.get('/api/fin/vouchers/anexos/:id/download', async (req, res) => {
  try {
    const rows = await finQuery(
      `SELECT file_name, mime_type, file_content FROM dados_dachser.t_voucher_anexos WHERE id = ?`,
      [req.params.id]
    );
    const row = rows?.[0];
    if (!row || !row.file_content) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const mime = row.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name)}"`);
    res.send(Buffer.isBuffer(row.file_content) ? row.file_content : Buffer.from(row.file_content));
  } catch (err) {
    console.error('[GET /api/fin/vouchers/anexos/:id/download]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fin/vouchers/:id/anexos — lista anexos de um voucher
app.get('/api/fin/vouchers/:id/anexos', async (req, res) => {
  try {
    const rows = await finQuery(
      `SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type
       FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/:id/anexos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/vouchers/anexos/:id — deleta registro de anexo
app.delete('/api/fin/vouchers/anexos/:id', async (req, res) => {
  try {
    await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/vouchers/anexos/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/comprovantes/batch — attach_comprovante_batch
app.post('/api/fin/vouchers/comprovantes/batch', async (req, res) => {
  try {
    const { comprovantes } = req.body || {};
    if (!Array.isArray(comprovantes) || comprovantes.length === 0) {
      return res.status(400).json({ success: false, error: 'comprovantes[] é obrigatório' });
    }

    const results = comprovantes.map(c => ({ voucher_id: c.voucher_id, success: false }));
    for (let i = 0; i < comprovantes.length; i++) {
      const c = comprovantes[i];
      try {
        let fileBuffer = null;
        if (c.file_base64) {
          const base64Data = c.file_base64.replace(/^data:[^;]+;base64,/, '');
          fileBuffer = Buffer.from(base64Data, 'base64');
        }
        const anexoId = require('crypto').randomUUID();
        const file_url = fileBuffer
          ? `/api/fin/vouchers/anexos/${anexoId}/download`
          : (c.file_url || '');

        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content)
           VALUES (?, ?, 'COMPROVANTE', ?, ?, ?, NOW(), ?, ?)`,
          [anexoId, c.voucher_id, c.file_name, file_url, c.file_size || 0, c.mime_type || null, fileBuffer]
        );
        await finQuery(
          `UPDATE dados_dachser.t_vouchers SET status_comprovante = 'ANEXADO' WHERE id = ?`,
          [c.voucher_id]
        );
        try {
          await finQuery(
            `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
             VALUES (UUID(), ?, ?, ?, 'COMPROVANTE_ANEXADO', ?, NOW())`,
            [c.voucher_id, c.user_id || null, c.user_name || 'Sistema', `Comprovante "${c.file_name}" anexado`]
          );
        } catch (_) {}
        results[i].success = true;
      } catch (e) {
        results[i].error = e.message;
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ success: true, results, successCount, totalCount: comprovantes.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/comprovantes/batch]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/batch-documents — upload_batch_document_bulk
app.post('/api/fin/vouchers/batch-documents', async (req, res) => {
  try {
    const { batch_id, userId, documents } = req.body || {};
    if (!batch_id || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ success: false, error: 'batch_id e documents[] são obrigatórios' });
    }
    try {
      await finQuery(`CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_batch_documents (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(36) NOT NULL,
        file_name VARCHAR(500),
        file_url TEXT,
        mime_type VARCHAR(200),
        size_bytes BIGINT DEFAULT 0,
        tipo_anexo VARCHAR(50),
        status VARCHAR(50) DEFAULT 'PENDENTE',
        uploaded_by_user_id VARCHAR(50),
        uploaded_by_user_name VARCHAR(200),
        file_content MEDIUMBLOB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (_) {}

    const ids = [];
    for (const doc of documents) {
      const docId = require('crypto').randomUUID();
      let fileBuffer = null;
      if (doc.file_base64) {
        const base64Data = doc.file_base64.replace(/^data:[^;]+;base64,/, '');
        fileBuffer = Buffer.from(base64Data, 'base64');
      }
      const file_url = fileBuffer
        ? `/api/fin/vouchers/batch-documents/${docId}/download`
        : (doc.file_url || '');
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_batch_documents
         (id, batch_id, file_name, file_url, mime_type, size_bytes, tipo_anexo, status, uploaded_by_user_id, file_content)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?)`,
        [docId, batch_id, doc.file_name, file_url, doc.mime_type || null, doc.size_bytes || 0,
         doc.tipo_anexo || null, String(userId || ''), fileBuffer]
      );
      ids.push(docId);
    }

    res.json({ success: true, ids, inserted: ids.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/batch-documents]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/report — export_vouchers_report
app.get('/api/fin/vouchers/report', async (req, res) => {
  try {
    const { etapa, statusBaixa, cobrancaEmNomeDe, statusIntegracaoRm, tipoExecucaoPagamento, dataInicio, dataFim } = req.query;

    const whereConditions = [];
    const params = [];

    if (etapa && etapa !== 'all') {
      if (etapa === 'OPERACAO') {
        whereConditions.push("v.etapa_atual IN ('OPERACAO','A_PROCESSAR','AJUSTE_OPERACAO')");
      } else if (etapa === 'FISCAL') {
        whereConditions.push("v.etapa_atual IN ('FISCAL','AJUSTE_FISCAL')");
      } else {
        whereConditions.push('v.etapa_atual = ?');
        params.push(etapa);
      }
    }
    if (statusBaixa && statusBaixa !== 'all') { whereConditions.push('v.status_baixa = ?'); params.push(statusBaixa); }
    if (cobrancaEmNomeDe && cobrancaEmNomeDe !== 'all') { whereConditions.push('v.cobranca_em_nome_de = ?'); params.push(cobrancaEmNomeDe); }
    if (statusIntegracaoRm && statusIntegracaoRm !== 'all') { whereConditions.push('v.status_integracao_rm = ?'); params.push(statusIntegracaoRm); }
    if (tipoExecucaoPagamento && tipoExecucaoPagamento !== 'all') { whereConditions.push('v.tipo_execucao_pagamento = ?'); params.push(tipoExecucaoPagamento); }
    if (dataInicio) { whereConditions.push('v.created_at >= ?'); params.push(dataInicio); }
    if (dataFim) { whereConditions.push('v.created_at <= ?'); params.push(`${dataFim} 23:59:59`); }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const vouchers = await finQuery(`
      SELECT v.*,
        u_criado.username AS criado_por_username,
        u_operacao.username AS responsavel_operacao_username,
        u_fiscal.username AS responsavel_fiscal_username,
        u_financeiro.username AS responsavel_financeiro_username,
        u_supervisor.username AS responsavel_supervisor_username,
        dfv.created_by AS dfv_created_by
      FROM dados_dachser.t_vouchers v
      LEFT JOIN ai_agente.t_users_dachser u_criado ON v.criado_por_user_id = u_criado.id
      LEFT JOIN ai_agente.t_users_dachser u_operacao ON v.responsavel_operacao_user_id = u_operacao.id
      LEFT JOIN ai_agente.t_users_dachser u_fiscal ON v.responsavel_fiscal_user_id = u_fiscal.id
      LEFT JOIN ai_agente.t_users_dachser u_financeiro ON v.responsavel_financeiro_user_id = u_financeiro.id
      LEFT JOIN ai_agente.t_users_dachser u_supervisor ON v.responsavel_supervisor_user_id = u_supervisor.id
      LEFT JOIN (
        SELECT nd, MAX(created_by) AS created_by
        FROM dados_dachser.t_dados_financeiro_voucher
        GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT 5000
    `, params);

    res.json({ success: true, vouchers: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/report]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/master/search?search= — search_vouchers_for_master
app.get('/api/fin/vouchers/master/search', async (req, res) => {
  try {
    const { search } = req.query;
    if (!search || String(search).length < 6) return res.json({ success: true, data: [] });
    const pattern = `%${search}`;
    const vouchers = await finQuery(`
      SELECT * FROM (
        SELECT
          v.numero_spo COLLATE utf8mb4_general_ci AS processo,
          v.fornecedor COLLATE utf8mb4_general_ci AS fornecedor,
          v.cnpj_fornecedor COLLATE utf8mb4_general_ci AS cnpj_fornecedor,
          v.valor,
          v.moeda COLLATE utf8mb4_general_ci AS moeda,
          v.vencimento
        FROM dados_dachser.t_vouchers v
        WHERE v.is_master = 0 AND v.voucher_master_id IS NULL
          AND v.etapa_atual NOT IN ('CONCLUIDO','CANCELADO')
        UNION ALL
        SELECT
          a.nd COLLATE utf8mb4_general_ci AS processo,
          a.razao_social COLLATE utf8mb4_general_ci AS fornecedor,
          a.cnpj COLLATE utf8mb4_general_ci AS cnpj_fornecedor,
          a.valor_nf AS valor,
          a.moeda COLLATE utf8mb4_general_ci AS moeda,
          a.data_vencimento AS vencimento
        FROM dados_dachser.t_dados_financeiro_voucher a
      ) x
      WHERE x.processo LIKE ?
    `, [pattern]);
    res.json({ success: true, data: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/master/search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/master — create_voucher_master
app.post('/api/fin/vouchers/master', async (req, res) => {
  try {
    const {
      voucher_ids, nome_master, fornecedor, cnpj_fornecedor, valor_total, moeda,
      vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de, filial,
      comentarios_operacao, criado_por_user_id, criado_por_user_name,
    } = req.body || {};

    if (!Array.isArray(voucher_ids) || voucher_ids.length < 2) {
      return res.status(400).json({ success: false, error: 'Mínimo 2 voucher_ids são obrigatórios' });
    }

    const masterId = require('crypto').randomUUID();
    const seqRows = await finQuery(
      `SELECT IFNULL(MAX(CAST(REPLACE(numero_spo,'MASTER-','') AS UNSIGNED)),0)+1 AS next_num
       FROM dados_dachser.t_vouchers WHERE numero_spo LIKE 'MASTER-%'`
    );
    const nextNum = Number(seqRows?.[0]?.next_num || 1);
    const numeroSpoMaster = nome_master || `MASTER-${String(nextNum).padStart(5, '0')}`;

    await finQuery(
      `INSERT INTO dados_dachser.t_vouchers
       (id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, forma_pagamento,
        tipo_documento, cobranca_em_nome_de, filial, comentarios_operacao,
        etapa_atual, is_master, origem_criacao, criado_por_user_id, criado_por_user_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPERACAO', 1, 'MASTER', ?, ?, NOW(), NOW())`,
      [masterId, numeroSpoMaster, fornecedor || null, cnpj_fornecedor || null,
       valor_total || null, moeda || 'BRL', vencimento || null, forma_pagamento || null,
       tipo_documento || null, cobranca_em_nome_de || 'DACHSER', filial || null,
       comentarios_operacao || null, criado_por_user_id || null, criado_por_user_name || 'Sistema']
    );

    const placeholders = voucher_ids.map(() => '?').join(',');
    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET voucher_master_id = ? WHERE numero_spo IN (${placeholders})`,
      [masterId, ...voucher_ids]
    );

    try {
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (UUID(), ?, ?, ?, 'MASTER_CRIADO', ?, NOW())`,
        [masterId, criado_por_user_id || null, criado_por_user_name || 'Sistema',
         `Voucher Master ${numeroSpoMaster} criado consolidando ${voucher_ids.length} processos`]
      );
    } catch (_) {}

    res.json({ success: true, masterId, numeroSpo: numeroSpoMaster, childCount: voucher_ids.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/master]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/:id/filhos — filhos de um voucher master
app.get('/api/fin/vouchers/:id/filhos', async (req, res) => {
  try {
    const filhos = await finQuery(
      `SELECT id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento,
              etapa_atual, status_envio_cliente, cobranca_em_nome_de, forma_pagamento, tipo_documento
       FROM dados_dachser.t_vouchers
       WHERE voucher_master_id = ?
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: filhos || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/:id/filhos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5e: RM Fetch + Criação de Voucher + Anexos (Criação) ──────────────────────────

// GET /api/fin/rm/fetch?nd= — voucher-integrate-rm action=fetch
app.get('/api/fin/rm/fetch', async (req, res) => {
  try {
    const nd = String(req.query.nd || '').trim();
    if (!nd) return res.status(400).json({ success: false, error: 'nd é obrigatório' });

    const ndBase = nd.split(/\s+/)[0];
    const ndCandidates = [...new Set([nd, ndBase].filter(Boolean))];
    const placeholders = ndCandidates.map(() => '?').join(', ');
    const selectCols = `id_rm, nd, documento, nome_beneficiario, nome_cobranca,
      numero_nf, numero_processo, modal, tipo_pag, forma_pag,
      data_emissao, data_vencimento, valor_nf, moeda, cnpj, razao_social`;
    const isSpoLike = /^\d+-/.test(ndBase);

    const mapFormaPagamento = (v) => {
      if (!v) return 'BOLETO';
      const u = v.toUpperCase();
      if (u.includes('BOL')) return 'BOLETO';
      if (u.includes('PIX')) return 'TRANSFERENCIA_PIX';
      if (u.includes('TED') || u.includes('DOC') || u.includes('TRANSF')) return 'TRANSFERENCIA_PIX';
      if (u.includes('DEBITO')) return 'DEBITO_CONTA';
      if (u.includes('DARF')) return 'DARF';
      if (u.includes('GPS')) return 'GPS';
      return 'BOLETO';
    };

    let result = [];
    const querySpo = () => finQuery(
      `SELECT ${selectCols} FROM dados_dachser.t_dados_financeiro_spo WHERE nd IN (${placeholders}) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1`,
      [...ndCandidates, ndBase]
    );
    const queryVoucher = () => finQuery(
      `SELECT ${selectCols} FROM dados_dachser.t_dados_financeiro_voucher WHERE nd IN (${placeholders}) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1`,
      [...ndCandidates, ndBase]
    );

    if (isSpoLike) {
      result = await querySpo();
      if (!result || result.length === 0) result = await queryVoucher();
    } else {
      result = await queryVoucher();
      if (!result || result.length === 0) result = await querySpo();
    }

    if (!result || result.length === 0) {
      return res.status(404).json({ success: false, error: `ND "${nd}" não encontrado` });
    }

    const r = result[0];
    const fmtDate = (d) => { if (!d) return null; try { return new Date(d).toISOString().split('T')[0]; } catch { return null; } };

    res.json({
      success: true,
      data: {
        idRM: r.id_rm?.toString() || '',
        numeroVoucher: r.nd || '',
        numeroDocumento: r.documento || '',
        fornecedor: r.nome_beneficiario || r.razao_social || '',
        filial: r.nome_cobranca || '',
        numeroNF: r.numero_nf || '',
        numeroProcesso: r.numero_processo || '',
        modal: r.modal || '',
        tipoDocumento: r.tipo_pag || '',
        formaPagamento: mapFormaPagamento(r.forma_pag),
        dataEmissao: fmtDate(r.data_emissao),
        vencimento: fmtDate(r.data_vencimento),
        valor: r.valor_nf ? parseFloat(r.valor_nf) : null,
        moeda: r.moeda || 'BRL',
        cnpjFornecedor: r.cnpj || null,
      },
    });
  } catch (err) {
    console.error('[GET /api/fin/rm/fetch]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers — save_voucher_esteira (criar novo voucher)
app.post('/api/fin/vouchers', async (req, res) => {
  try {
    const d = req.body || {};
    const numeroSpo = (d.numero_spo || '').toString().trim();
    if (!numeroSpo) return res.status(400).json({ error: 'numero_spo é obrigatório' });
    if (numeroSpo.startsWith('MANUAL-')) return res.status(400).json({ error: 'Número de voucher/SPO inválido. Use um número real do RM.' });

    const emptyToNull = (v) => (v === '' || v === undefined) ? null : v;
    const toMySQLDate = (dateValue) => {
      const now = new Date();
      const fallback = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} 00:00:00.000`;
      if (!dateValue) return fallback;
      try {
        const s = String(dateValue).trim();
        if (!s || s === 'null' || s === 'undefined') return fallback;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00.000`;
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return `${s.split('T')[0]} 00:00:00.000`;
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) {
          const y = parsed.getFullYear();
          const m = String(parsed.getMonth() + 1).padStart(2, '0');
          const day = String(parsed.getDate()).padStart(2, '0');
          return `${y}-${m}-${day} 00:00:00.000`;
        }
        return fallback;
      } catch { return fallback; }
    };

    // Duplicate check
    const existing = await finQuery(`SELECT id, numero_spo, etapa_atual FROM dados_dachser.t_vouchers WHERE numero_spo = ?`, [numeroSpo]);
    if (existing && existing.length > 0) {
      const advanced = existing.find(v => v.etapa_atual !== 'A_PROCESSAR');
      if (advanced) {
        return res.status(200).json({
          error: `Voucher com número ${numeroSpo} já existe na etapa ${advanced.etapa_atual}`,
          existingId: advanced.id, existingEtapa: advanced.etapa_atual, duplicate: true,
        });
      }
      for (const ex of existing) {
        await finQuery(`DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?`, [ex.id]);
        await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [ex.id]);
        await finQuery(`DELETE FROM dados_dachser.t_vouchers WHERE id = ?`, [ex.id]);
      }
    }

    const voucherId = d.id || crypto.randomUUID();
    await finQuery(`
      INSERT INTO dados_dachser.t_vouchers (
        id, id_rm, numero_spo, vencimento, cobranca_em_nome_de,
        forma_pagamento, remessa, urgente, urgencia_tipo,
        etapa_atual, status_baixa, status_envio_cliente, status_financeiro,
        tipo_documento, valor, moeda, fornecedor, cnpj_fornecedor,
        cliente_email, filial, data_emissao_documento,
        comentarios_operacao, comentarios_fiscal, comentarios_financeiro,
        ajuste_operacao, ajuste_fiscal, criado_por_user_id,
        processo_id, origem_processo, chave_pix, status_documento_fiscal,
        tipo_execucao_pagamento
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucherId,
        emptyToNull(d.id_rm),
        emptyToNull(d.numero_spo),
        toMySQLDate(d.vencimento),
        emptyToNull(d.cobranca_em_nome_de) || 'DACHSER',
        emptyToNull(d.forma_pagamento) || 'BOLETO',
        emptyToNull(d.remessa) || 'NENHUM',
        d.urgente ? 1 : 0,
        emptyToNull(d.urgencia_tipo) || 'NORMAL',
        emptyToNull(d.etapa_atual) || 'OPERACAO',
        emptyToNull(d.status_baixa) || 'PENDENTE',
        emptyToNull(d.status_envio_cliente) || 'NAO_APLICA',
        emptyToNull(d.status_financeiro) || 'PENDENTE',
        emptyToNull(d.tipo_documento),
        emptyToNull(d.valor),
        emptyToNull(d.moeda) || 'BRL',
        emptyToNull(d.fornecedor),
        d.cnpj_fornecedor ? d.cnpj_fornecedor.replace(/\D/g, '') : null,
        emptyToNull(d.cliente_email),
        emptyToNull(d.filial),
        toMySQLDate(d.data_emissao_documento),
        emptyToNull(d.comentarios_operacao),
        emptyToNull(d.comentarios_fiscal),
        emptyToNull(d.comentarios_financeiro),
        emptyToNull(d.ajuste_operacao),
        emptyToNull(d.ajuste_fiscal),
        emptyToNull(d.criado_por_user_id),
        emptyToNull(d.processo_id),
        emptyToNull(d.origem_processo),
        emptyToNull(d.chave_pix),
        emptyToNull(d.status_documento_fiscal) || 'ANEXADO',
        'A_DEFINIR',
      ]
    );
    res.json({ success: true, mariadbId: voucherId });
  } catch (err) {
    console.error('[POST /api/fin/vouchers]', err.message);
    if (err.message?.includes('já existe') || err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Voucher já existe', duplicate: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fin/vouchers/:id/anexos — save_voucher_anexo
app.post('/api/fin/vouchers/:id/anexos', async (req, res) => {
  try {
    const { id: voucherId } = req.params;
    const { tipo, file_name, file_url, file_size } = req.body || {};
    if (!voucherId || !tipo || !file_name || !file_url) {
      return res.status(400).json({ error: 'voucher_id, tipo, file_name e file_url são obrigatórios' });
    }

    // Detect if master to snapshot filhos_spos
    let isMaster = 0;
    let filhosSposJson = null;
    try {
      const [masterRow] = await finQuery(`SELECT COALESCE(is_master,0) AS is_master FROM dados_dachser.t_vouchers WHERE id = ?`, [voucherId]);
      if (masterRow && Number(masterRow.is_master) === 1) {
        isMaster = 1;
        const filhos = await finQuery(`SELECT numero_spo FROM dados_dachser.t_vouchers WHERE voucher_master_id = ? ORDER BY numero_spo`, [voucherId]);
        const spos = (filhos || []).map(f => f.numero_spo).filter(Boolean);
        if (spos.length > 0) filhosSposJson = JSON.stringify(spos);
      }
    } catch { /* non-fatal */ }

    const anexoId = crypto.randomUUID();
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, is_master, filhos_spos)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [anexoId, voucherId, tipo, file_name, file_url, file_size || 0, isMaster, filhosSposJson]
    );

    // Post-insert verification
    const [verify] = await finQuery(`SELECT id FROM dados_dachser.t_voucher_anexos WHERE id = ? LIMIT 1`, [anexoId]);
    if (!verify) return res.status(500).json({ success: false, error: 'Falha ao confirmar o anexo no banco.' });

    res.json({ success: true, anexoId });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/anexos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5f: Batch Import ──────────────────────────────────────────────────────

// POST /api/fin/batch-import — create_empty_batch_import (Fechamento Quinzenal)
app.post('/api/fin/batch-import', async (req, res) => {
  try {
    const { userId } = req.body || {};
    // Auto-cleanup: remove lotes abandonados do usuário
    try {
      await finQuery(
        `UPDATE dados_dachser.t_voucher_batch_import SET status = 'ABANDONED'
          WHERE created_by_user_id = ? AND status = 'PENDING_DOCUMENTS'
            AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [String(userId || '')]
      );
    } catch (_) {}
    const batchId = crypto.randomUUID();
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_batch_import
         (id, status, original_file_name, total_rows, valid_rows, error_rows, created_by_user_id, created_by_user_name, tipo)
       VALUES (?, 'PENDING_DOCUMENTS', ?, 0, 0, 0, ?, ?, 'FECHAMENTO_QUINZENAL')`,
      [batchId, 'FECHAMENTO_QUINZENAL', String(userId || ''), String(userId || '')]
    );
    res.json({ success: true, batch_id: batchId, tipo: 'FECHAMENTO_QUINZENAL' });
  } catch (err) {
    console.error('[POST /api/fin/batch-import]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/batch-import/:id/status — get_batch_import_status
app.get('/api/fin/batch-import/:id/status', async (req, res) => {
  try {
    const batchId = req.params.id;
    const batchRows = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_import WHERE id = ?`, [batchId]);
    if (!batchRows || batchRows.length === 0) return res.status(404).json({ success: false, error: 'Lote não encontrado' });
    const items = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? ORDER BY row_index ASC`, [batchId]);
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE batch_id = ? ORDER BY uploaded_at ASC`, [batchId]);

    const voucherIds = (items || []).filter(i => i.voucher_id).map(i => i.voucher_id);
    let anexosByVoucher = {};
    let spoByVoucher = {};
    if (voucherIds.length > 0) {
      const ph = voucherIds.map(() => '?').join(',');
      const allAnexos = await finQuery(`SELECT id, voucher_id, tipo, file_name FROM dados_dachser.t_voucher_anexos WHERE voucher_id IN (${ph})`, voucherIds);
      for (const a of (allAnexos || [])) (anexosByVoucher[a.voucher_id] ||= []).push(a);
      try {
        const vrows = await finQuery(`SELECT id, numero_spo FROM dados_dachser.t_vouchers WHERE id IN (${ph})`, voucherIds);
        for (const v of (vrows || [])) spoByVoucher[v.id] = v.numero_spo;
      } catch (_) {}
    }

    const parsedDocs = (docs || []).map(d => {
      let mids = [];
      if (Number(d.is_master_group) === 1 && d.master_voucher_ids) {
        try { mids = typeof d.master_voucher_ids === 'string' ? JSON.parse(d.master_voucher_ids) : d.master_voucher_ids; } catch (_) {}
      }
      return { ...d, is_master_group: Number(d.is_master_group) === 1, master_voucher_ids: mids };
    });
    const masterAnexosByVoucher = {};
    for (const d of parsedDocs) {
      if (!d.is_master_group || !d.tipo_anexo) continue;
      for (const vid of d.master_voucher_ids) (masterAnexosByVoucher[vid] ||= []).push(d.tipo_anexo);
    }

    const checklist = (items || []).filter(i => i.voucher_id).map(i => {
      const ax = anexosByVoucher[i.voucher_id] || [];
      const tiposReais = ax.map(a => a.tipo);
      const tiposGrupo = masterAnexosByVoucher[i.voucher_id] || [];
      const tiposAll = [...tiposReais, ...tiposGrupo];
      let temFatura = tiposAll.some(t => t === 'FATURA' || t === 'FATURA_DEMONSTRATIVO');
      let temBoleto = tiposAll.some(t => t === 'BOLETO' || t === 'BOLETO_INSTRUCOES');
      const temDai = tiposAll.some(t => t === 'DAI');
      if (temDai) { temFatura = true; temBoleto = true; }
      const requerBoleto = i.forma_pagamento === 'BOLETO';
      const isPreLanc = String(i.etapa_destino || '').toUpperCase() === 'PRE_LANCAMENTO';
      let status = 'COMPLETO';
      if (isPreLanc) {
        if (!temFatura && !temBoleto && !temDai) status = 'PENDENTE_DOCUMENTO';
      } else {
        if (!temFatura && requerBoleto && !temBoleto) status = 'PENDENTE_FATURA_E_BOLETO';
        else if (!temFatura) status = 'PENDENTE_FATURA';
        else if (requerBoleto && !temBoleto) status = 'PENDENTE_BOLETO';
      }
      return {
        voucher_id: i.voucher_id,
        numero_spo: spoByVoucher[i.voucher_id] || i.spo || null,
        fornecedor: i.fornecedor, valor: i.valor, vencimento: i.vencimento,
        forma_pagamento: i.forma_pagamento, fatura: i.fatura, id_rm: i.id_rm ?? null,
        temFatura, temBoleto, temDai, requerBoleto, status,
        etapa_destino: i.etapa_destino || null,
      };
    });

    res.json({ success: true, batch: batchRows[0], items, documents: parsedDocs, checklist });
  } catch (err) {
    console.error('[GET /api/fin/batch-import/:id/status]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/batch-import/:id/pre-lancamento — search_pre_lancamento_by_fornecedores
app.get('/api/fin/batch-import/:id/pre-lancamento', async (req, res) => {
  try {
    const batchId = req.params.id;
    const rows = await finQuery(
      `SELECT DISTINCT fornecedor FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND fornecedor IS NOT NULL AND fornecedor <> ''`,
      [batchId]
    );
    const fornecedoresNorm = (rows || []).map(r => String(r.fornecedor).trim().toUpperCase()).filter(Boolean);
    const hasForn = fornecedoresNorm.length > 0;
    const phForn = hasForn ? fornecedoresNorm.map(() => '?').join(',') : '';
    const orderPriority = hasForn ? `CASE WHEN UPPER(TRIM(fornecedor)) IN (${phForn}) THEN 0 ELSE 1 END,` : '';
    const queryParams = [];
    if (hasForn) queryParams.push(...fornecedoresNorm);
    queryParams.push(batchId);
    const vouchers = await finQuery(
      `SELECT id, numero_spo, id_rm, fornecedor, cnpj_fornecedor, valor, moeda,
              vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de,
              urgencia_tipo, processo_id, origem_processo, filial,
              data_emissao_documento, comentarios_operacao, created_at
         FROM dados_dachser.t_vouchers
        WHERE etapa_atual = 'PRE_LANCAMENTO'
          AND voucher_master_id IS NULL
          AND id NOT IN (
            SELECT bi.voucher_id FROM dados_dachser.t_voucher_batch_import_item bi
              JOIN dados_dachser.t_voucher_batch_import b ON b.id = bi.batch_id
             WHERE bi.voucher_id IS NOT NULL
               AND (bi.batch_id = ? OR b.status = 'PENDING_DOCUMENTS')
          )
        ORDER BY ${orderPriority || ''} vencimento ASC, fornecedor ASC, numero_spo ASC
        LIMIT 500`,
      queryParams
    );
    res.json({ success: true, vouchers: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/batch-import/:id/pre-lancamento]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/attach-prelancamento — attach_pre_lancamento_to_batch
app.post('/api/fin/batch-import/:id/attach-prelancamento', async (req, res) => {
  try {
    const batchId = req.params.id;
    const { userId, voucher_ids: voucherIds } = req.body || {};
    if (!Array.isArray(voucherIds) || voucherIds.length === 0)
      return res.status(400).json({ success: false, error: 'voucher_ids são obrigatórios' });
    const batchRows = await finQuery(`SELECT id, status FROM dados_dachser.t_voucher_batch_import WHERE id = ?`, [batchId]);
    if (!batchRows || batchRows.length === 0) return res.status(404).json({ success: false, error: 'Lote não encontrado' });
    if (batchRows[0].status === 'COMPLETE') return res.status(422).json({ success: false, error: 'Lote já finalizado' });
    const ph = voucherIds.map(() => '?').join(',');
    const vchs = await finQuery(
      `SELECT id, numero_spo, id_rm, fornecedor, valor, vencimento, data_emissao_documento,
              forma_pagamento, comentarios_operacao, processo_id, urgencia_tipo, cobranca_em_nome_de
         FROM dados_dachser.t_vouchers WHERE id IN (${ph}) AND etapa_atual = 'PRE_LANCAMENTO'`,
      voucherIds
    );
    if (!vchs || vchs.length === 0) return res.status(404).json({ success: false, error: 'Nenhum voucher elegível encontrado' });
    const existingItems = await finQuery(
      `SELECT voucher_id FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IN (${ph})`,
      [batchId, ...voucherIds]
    );
    const alreadyIn = new Set((existingItems || []).map(r => r.voucher_id));
    const maxRow = await finQuery(`SELECT COALESCE(MAX(row_index), -1) AS m FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ?`, [batchId]);
    let nextRow = Number(maxRow?.[0]?.m ?? -1) + 1;
    let attached = 0;
    for (const v of vchs) {
      if (alreadyIn.has(v.id)) continue;
      const destino = String(v.urgencia_tipo || '').toUpperCase() === 'URGENTE_REAL'
        ? 'SUPERVISOR'
        : (String(v.cobranca_em_nome_de || '').toUpperCase() === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
      const itemId = crypto.randomUUID();
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_batch_import_item
           (id, batch_id, row_index, voucher_id, processo, fornecedor, valor,
            vencimento, data_fatura, forma_pagamento, fatura, historico,
            status, validation_message, raw_json, etapa_destino)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VOUCHER_CRIADO', 'Pré-lançamento anexado ao lote', '{}', ?)`,
        [itemId, batchId, nextRow++, v.id, v.processo_id || null, v.fornecedor, v.valor,
         v.vencimento, v.data_emissao_documento, v.forma_pagamento, v.numero_spo,
         v.comentarios_operacao || null, destino]
      );
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE', updated_at = NOW() WHERE id = ? AND etapa_atual = 'PRE_LANCAMENTO'`,
        [v.id]
      );
      attached++;
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'PRE_LANCAMENTO_ANEXADO_LOTE', ?, NOW())`,
          [logId, v.id, String(userId || ''), String(userId || ''), `batch_id=${batchId}`]
        );
      } catch (_) {}
    }
    res.json({ success: true, attached });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/attach-prelancamento]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/bind-to-voucher — bind_batch_document_to_voucher
app.post('/api/fin/batch-import/:id/bind-to-voucher', async (req, res) => {
  try {
    const { userId, batch_document_id, voucher_id, tipo_anexo } = req.body || {};
    if (!batch_document_id || !voucher_id || !tipo_anexo)
      return res.status(400).json({ success: false, error: 'batch_document_id, voucher_id, tipo_anexo são obrigatórios' });
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [batch_document_id]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    const items = await finQuery(`SELECT id FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id = ?`, [doc.batch_id, voucher_id]);
    if (!items || items.length === 0) return res.status(403).json({ success: false, error: 'Voucher não pertence a este lote' });
    const anexoId = crypto.randomUUID();
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [anexoId, voucher_id, tipo_anexo, doc.file_name, doc.file_url, doc.size_bytes || 0]
    );
    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = ?, anexo_id = ?, tipo_anexo = ?, status = 'VINCULADO', bound_by_user_id = ?, bound_by_user_name = ?, bound_at = NOW() WHERE id = ?`,
      [voucher_id, anexoId, tipo_anexo, String(userId || ''), String(userId || ''), batch_document_id]
    );
    try {
      const logId = crypto.randomUUID();
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'ANEXO_VINCULADO_LOTE', ?, NOW())`,
        [logId, voucher_id, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; tipo=${tipo_anexo}; file=${doc.file_name}`]
      );
    } catch (_) {}
    res.json({ success: true, anexo_id: anexoId });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/bind-to-voucher]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/bind-to-master — bind_batch_document_to_master_group
app.post('/api/fin/batch-import/:id/bind-to-master', async (req, res) => {
  try {
    const { userId, batch_document_id, voucher_ids, tipo_anexo } = req.body || {};
    if (!batch_document_id || !Array.isArray(voucher_ids) || voucher_ids.length < 2 || !tipo_anexo)
      return res.status(400).json({ success: false, error: 'batch_document_id, voucher_ids[>=2], tipo_anexo obrigatórios' });
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [batch_document_id]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    const ph = voucher_ids.map(() => '?').join(',');
    const items = await finQuery(
      `SELECT voucher_id FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IN (${ph})`,
      [doc.batch_id, ...voucher_ids]
    );
    if (!items || items.length !== voucher_ids.length)
      return res.status(403).json({ success: false, error: 'Um ou mais vouchers não pertencem a este lote' });
    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = NULL, anexo_id = NULL, is_master_group = 1, master_voucher_ids = ?, tipo_anexo = ?, status = 'VINCULADO', bound_by_user_id = ?, bound_by_user_name = ?, bound_at = NOW() WHERE id = ?`,
      [JSON.stringify(voucher_ids), tipo_anexo, String(userId || ''), String(userId || ''), batch_document_id]
    );
    for (const vid of voucher_ids) {
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'ANEXO_VINCULADO_LOTE_MASTER', ?, NOW())`,
          [logId, vid, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; tipo=${tipo_anexo}; file=${doc.file_name}; group_size=${voucher_ids.length}`]
        );
      } catch (_) {}
    }
    res.json({ success: true, master_pending: true, group_size: voucher_ids.length });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/bind-to-master]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/unbind — unbind_batch_document
app.post('/api/fin/batch-import/:id/unbind', async (req, res) => {
  try {
    const { userId, batch_document_id } = req.body || {};
    if (!batch_document_id) return res.status(400).json({ success: false, error: 'batch_document_id obrigatório' });
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [batch_document_id]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    if (doc.anexo_id) {
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?`, [doc.anexo_id]); } catch (_) {}
    }
    let masterGroup = [];
    if (Number(doc.is_master_group) === 1 && doc.master_voucher_ids) {
      try { masterGroup = typeof doc.master_voucher_ids === 'string' ? JSON.parse(doc.master_voucher_ids) : doc.master_voucher_ids; } catch (_) {}
    }
    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = NULL, anexo_id = NULL, status = 'PENDENTE', is_master_group = 0, master_voucher_ids = NULL, bound_by_user_id = NULL, bound_by_user_name = NULL, bound_at = NULL WHERE id = ?`,
      [batch_document_id]
    );
    const logTargets = doc.voucher_id ? [doc.voucher_id] : masterGroup;
    for (const vid of logTargets) {
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'ANEXO_DESVINCULADO_LOTE', ?, NOW())`,
          [logId, vid, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; file=${doc.file_name}`]
        );
      } catch (_) {}
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/unbind]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/batch-import/doc/:id — delete_batch_document
app.delete('/api/fin/batch-import/doc/:id', async (req, res) => {
  try {
    const docId = req.params.id;
    const { userId } = req.body || {};
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [docId]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    let masterGroup = [];
    if (Number(doc.is_master_group) === 1 && doc.master_voucher_ids) {
      try { masterGroup = typeof doc.master_voucher_ids === 'string' ? JSON.parse(doc.master_voucher_ids) : doc.master_voucher_ids; } catch (_) {}
    }
    if (doc.anexo_id) {
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?`, [doc.anexo_id]); } catch (_) {}
    }
    await finQuery(`DELETE FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [docId]);
    const logTargets = doc.voucher_id ? [doc.voucher_id] : masterGroup;
    for (const vid of logTargets) {
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'DOCUMENTO_LOTE_EXCLUIDO', ?, NOW())`,
          [logId, vid, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; file=${doc.file_name}`]
        );
      } catch (_) {}
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/batch-import/doc/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/finalize — finalize_batch_import
app.post('/api/fin/batch-import/:id/finalize', async (req, res) => {
  try {
    const batchId = req.params.id;
    const { userId } = req.body || {};
    const userName = String(userId || '');

    const items = await finQuery(
      `SELECT voucher_id, fornecedor, forma_pagamento, etapa_destino FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IS NOT NULL`,
      [batchId]
    );
    const voucherIds = (items || []).map(i => i.voucher_id);

    const allDocs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE batch_id = ?`, [batchId]);
    const masterDocs = (allDocs || []).filter(d => Number(d.is_master_group) === 1 && d.master_voucher_ids);
    const groupDocs = [];
    for (const d of masterDocs) {
      let vids = [];
      try { vids = typeof d.master_voucher_ids === 'string' ? JSON.parse(d.master_voucher_ids) : d.master_voucher_ids; } catch (_) {}
      if (Array.isArray(vids) && vids.length >= 2) groupDocs.push({ doc: d, vids });
    }
    const masterTiposByVoucher = {};
    for (const g of groupDocs) {
      for (const vid of g.vids) {
        if (g.doc.tipo_anexo) (masterTiposByVoucher[vid] ||= []).push(g.doc.tipo_anexo);
      }
    }

    // Verificar pendências
    const pendentes = [];
    if (voucherIds.length > 0) {
      const ph = voucherIds.map(() => '?').join(',');
      const allAnexos = await finQuery(`SELECT voucher_id, tipo FROM dados_dachser.t_voucher_anexos WHERE voucher_id IN (${ph})`, voucherIds);
      const byV = {};
      for (const a of (allAnexos || [])) (byV[a.voucher_id] ||= []).push(a.tipo);
      for (const it of (items || [])) {
        const tipos = [...(byV[it.voucher_id] || []), ...(masterTiposByVoucher[it.voucher_id] || [])];
        let temFatura = tipos.some(t => t === 'FATURA' || t === 'FATURA_DEMONSTRATIVO');
        let temBoleto = tipos.some(t => t === 'BOLETO' || t === 'BOLETO_INSTRUCOES');
        const temDai = tipos.some(t => t === 'DAI');
        if (temDai) { temFatura = true; temBoleto = true; }
        const requerBoleto = it.forma_pagamento === 'BOLETO';
        const isPreLanc = String(it.etapa_destino || '').toUpperCase() === 'PRE_LANCAMENTO';
        const motivos = [];
        if (isPreLanc) {
          if (!temFatura && !temBoleto && !temDai) motivos.push('PENDENTE_DOCUMENTO');
        } else {
          if (!temFatura) motivos.push('PENDENTE_FATURA');
          if (requerBoleto && !temBoleto) motivos.push('PENDENTE_BOLETO');
        }
        if (motivos.length) pendentes.push({ voucher_id: it.voucher_id, fornecedor: it.fornecedor, motivos });
      }
    }
    if (pendentes.length > 0) return res.status(422).json({ success: false, error: 'Lote possui pendências', pendentes });

    // Criar masters a partir dos grupos
    let mastersCreated = 0;
    const groupKey = (vids) => [...vids].sort().join('|');
    const groupsByKey = new Map();
    for (const g of groupDocs) {
      const k = groupKey(g.vids);
      const existing = groupsByKey.get(k);
      if (existing) existing.docs.push(g.doc);
      else groupsByKey.set(k, { vids: g.vids, docs: [g.doc] });
    }
    const childrenPromoted = new Set();
    const extraMasterItems = [];
    const masterErrors = [];

    for (const grp of groupsByKey.values()) {
      try {
        const ph = grp.vids.map(() => '?').join(',');
        const childRows = await finQuery(`
          SELECT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda,
                 v.vencimento, v.data_emissao_documento, v.tipo_documento, v.forma_pagamento,
                 v.cobranca_em_nome_de, v.filial, v.urgencia_tipo, v.id_rm,
                 v.processo_id, v.origem_processo, v.comentarios_operacao,
                 dfv.idmov AS dfv_idmov,
                 COALESCE(dfv.idmov, v.id_rm) AS sort_key
            FROM dados_dachser.t_vouchers v
            LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv
              ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci
               = SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci
           WHERE v.id IN (${ph})
        `, grp.vids);
        if (!childRows || childRows.length === 0) { masterErrors.push(`Master vazio (vids=${grp.vids.join(',')})`); continue; }

        const withKey = childRows.filter(c => c.sort_key != null);
        let masterSpo;
        if (withKey.length > 0) {
          withKey.sort((a, b) => (parseInt(a.sort_key) || Infinity) - (parseInt(b.sort_key) || Infinity));
          masterSpo = withKey[0].numero_spo;
        } else {
          masterSpo = childRows[0].numero_spo || `MASTER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        }
        try {
          const dup = await finQuery(`SELECT 1 FROM dados_dachser.t_vouchers WHERE numero_spo = ? AND id_rm IS NULL AND is_master = 1 LIMIT 1`, [masterSpo]);
          if (dup && dup.length > 0) masterSpo = `${masterSpo}-M${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        } catch (_) {}

        const totalValor = childRows.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
        const ref = childRows[0];
        const masterId = crypto.randomUUID();
        const destinoMaster = String(ref.urgencia_tipo || '').toUpperCase() === 'URGENTE_REAL'
          ? 'SUPERVISOR'
          : (String(ref.cobranca_em_nome_de || '').toUpperCase() === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');

        await finQuery(`
          INSERT INTO dados_dachser.t_vouchers
            (id, numero_spo, processo_id, origem_processo, fornecedor, cnpj_fornecedor,
             valor, moeda, vencimento, data_emissao_documento, tipo_documento, filial,
             forma_pagamento, cobranca_em_nome_de, urgencia_tipo, comentarios_operacao,
             etapa_atual, status_baixa, status_financeiro, is_master, nome_master,
             origem_criacao, tipo_execucao_pagamento, criado_por_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', 'PENDENTE', 1, ?, 'IMPORT_LOTE', 'A_DEFINIR', ?, NOW(), NOW())
        `, [
          masterId, masterSpo, ref.processo_id || null, ref.origem_processo || 'CHB',
          ref.fornecedor, ref.cnpj_fornecedor, totalValor, ref.moeda || 'BRL',
          ref.vencimento, ref.data_emissao_documento, ref.tipo_documento, ref.filial,
          ref.forma_pagamento, ref.cobranca_em_nome_de, ref.urgencia_tipo, ref.comentarios_operacao || null,
          destinoMaster, `MASTER ${masterSpo} (${childRows.length})`, String(userId || 'SISTEMA_LOTE'),
        ]);

        await finQuery(
          `UPDATE dados_dachser.t_vouchers SET voucher_master_id = ?, etapa_atual = 'CONSOLIDADO_NO_MASTER', updated_at = NOW() WHERE id IN (${ph})`,
          [masterId, ...grp.vids]
        );
        for (const vid of grp.vids) childrenPromoted.add(vid);

        const masterAnexoKeys = new Set();
        for (const d of grp.docs) {
          const anexoId = crypto.randomUUID();
          await finQuery(
            `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [anexoId, masterId, d.tipo_anexo, d.file_name, d.file_url, d.size_bytes || 0]
          );
          masterAnexoKeys.add(`${String(d.tipo_anexo || '').toUpperCase()}|${String(d.file_url || '')}`);
          await finQuery(
            `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = ?, anexo_id = ? WHERE id = ?`,
            [masterId, anexoId, d.id]
          );
        }

        // Extração de linha digitável para master (boleto/DAI) via Supabase edge function
        try {
          const boletoDoc = grp.docs.find(d => ['BOLETO', 'BOLETO_INSTRUCOES'].includes(String(d.tipo_anexo || '').toUpperCase()));
          const daiDoc = grp.docs.find(d => String(d.tipo_anexo || '').toUpperCase() === 'DAI');
          const sourceDoc = boletoDoc || daiDoc;
          if (sourceDoc?.file_url && process.env.SUPABASE_URL) {
            const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
            const extRes = await fetch(`${process.env.SUPABASE_URL}/functions/v1/extract-boleto-barcode`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supaKey}`, 'apikey': supaKey || '' },
              body: JSON.stringify({ fileUrl: sourceDoc.file_url }),
            });
            const ext = await extRes.json().catch(() => null);
            if (ext?.success && ext?.linhaDigitavel) {
              await finQuery(
                `UPDATE dados_dachser.t_vouchers SET linha_digitavel = ?, codigo_barras = ?, updated_at = NOW() WHERE id = ?`,
                [ext.linhaDigitavel, ext.codigoBarras || null, masterId]
              );
            }
          }
        } catch (e) { console.warn('[finalize] linha_digitavel master falhou:', e?.message); }

        // Espelhar anexos dos filhos no master
        try {
          const childAnexos = await finQuery(`SELECT tipo, file_name, file_url, file_size FROM dados_dachser.t_voucher_anexos WHERE voucher_id IN (${ph})`, grp.vids);
          for (const a of (childAnexos || [])) {
            const key = `${String(a.tipo || '').toUpperCase()}|${String(a.file_url || '')}`;
            if (masterAnexoKeys.has(key)) continue;
            try {
              const newId = crypto.randomUUID();
              await finQuery(
                `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [newId, masterId, a.tipo, a.file_name, a.file_url, a.file_size || 0]
              );
              masterAnexoKeys.add(key);
            } catch (_) {}
          }
        } catch (e) { console.error('[finalize] copy child anexos failed:', e?.message); }

        try {
          const logId = crypto.randomUUID();
          await finQuery(
            `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'MASTER_CRIADO_LOTE', ?, NOW())`,
            [logId, masterId, userName, userName, `batch_id=${batchId}; spo=${masterSpo}; children=${grp.vids.length}; total=${totalValor}`]
          );
        } catch (_) {}
        extraMasterItems.push({ voucher_id: masterId, etapa_destino: destinoMaster, fornecedor: ref.fornecedor, forma_pagamento: ref.forma_pagamento });
        mastersCreated++;
      } catch (e) {
        masterErrors.push(`vids=${grp.vids.join(',')}: ${e?.message || String(e)}`);
        console.error('[finalize] master creation failed:', e?.message, 'vids=', grp.vids);
      }
    }

    if (groupsByKey.size > 0 && mastersCreated === 0) {
      return res.status(500).json({ success: false, error: 'Falha ao criar voucher master. Nenhum voucher foi promovido.', master_errors: masterErrors });
    }

    // Promover vouchers para etapa de destino
    const itemsToPromote = [
      ...(items || []).filter(it => !childrenPromoted.has(it.voucher_id)),
      ...extraMasterItems,
    ];
    let promoted = 0;
    for (const it of itemsToPromote) {
      let destino = String(it.etapa_destino || '').toUpperCase();
      if (!destino || !['FISCAL', 'FINANCEIRO', 'SUPERVISOR', 'PRE_LANCAMENTO'].includes(destino)) {
        try {
          const vrows = await finQuery(`SELECT urgencia_tipo, cobranca_em_nome_de, etapa_atual FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1`, [it.voucher_id]);
          const v = vrows && vrows[0];
          if (v) {
            if (String(v.etapa_atual || '').toUpperCase() === 'PRE_LANCAMENTO') destino = 'PRE_LANCAMENTO';
            else destino = String(v.urgencia_tipo || '').toUpperCase() === 'URGENTE_REAL' ? 'SUPERVISOR' : (String(v.cobranca_em_nome_de || '').toUpperCase() === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
          }
        } catch (_) {}
      }
      if (!destino) destino = 'FISCAL';
      try {
        const fromEtapa = destino === 'PRE_LANCAMENTO' ? 'PRE_LANCAMENTO' : 'AGUARDANDO_DOCUMENTOS_LOTE';
        const upd = await finQuery(
          `UPDATE dados_dachser.t_vouchers SET etapa_atual = ?, updated_at = NOW() WHERE id = ? AND etapa_atual = ?`,
          [destino, it.voucher_id, fromEtapa]
        );
        const aff = Number(upd?.affectedRows ?? upd?.affected_rows ?? 0);
        if (aff > 0) {
          promoted++;
          try {
            const logId = crypto.randomUUID();
            await finQuery(
              `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'VOUCHER_PROMOVIDO_LOTE', ?, NOW())`,
              [logId, it.voucher_id, userName, userName, `batch_id=${batchId}; etapa=${destino}`]
            );
          } catch (_) {}
        }
      } catch (e) { console.log('promote voucher failed:', it.voucher_id, e); }
    }

    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_import SET status = 'COMPLETE', finalized_at = NOW(), finalized_by_user_id = ?, finalized_by_user_name = ? WHERE id = ?`,
      [userName, userName, batchId]
    );
    try {
      const logId = crypto.randomUUID();
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'IMPORTACAO_LOTE_FINALIZADA', ?, NOW())`,
        [logId, voucherIds[0] || batchId, userName, userName, `batch_id=${batchId}; vouchers=${voucherIds.length}; promovidos=${promoted}`]
      );
    } catch (_) {}
    res.json({ success: true, batch_id: batchId, finalized: true, masters_created: mastersCreated, promoted });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/finalize]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5d: Anexos + Filhos Batch + Pagamentos + Tipo Execução + Pronto Robô ──────────────────────────

// GET /api/fin/vouchers/:id/anexos — get_voucher_anexos
app.get('/api/fin/vouchers/:id/anexos', async (req, res) => {
  try {
    const { id } = req.params;
    const anexos = await finQuery(
      `SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at
       FROM dados_dachser.t_voucher_anexos
       WHERE voucher_id = ?
       ORDER BY created_at DESC`,
      [id]
    );
    res.json({ success: true, data: anexos || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/:id/anexos]', err.message);
    res.status(500).json({ success: false, error: 'Falha ao consultar anexos no banco', data: [] });
  }
});

// POST /api/fin/vouchers/filhos-batch — get_voucher_filhos_batch
app.post('/api/fin/vouchers/filhos-batch', async (req, res) => {
  try {
    const { master_ids } = req.body || {};
    if (!master_ids || master_ids.length === 0) return res.json({ success: true, data: {} });
    const placeholders = master_ids.map(() => '?').join(',');
    const filhos = await finQuery(
      `SELECT voucher_master_id, MIN(id) as id, numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual,
              COUNT(*) as qtd_duplicados
       FROM dados_dachser.t_vouchers
       WHERE voucher_master_id IN (${placeholders})
       GROUP BY voucher_master_id, numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual
       ORDER BY numero_spo ASC`,
      master_ids
    );
    const grouped = {};
    for (const filho of (filhos || [])) {
      const mid = filho.voucher_master_id;
      if (!grouped[mid]) grouped[mid] = [];
      grouped[mid].push(filho);
    }
    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/filhos-batch]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/pagamentos — list_pagamentos
app.get('/api/fin/pagamentos', async (req, res) => {
  try {
    const {
      page = 1, perPage,
      filterVencimento, filterStatusPagamento, filterTipoExecucao,
      filterFornecedor, filterBusca, filterCobranca, filterFilial,
      filterMoeda, filterFormaPagamento, filterStatusIntegracaoRm,
      filterDataVencimentoInicio, filterDataVencimentoFim,
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const unlimited = !perPage || perPage === 'all' || perPage === '0';
    const perPageNum = unlimited ? null : (parseInt(perPage) || 50);
    const offset = unlimited ? 0 : (pageNum - 1) * perPageNum;

    const conditions = [
      "v.etapa_atual IN ('FINANCEIRO', 'ROBO')",
      "NOT EXISTS (SELECT 1 FROM dados_dachser.t_dados_financeiro_voucher dfv2 WHERE SUBSTRING_INDEX(TRIM(dfv2.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci AND dfv2.modal = 'ADM')",
      "v.sync_status = 'ATIVO'",
      "(v.voucher_master_id IS NULL OR v.voucher_master_id = '')",
    ];
    const params = [];

    if (filterVencimento === 'hoje') {
      conditions.push("v.vencimento = CURDATE()");
    } else if (filterVencimento === 'vencidos') {
      conditions.push("v.vencimento < CURDATE()");
      conditions.push("(v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL)");
    } else if (filterVencimento === 'proximos7') {
      conditions.push("v.vencimento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)");
    } else if (filterVencimento === 'a_vencer') {
      conditions.push("v.vencimento >= CURDATE()");
    }

    if (filterStatusPagamento) { conditions.push("v.status_pagamento = ?"); params.push(filterStatusPagamento); }
    if (filterTipoExecucao) {
      if (filterTipoExecucao === 'REMESSA') {
        conditions.push("v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H')");
      } else if (filterTipoExecucao === 'A_DEFINIR') {
        conditions.push("(v.tipo_execucao_pagamento IS NULL OR v.tipo_execucao_pagamento = '' OR v.tipo_execucao_pagamento = 'A_DEFINIR')");
      } else {
        conditions.push("v.tipo_execucao_pagamento = ?"); params.push(filterTipoExecucao);
      }
    }
    const termoBusca = (filterBusca || filterFornecedor || '').trim();
    if (termoBusca) {
      if (/^\d+$/.test(termoBusca)) {
        conditions.push("v.numero_spo LIKE ?"); params.push(`${termoBusca}%`);
      } else {
        conditions.push("(v.numero_spo LIKE ? OR v.fornecedor LIKE ?)");
        params.push(`${termoBusca}%`, `%${termoBusca}%`);
      }
    }
    if (filterCobranca) { conditions.push("v.cobranca_em_nome_de = ?"); params.push(filterCobranca); }
    if (filterFilial) { conditions.push("v.filial = ?"); params.push(filterFilial); }
    if (filterMoeda) { conditions.push("v.moeda = ?"); params.push(filterMoeda); }
    if (filterFormaPagamento) { conditions.push("v.forma_pagamento = ?"); params.push(filterFormaPagamento); }
    if (filterStatusIntegracaoRm) { conditions.push("v.status_integracao_rm = ?"); params.push(filterStatusIntegracaoRm); }
    if (filterDataVencimentoInicio) { conditions.push("v.vencimento >= ?"); params.push(filterDataVencimentoInicio); }
    if (filterDataVencimentoFim) { conditions.push("v.vencimento <= ?"); params.push(filterDataVencimentoFim); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = unlimited ? '' : 'LIMIT ? OFFSET ?';
    const listParams = unlimited ? params : [...params, perPageNum, offset];

    const listSql = `
      WITH page_v AS (
        SELECT v.* FROM dados_dachser.t_vouchers v ${whereClause}
        ORDER BY v.vencimento ASC, v.created_at DESC ${limitClause}
      )
      SELECT
        v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda,
        v.vencimento, v.forma_pagamento, v.tipo_documento, v.cobranca_em_nome_de,
        v.filial, v.linha_digitavel, v.codigo_barras, v.status_pagamento,
        v.tipo_execucao_pagamento, v.is_pronto_para_robo, v.lote_remessa_id,
        v.status_integracao_rm, v.etapa_atual, v.status_baixa, v.status_comprovante, v.created_at, v.updated_at,
        v.urgencia_tipo, v.is_master, v.nome_master, v.voucher_master_id, v.comentarios_operacao,
        COALESCE(a.has_boleto_anexo, 0) AS has_boleto_anexo,
        l.user_name AS enviado_por_user_name
      FROM page_v v
      LEFT JOIN (
        SELECT voucher_id, COUNT(*) AS has_boleto_anexo
        FROM dados_dachser.t_voucher_anexos
        WHERE tipo IN ('BOLETO', 'BOLETO_INSTRUCOES') AND voucher_id IN (SELECT id FROM page_v)
        GROUP BY voucher_id
      ) a ON a.voucher_id = v.id
      LEFT JOIN (
        SELECT l1.voucher_id, l1.user_name
        FROM dados_dachser.t_voucher_logs l1
        INNER JOIN (
          SELECT voucher_id, MAX(data_hora) AS max_dh
          FROM dados_dachser.t_voucher_logs
          WHERE acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE')
            AND voucher_id IN (SELECT id FROM page_v)
          GROUP BY voucher_id
        ) m ON m.voucher_id = l1.voucher_id AND m.max_dh = l1.data_hora
        WHERE l1.acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE')
      ) l ON l.voucher_id = v.id
      ORDER BY v.vencimento ASC, v.created_at DESC
    `;
    const statsSql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN v.vencimento >= CURDATE() THEN 1 ELSE 0 END) as a_vencer_count,
        SUM(CASE WHEN v.vencimento >= CURDATE() THEN COALESCE(v.valor, 0) ELSE 0 END) as a_vencer_valor,
        SUM(CASE WHEN v.vencimento < CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN 1 ELSE 0 END) as vencidos_count,
        SUM(CASE WHEN v.vencimento < CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN COALESCE(v.valor, 0) ELSE 0 END) as vencidos_valor,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN 1 ELSE 0 END) as em_remessa_count,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN COALESCE(v.valor, 0) ELSE 0 END) as em_remessa_valor,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento = 'MANUAL' THEN 1 ELSE 0 END) as manual_count,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento = 'MANUAL' THEN COALESCE(v.valor, 0) ELSE 0 END) as manual_valor,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN 1 ELSE 0 END) as prontos_remessa_count,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN COALESCE(v.valor, 0) ELSE 0 END) as prontos_remessa_valor,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento = 'MANUAL' THEN 1 ELSE 0 END) as prontos_manual_count,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento = 'MANUAL' THEN COALESCE(v.valor, 0) ELSE 0 END) as prontos_manual_valor,
        SUM(COALESCE(v.valor, 0)) as valor_total
      FROM dados_dachser.t_vouchers v ${whereClause}
    `;

    const countSql = `SELECT COUNT(*) as total FROM dados_dachser.t_vouchers v ${whereClause}`;
    const [countResult, vouchers, statsResult] = await Promise.all([
      finQuery(countSql, params),
      finQuery(listSql, listParams),
      finQuery(statsSql, params),
    ]);
    const total = Number(countResult[0]?.total || 0);
    res.json({
      success: true,
      vouchers: vouchers || [],
      total,
      totalPages: unlimited ? 1 : Math.ceil(total / perPageNum),
      currentPage: unlimited ? 1 : pageNum,
      stats: statsResult[0] || {},
    });
  } catch (err) {
    console.error('[GET /api/fin/pagamentos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/tipo-execucao — set_tipo_execucao_pagamento
app.patch('/api/fin/vouchers/:id/tipo-execucao', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo_execucao_pagamento } = req.body || {};
    const ALLOWED = new Set(['A_DEFINIR', 'MANUAL', 'REMESSA_10H', 'REMESSA_15H', 'PAGO_ADF']);
    if (!id || !tipo_execucao_pagamento) return res.status(400).json({ error: 'id e tipo_execucao_pagamento são obrigatórios' });
    if (!ALLOWED.has(tipo_execucao_pagamento)) return res.status(400).json({ error: `tipo_execucao_pagamento inválido: ${tipo_execucao_pagamento}` });

    if (tipo_execucao_pagamento === 'PAGO_ADF') {
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET tipo_execucao_pagamento = ?,
         etapa_atual = CASE WHEN etapa_atual = 'FINANCEIRO' THEN 'ROBO' ELSE etapa_atual END,
         updated_at = NOW() WHERE id = ?`,
        [tipo_execucao_pagamento, id]
      );
    } else {
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET tipo_execucao_pagamento = ?, updated_at = NOW() WHERE id = ?`,
        [tipo_execucao_pagamento, id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/tipo-execucao]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/batch-tipo-execucao — batch_set_tipo_execucao
app.post('/api/fin/vouchers/batch-tipo-execucao', async (req, res) => {
  try {
    const { voucher_ids, tipo_execucao_pagamento } = req.body || {};
    const ALLOWED = new Set(['A_DEFINIR', 'MANUAL', 'REMESSA_10H', 'REMESSA_15H', 'PAGO_ADF']);
    if (!voucher_ids || voucher_ids.length === 0 || !tipo_execucao_pagamento)
      return res.status(400).json({ error: 'voucher_ids e tipo_execucao_pagamento são obrigatórios' });
    if (!ALLOWED.has(tipo_execucao_pagamento))
      return res.status(400).json({ error: `tipo_execucao_pagamento inválido: ${tipo_execucao_pagamento}` });

    const placeholders = voucher_ids.map(() => '?').join(',');
    const isAdf = tipo_execucao_pagamento === 'PAGO_ADF';
    await finQuery(
      `UPDATE dados_dachser.t_vouchers
       SET tipo_execucao_pagamento = ?,
           ${isAdf ? "etapa_atual = CASE WHEN etapa_atual = 'FINANCEIRO' THEN 'ROBO' ELSE etapa_atual END," : ''}
           updated_at = NOW()
       WHERE id IN (${placeholders})`,
      [tipo_execucao_pagamento, ...voucher_ids]
    );
    res.json({ success: true, updated: voucher_ids.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/batch-tipo-execucao]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/pronto-robo — set_ready_for_robo
app.patch('/api/fin/vouchers/:id/pronto-robo', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pronto } = req.body || {};
    if (!id) return res.status(400).json({ error: 'voucher_id é obrigatório' });

    const [voucher] = await finQuery(
      `SELECT tipo_execucao_pagamento, forma_pagamento, status_comprovante FROM dados_dachser.t_vouchers WHERE id = ?`,
      [id]
    );
    const tipoExec = voucher?.tipo_execucao_pagamento;
    const formaPag = String(voucher?.forma_pagamento || '').toUpperCase();
    const statusComp = String(voucher?.status_comprovante || '').toUpperCase();
    const isDebito = formaPag === 'DEBITO';
    const isPagoAdf = tipoExec === 'PAGO_ADF';

    if (is_pronto && isPagoAdf) {
      if (statusComp !== 'ANEXADO' && statusComp !== 'VALIDADO') {
        return res.status(409).json({ error: 'COMPROVANTE_OBRIGATORIO', message: 'Anexe o comprovante antes de marcar como pronto.' });
      }
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET is_pronto_para_robo = 1, status_pagamento = 'PAGO',
         status_baixa = 'BAIXA_MANUAL', status_financeiro = 'CONCLUIDO', etapa_atual = 'CONCLUIDO', updated_at = NOW()
         WHERE id = ?`,
        [id]
      );
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (?, ?, NULL, 'Sistema', 'CONCLUIDO_PAGO_ADF', 'Voucher concluído via Pago em ADF — comprovante anexado, sem passar pelo robô', NOW())`,
        [crypto.randomUUID(), id]
      ).catch(() => {});
      return res.json({ success: true, auto_concluded: true, reason: 'PAGO_ADF' });
    }

    if (is_pronto && isDebito) {
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET is_pronto_para_robo = 1, status_pagamento = 'PAGO',
         status_baixa = 'BAIXA_DEBITO', status_financeiro = 'CONCLUIDO', status_comprovante = 'NAO_APLICA',
         etapa_atual = 'CONCLUIDO', updated_at = NOW() WHERE id = ?`,
        [id]
      );
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (?, ?, NULL, 'Sistema', 'BAIXA_DEBITO_AUTOMATICA', 'Voucher concluído via débito automático — sem comprovante necessário', NOW())`,
        [crypto.randomUUID(), id]
      ).catch(() => {});
      return res.json({ success: true, auto_concluded: true, reason: 'DEBITO' });
    }

    const statusBaixa = (tipoExec || '').includes('REMESSA') ? 'BAIXA_REMESSA' : 'BAIXA_MANUAL';
    await finQuery(
      `UPDATE dados_dachser.t_vouchers
       SET is_pronto_para_robo = ?,
           status_pagamento = CASE WHEN ? = 1 THEN 'PRONTO' ELSE status_pagamento END,
           status_baixa = CASE WHEN ? = 1 THEN ? ELSE status_baixa END,
           etapa_atual = CASE WHEN ? = 1 THEN 'ROBO' ELSE etapa_atual END,
           updated_at = NOW()
       WHERE id = ?`,
      [is_pronto ? 1 : 0, is_pronto ? 1 : 0, is_pronto ? 1 : 0, statusBaixa, is_pronto ? 1 : 0, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/pronto-robo]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/dados-rm/tipo-exec — update_tipo_exec_dados_rm
app.patch('/api/fin/dados-rm/tipo-exec', async (req, res) => {
  try {
    const { id_rm, numero_spo, tipo_exec } = req.body || {};
    const updateKey = id_rm || numero_spo;
    if (!updateKey) return res.status(400).json({ error: 'id_rm ou numero_spo é obrigatório' });
    await finQuery(
      `UPDATE dados_dachser.t_dados_rm SET tipo_exec = ? WHERE id_rm = ? OR nd = ?`,
      [tipo_exec || null, updateKey, numero_spo || updateKey]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/dados-rm/tipo-exec]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5c: Fornecedores sem Fiscal + Backlog RM + Faturas + Dados Bancários ──────────────────────────

// Ensure table exists helper (called once per endpoint)
const ensureFornecedoresSemFiscalTable = async () => {
  await finQuery(`CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_fornecedores_sem_fiscal (
    id INT AUTO_INCREMENT PRIMARY KEY, cnpj VARCHAR(20) NOT NULL, nome VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(150) NULL,
    active TINYINT(1) DEFAULT 1, UNIQUE KEY uniq_cnpj (cnpj)
  ) COLLATE=utf8mb4_unicode_ci`);
};

// GET /api/fin/fornecedores-sem-fiscal
app.get('/api/fin/fornecedores-sem-fiscal', async (req, res) => {
  try {
    await ensureFornecedoresSemFiscalTable();
    const countRows = await finQuery('SELECT COUNT(*) as total FROM dados_dachser.t_voucher_fornecedores_sem_fiscal');
    if (Number(countRows?.[0]?.total || 0) === 0) {
      const seed = [
        ["10.250.551/0003-29","LECHMAN TERMINAIS EIRELI"],["02.762.121/0009-53","SANTOS BRASIL PARTICIPACOES S/A"],
        ["15.578.569/0001-06","GRU AIRPORT"],["86.846.847/0001-07","ALLINK TRANSPORTES INTERNACIONAIS LTDA"],
        ["02.502.234/0001-62","COSCO BRASIL"],["01.831.941/0001-30","CRAFT"],
        ["37.115.342/0031-82","DEPARTAMENTO FUNDO DE MARINHA MERCANTE"],["05.895.924/0001-17","TK BR DESPACHANTE ADUANEIRO"],
        ["24.620.316/0003-06","PAC LOG"],["28.689.596/0001-06","ONE OCEAN"],["02.378.779/0001-09","MSC MEDITERRANEAN"],
      ];
      for (const [cnpj, nome] of seed) {
        try { await finQuery('INSERT IGNORE INTO dados_dachser.t_voucher_fornecedores_sem_fiscal (cnpj, nome, created_by) VALUES (?,?,?)', [cnpj, nome, 'SEED']); } catch (_) {}
      }
    }
    const rows = await finQuery('SELECT id, cnpj, nome, created_by, created_at FROM dados_dachser.t_voucher_fornecedores_sem_fiscal WHERE active = 1 ORDER BY nome ASC');
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/fornecedores-sem-fiscal]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/fornecedores-sem-fiscal
app.post('/api/fin/fornecedores-sem-fiscal', async (req, res) => {
  try {
    const { cnpj, nome, created_by } = req.body || {};
    if (!cnpj || !nome) return res.status(400).json({ success: false, error: 'cnpj e nome são obrigatórios' });
    await ensureFornecedoresSemFiscalTable();
    const exists = await finQuery('SELECT id FROM dados_dachser.t_voucher_fornecedores_sem_fiscal WHERE cnpj = ? LIMIT 1', [cnpj]);
    if (exists && exists.length > 0) {
      await finQuery('UPDATE dados_dachser.t_voucher_fornecedores_sem_fiscal SET nome=?, active=1, created_by=COALESCE(?,created_by) WHERE cnpj=?', [nome, created_by||null, cnpj]);
      res.json({ success: true, message: 'Fornecedor reativado/atualizado' });
    } else {
      await finQuery('INSERT INTO dados_dachser.t_voucher_fornecedores_sem_fiscal (cnpj, nome, created_by) VALUES (?,?,?)', [cnpj, nome, created_by||null]);
      res.json({ success: true, message: 'Fornecedor adicionado' });
    }
  } catch (err) {
    console.error('[POST /api/fin/fornecedores-sem-fiscal]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/fornecedores-sem-fiscal/:id
app.delete('/api/fin/fornecedores-sem-fiscal/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await finQuery('UPDATE dados_dachser.t_voucher_fornecedores_sem_fiscal SET active=0 WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/fornecedores-sem-fiscal/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/faturas/hoje
app.get('/api/fin/faturas/hoje', async (req, res) => {
  try {
    const rows = await finQuery(`
      SELECT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.vencimento,
             v.forma_pagamento, v.status_baixa, v.etapa_atual, v.linha_digitavel, v.remessa, v.id_rm
      FROM dados_dachser.t_vouchers v
      WHERE DATE(v.vencimento) = CURDATE() AND v.etapa_atual IN ('FINANCEIRO', 'ROBO')
      ORDER BY v.vencimento ASC, v.fornecedor ASC
    `);
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/faturas/hoje]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/fornecedor/dados-bancarios?cnpj=
app.get('/api/fin/fornecedor/dados-bancarios', async (req, res) => {
  try {
    const cnpj = String(req.query.cnpj || '').replace(/\D/g, '');
    if (!cnpj) return res.status(400).json({ success: false, error: 'cnpj é obrigatório' });
    const rows = await finQuery(`
      SELECT banco, agencia, digito_agencia, conta_corrente, digito_conta, razao_social, cnpj
      FROM dados_dachser.t_dados_financeiro_pag
      WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? LIMIT 1
    `, [cnpj]);
    if (rows && rows.length > 0) {
      res.json({ success: true, data: rows[0] });
    } else {
      res.json({ success: false, error: 'Dados bancários não encontrados' });
    }
  } catch (err) {
    console.error('[GET /api/fin/fornecedor/dados-bancarios]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/pendentes-rm
app.get('/api/fin/vouchers/pendentes-rm', async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || '200'));
    let pendentes;
    try {
      pendentes = await finQuery(`
        WITH spo AS (
          SELECT 'SPO' AS source, dfs.id_rm, dfs.nd, dfs.documento, dfs.nome_beneficiario,
                 dfs.nome_cobranca, dfs.numero_nf, dfs.numero_processo, dfs.modal,
                 dfs.tipo_pag, dfs.forma_pag, dfs.data_emissao, dfs.data_vencimento,
                 dfs.valor_nf, dfs.moeda, dfs.cnpj, dfs.razao_social, dfs.detalhes
            FROM dados_dachser.t_dados_financeiro_spo dfs
           WHERE (dfs.nome_beneficiario IS NULL OR LOWER(dfs.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfs.modal IS NULL OR dfs.modal <> 'ADM')
        ),
        voucher AS (
          SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
                 dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
                 dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
                 dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, NULL AS detalhes
            FROM dados_dachser.t_dados_financeiro_voucher dfv
           WHERE (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
        ),
        unified AS (
          SELECT * FROM spo
          UNION ALL
          SELECT v.* FROM voucher v
           WHERE NOT EXISTS (
             SELECT 1 FROM spo s WHERE s.numero_processo IS NOT NULL
               AND s.numero_processo = v.numero_processo COLLATE utf8mb4_unicode_ci
           )
        )
        SELECT u.* FROM unified u
        LEFT JOIN dados_dachser.t_vouchers v
               ON SUBSTRING_INDEX(TRIM(u.nd),' ',1) COLLATE utf8mb4_unicode_ci
                = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
        LEFT JOIN dados_dachser.tbaixas b ON u.id_rm = b.IdLancamentoRM
        WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
        ORDER BY u.data_vencimento ASC LIMIT ?
      `, [limit]);
    } catch (_) {
      pendentes = await finQuery(`
        SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
               dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
               dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
               dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, NULL AS detalhes
          FROM dados_dachser.t_dados_financeiro_voucher dfv
          LEFT JOIN dados_dachser.t_vouchers v
                 ON SUBSTRING_INDEX(TRIM(dfv.nd),' ',1) COLLATE utf8mb4_unicode_ci
                  = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
          LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
         WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
           AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
           AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
         ORDER BY dfv.data_vencimento ASC LIMIT ?
      `, [limit]);
    }
    const normalized = (pendentes || []).map(row => {
      let processos_associados = [];
      if (row.source === 'SPO' && row.detalhes) {
        const seen = new Set();
        processos_associados = String(row.detalhes).split(';').map(s => s.trim()).filter(s => {
          if (!s) return false; const k = s.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true;
        });
      }
      return { ...row, processos_associados };
    });
    res.json({ success: true, data: normalized, count: normalized.length });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/pendentes-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/importar-rm
app.post('/api/fin/vouchers/importar-rm', async (req, res) => {
  try {
    const { nd, user_id, user_name } = req.body || {};
    if (!nd) return res.status(400).json({ success: false, error: 'nd é obrigatório' });

    const ndPrefix = String(nd).trim().split(/\s+/)[0] || '';
    const isSpoLike = /^[0-9]{2,4}-/.test(ndPrefix);
    const tables = isSpoLike
      ? ['t_dados_financeiro_spo', 't_dados_financeiro_voucher']
      : ['t_dados_financeiro_voucher', 't_dados_financeiro_spo'];

    let lookupIdRm = null;
    let sourceTable = null;
    for (const tbl of tables) {
      try {
        const r = await finQuery(`SELECT id_rm FROM dados_dachser.${tbl} WHERE SUBSTRING_INDEX(TRIM(nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci LIMIT 1`, [nd]);
        if (r && r.length > 0) { lookupIdRm = r[0].id_rm; sourceTable = tbl; break; }
      } catch (_) {}
    }

    const existing = await finQuery(`SELECT id, etapa_atual, numero_spo FROM dados_dachser.t_vouchers WHERE numero_spo = ? OR (id_rm IS NOT NULL AND id_rm = ?) LIMIT 1`, [nd, lookupIdRm]);
    if (existing && existing.length > 0) {
      const ev = existing[0];
      try { await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id,voucher_id,user_id,user_name,acao,detalhe,data_hora) VALUES (UUID(),?,?,?,'VOUCHER_RM_DUPLICADO_IGNORADO',?,NOW())`, [ev.id, user_id||null, user_name||'Sistema', `Import duplicado bloqueado. nd=${nd}`]); } catch (_) {}
      return res.json({ success: true, voucherId: ev.id, numeroSPO: nd, alreadyExists: true });
    }

    const fetchTable = sourceTable || (isSpoLike ? 't_dados_financeiro_spo' : 't_dados_financeiro_voucher');
    const includeDetalhes = fetchTable === 't_dados_financeiro_spo';
    const rmData = await finQuery(`SELECT id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_nf, numero_processo, modal, tipo_pag, forma_pag, data_emissao, data_vencimento, valor_nf, moeda, cnpj, razao_social${includeDetalhes ? ', detalhes' : ''} FROM dados_dachser.${fetchTable} WHERE nd = ? LIMIT 1`, [nd]);
    if (!rmData || rmData.length === 0) return res.status(404).json({ success: false, error: 'Registro não encontrado no RM' });

    const rm = rmData[0];
    const mapFormaPag = (fp) => ({ BOL:'BOLETO',BOLETO:'BOLETO',PIX:'PIX',TED:'TRANSFERENCIA',TRANSF:'TRANSFERENCIA',DEBITO:'DEBITO',CAMBIO:'CAMBIO',DARF:'DARF',GPS:'GPS' })[(fp||'').toUpperCase()] || 'BOLETO';
    const mapTipoDoc = (tp) => ({ NF:'NOTA_FISCAL',FAT:'FATURA',FATURA:'FATURA',DEM:'DEMONSTRATIVO',NFS:'NF_SERVICO' })[(tp||'').toUpperCase()] || 'FATURA';
    const toDate = (d) => {
      if (!d) return null;
      const s = String(d).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (/^\d{4}-\d{2}-\d{2}[ T]/.test(s)) return s.slice(0, 10);
      const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br) return `${br[3]}-${br[2]}-${br[1]}`;
      return null;
    };

    const { v4: uuidv4 } = await import('uuid').catch(() => ({ v4: () => require('crypto').randomUUID() }));
    const voucherId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : require('crypto').randomUUID();
    await finQuery(`INSERT INTO dados_dachser.t_vouchers (id,numero_spo,id_rm,fornecedor,cnpj_fornecedor,valor,moeda,vencimento,data_emissao_documento,forma_pagamento,tipo_documento,cobranca_em_nome_de,etapa_atual,status_baixa,urgencia_tipo,processo_id,criado_por_user_id,tipo_execucao_pagamento,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [voucherId, rm.nd, rm.id_rm||null, rm.nome_beneficiario||rm.razao_social, rm.cnpj, rm.valor_nf||0, rm.moeda||'BRL', toDate(rm.data_vencimento), toDate(rm.data_emissao), mapFormaPag(rm.forma_pag), mapTipoDoc(rm.tipo_pag), rm.nome_cobranca === 'CLIENTE' ? 'CLIENTE' : 'DACHSER', 'OPERACAO', 'PENDENTE', 'NORMAL', rm.numero_processo, user_id||null, 'A_DEFINIR']);
    try { await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id,voucher_id,user_id,user_name,acao,detalhe,data_hora) VALUES (UUID(),?,?,?,'IMPORTADO_RM',?,NOW())`, [voucherId, user_id||null, user_name||'Sistema', `Voucher importado do RM. ND: ${rm.nd}`]); } catch (_) {}

    res.json({ success: true, voucherId, numeroSPO: rm.nd });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/importar-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5b: Cancelamento + Comprovantes + Histórico + Datas ──────────────────────────

// POST /api/fin/vouchers/:id/cancelar — cancelar_voucher
app.post('/api/fin/vouchers/:id/cancelar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, voucher_credito, user_id, user_name } = req.body || {};
    if (!motivo || !voucher_credito) return res.status(400).json({ success: false, error: 'motivo e voucher_credito são obrigatórios' });
    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET etapa_atual='CANCELADO', cancelamento_motivo=?, cancelamento_voucher_credito=?, cancelado_por_user_id=?, cancelado_por_user_name=?, cancelado_em=NOW(), updated_at=NOW() WHERE id=?`,
      [motivo, voucher_credito, user_id || null, user_name || 'Sistema', id]
    );
    try {
      await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(),?,?,?,'VOUCHER_CANCELADO',?,NOW())`,
        [id, user_id || null, user_name || 'Sistema', `Voucher cancelado. Motivo: ${motivo}. Crédito em: ${voucher_credito}`]);
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/cancelar]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/comprovantes — list_comprovantes
app.get('/api/fin/vouchers/comprovantes', async (req, res) => {
  try {
    const page = parseInt(String(req.query.page || '1'));
    const perPage = parseInt(String(req.query.perPage || '100'));
    const offset = (page - 1) * perPage;
    const rows = await finQuery(`
      SELECT a.id, a.voucher_id, v.numero_spo, a.file_name, a.file_url, a.file_size,
             a.created_at, a.tipo as tipo_anexo, v.forma_pagamento, v.valor, v.fornecedor, v.tipo_documento
      FROM dados_dachser.t_voucher_anexos a
      INNER JOIN dados_dachser.t_vouchers v ON a.voucher_id = v.id
      WHERE v.etapa_atual = 'CONCLUIDO' AND a.tipo = 'COMPROVANTE'
        AND a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY a.created_at DESC LIMIT ? OFFSET ?
    `, [perPage, offset]);
    const countRows = await finQuery(`
      SELECT COUNT(*) as total FROM dados_dachser.t_voucher_anexos a
      INNER JOIN dados_dachser.t_vouchers v ON a.voucher_id = v.id
      WHERE v.etapa_atual = 'CONCLUIDO' AND a.tipo = 'COMPROVANTE'
    `);
    const total = Number(countRows?.[0]?.total || 0);
    res.json({ success: true, comprovantes: rows || [], total, page, perPage, totalPages: Math.ceil(total / perPage) });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/comprovantes]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/baixas/historico — get_historico_baixas
app.get('/api/fin/baixas/historico', async (req, res) => {
  try {
    const { periodo = '30dias' } = req.query;
    let dateFilter = '';
    if (periodo === 'hoje') dateFilter = `AND DATE(b.DataDaBaixa) = CURDATE()`;
    else if (periodo === '7dias') dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
    else if (periodo === '30dias') dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
    else if (periodo === '90dias') dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 90 DAY)`;

    const baixasRaw = await finQuery(`
      SELECT b.IdLancamentoRM, b.IdBaixa, b.TipoPagRec as tipo_pag_rec,
             b.ValorBaixado as valor_baixa, b.DataDaBaixa as data_baixa,
             b.UsuarioBaixa as usuario_baixa, b.StatusLan as status_lan
      FROM dados_dachser.tbaixas b
      WHERE b.TipoPagRec = 1 AND b.StatusLan IN (0, 1, 2, 3) ${dateFilter}
      ORDER BY b.DataDaBaixa DESC LIMIT 1500
    `);

    if (!baixasRaw || baixasRaw.length === 0) {
      return res.json({ success: true, data: [], count: 0 });
    }

    const idRms = [...new Set(baixasRaw.map(b => b.IdLancamentoRM).filter(Boolean))];
    let dfvMap = {};
    let nfsIdSet = new Set();
    if (idRms.length > 0) {
      const placeholders = idRms.map(() => '?').join(',');
      const [dfvRows, nfsRows] = await Promise.all([
        finQuery(`SELECT id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_processo, forma_pag, data_vencimento, valor_nf, moeda, modal FROM dados_dachser.t_dados_financeiro_voucher WHERE id_rm IN (${placeholders})`, idRms),
        finQuery(`SELECT DISTINCT id_rm FROM dados_dachser.t_dados_financeiro_nfs WHERE id_rm IN (${placeholders})`, idRms),
      ]);
      for (const row of (dfvRows || [])) dfvMap[String(row.id_rm)] = row;
      for (const row of (nfsRows || [])) nfsIdSet.add(String(row.id_rm));
    }

    const baixas = baixasRaw
      .filter(b => !nfsIdSet.has(String(b.IdLancamentoRM)))
      .map(b => {
        const dfv = dfvMap[String(b.IdLancamentoRM)] || {};
        return { ...b, nd: dfv.nd || null, documento: dfv.documento || null, nome_beneficiario: dfv.nome_beneficiario || null, nome_cobranca: dfv.nome_cobranca || null, numero_processo: dfv.numero_processo || null, forma_pag: dfv.forma_pag || null, data_vencimento: dfv.data_vencimento || null, valor_nf: dfv.valor_nf || null, moeda: dfv.moeda || null, _modal: dfv.modal || null };
      })
      .filter(b => b._modal !== 'ADM')
      .map(({ _modal, ...rest }) => rest);

    res.json({ success: true, data: baixas, count: baixas.length });
  } catch (err) {
    console.error('[GET /api/fin/baixas/historico]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/datas-antigas — get_datas_emissao_vencimento_antigas
app.get('/api/fin/vouchers/datas-antigas', async (req, res) => {
  try {
    const rows = await finQuery(`
      SELECT 'VOUCHER' AS origem, dfv.nd, dfv.data_emissao, dfv.data_vencimento, dfv.data_insert
        FROM dados_dachser.t_dados_financeiro_voucher dfv
       WHERE (dfv.data_emissao IS NOT NULL AND YEAR(dfv.data_emissao) <= 2024)
          OR (dfv.data_vencimento IS NOT NULL AND YEAR(dfv.data_vencimento) <= 2024)
      UNION ALL
      SELECT 'SPO' AS origem, dfs.nd, dfs.data_emissao, dfs.data_vencimento, dfs.data_insert
        FROM dados_dachser.t_dados_financeiro_spo dfs
       WHERE (dfs.data_emissao IS NOT NULL AND YEAR(dfs.data_emissao) <= 2024)
          OR (dfs.data_vencimento IS NOT NULL AND YEAR(dfs.data_vencimento) <= 2024)
      ORDER BY data_insert DESC LIMIT 500
    `);
    res.json({ success: true, total: rows?.length || 0, rows: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/datas-antigas]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5: RM + Integração + Número SPO ──────────────────────────

// GET /api/fin/vouchers/rm-ready — check_voucher_rm_ready
app.get('/api/fin/vouchers/rm-ready', async (req, res) => {
  try {
    const { numero_spo } = req.query;
    if (!numero_spo || !String(numero_spo).trim()) {
      return res.json({ ready: false, found: false, missingFields: ['numero_spo'] });
    }
    const ndRaw = String(numero_spo).trim();
    const rows = await finQuery(`
      SELECT documento, nd, numero_nf, numero_processo, modal, tipo_pag,
             forma_pag, data_emissao, data_vencimento, valor_nf, cnpj, razao_social
      FROM dados_dachser.t_dados_financeiro_voucher
      WHERE SUBSTRING_INDEX(TRIM(nd), ' ', 1) COLLATE utf8mb4_unicode_ci
          = SUBSTRING_INDEX(TRIM(?), ' ', 1) COLLATE utf8mb4_unicode_ci
      LIMIT 1
    `, [ndRaw]);
    if (!rows || rows.length === 0) {
      return res.json({ ready: false, found: false, isManual: true, missingFields: ['registro inexistente em t_dados_financeiro_voucher'] });
    }
    const row = rows[0];
    const required = ['documento','nd','numero_nf','numero_processo','modal','tipo_pag','forma_pag','data_emissao','data_vencimento','valor_nf','cnpj','razao_social'];
    const informational = [];
    for (const f of required) {
      const v = row[f];
      if (v === null || v === undefined) { informational.push(f); continue; }
      if (typeof v === 'string' && v.trim() === '') { informational.push(f); continue; }
      if (f === 'valor_nf' && (Number(v) === 0 || Number.isNaN(Number(v)))) { informational.push(f); continue; }
    }
    res.json({ ready: true, found: true, isManual: false, missingFields: [], informationalEmptyFields: informational });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/rm-ready]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/dados-rm — insert_dados_rm
app.post('/api/fin/vouchers/dados-rm', async (req, res) => {
  try {
    const { id_rm, numero_spo, voucher_boleto, chave_pix, pix_tipo_chave, forma_pag, fornecedor, cnpj_fornecedor, tipo_exec } = req.body || {};
    const finalIdRm = (id_rm && String(id_rm).trim()) ? id_rm : (numero_spo || 'DESCONHECIDO');

    let regrasFormaPagFinal = 'DOC (Compe)';
    const isBoletoPag = forma_pag && String(forma_pag).toUpperCase().includes('BOL');
    if (isBoletoPag) {
      regrasFormaPagFinal = 'Boleto';
    } else if (cnpj_fornecedor) {
      try {
        const dadosBancarios = await finQuery(
          `SELECT banco FROM dados_dachser.t_dados_financeiro_pag
           WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ? LIMIT 1`,
          [String(cnpj_fornecedor).replace(/\D/g, '')]
        );
        if (dadosBancarios && dadosBancarios.length > 0) {
          const bancoUpper = (dadosBancarios[0].banco || '').toUpperCase();
          if (bancoUpper.includes('ITAU') || bancoUpper.includes('ITAÚ') || bancoUpper.includes('341')) {
            regrasFormaPagFinal = 'Crédito em Conta Corrente da Mesma Titularidade';
          }
        }
      } catch (_) {}
    }

    let voucherBoletoFinal = (voucher_boleto && String(voucher_boleto).trim()) ? voucher_boleto : null;
    let chavePixFinal = (chave_pix && String(chave_pix).trim()) ? chave_pix : null;
    const needsBoletoLookup = !voucherBoletoFinal && isBoletoPag;
    const needsPixLookup = !chavePixFinal && forma_pag && String(forma_pag).toUpperCase().includes('PIX');
    if (needsBoletoLookup || needsPixLookup) {
      try {
        const lookupRows = await finQuery(
          `SELECT linha_digitavel, codigo_barras, chave_pix FROM dados_dachser.t_vouchers
           WHERE (id_rm COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
               OR numero_spo COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci)
           ORDER BY created_at DESC LIMIT 1`,
          [finalIdRm, numero_spo || finalIdRm]
        );
        if (lookupRows && lookupRows.length > 0) {
          const dbRow = lookupRows[0];
          if (needsBoletoLookup) voucherBoletoFinal = dbRow.linha_digitavel || dbRow.codigo_barras || null;
          if (needsPixLookup && dbRow.chave_pix) chavePixFinal = dbRow.chave_pix;
        }
      } catch (_) {}
    }

    await finQuery(
      `INSERT INTO dados_dachser.t_dados_rm
       (id_rm, nd, nf_disputa, voucher_boleto, chave_pix, pix_tipo_chave, forma_pag, fornecedor, regras_forma_pag, tipo_exec)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [finalIdRm, numero_spo || null, voucherBoletoFinal, chavePixFinal, pix_tipo_chave || null,
       forma_pag || null, fornecedor || null, regrasFormaPagFinal, tipo_exec || 'A_DEFINIR']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/dados-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/status-integracao-rm — update_status_integracao_rm
app.patch('/api/fin/vouchers/:id/status-integracao-rm', async (req, res) => {
  try {
    const { id } = req.params;
    const { status_integracao_rm } = req.body || {};
    if (!status_integracao_rm) return res.status(400).json({ success: false, error: 'status_integracao_rm é obrigatório' });
    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET status_integracao_rm = ?, updated_at = NOW() WHERE id = ?`,
      [status_integracao_rm, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/status-integracao-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/numero-spo — update_voucher_numero_spo
app.patch('/api/fin/vouchers/:id/numero-spo', async (req, res) => {
  try {
    const { id } = req.params;
    const { novo_numero_spo, user_id, user_name } = req.body || {};
    if (!novo_numero_spo) return res.status(400).json({ success: false, error: 'novo_numero_spo é obrigatório' });
    const oldRows = await finQuery(`SELECT numero_spo FROM dados_dachser.t_vouchers WHERE id = ?`, [id]);
    const oldNumero = oldRows?.[0]?.numero_spo || 'N/A';
    await finQuery(`UPDATE dados_dachser.t_vouchers SET numero_spo = ?, updated_at = NOW() WHERE id = ?`, [novo_numero_spo, id]);
    try {
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (UUID(), ?, ?, ?, 'NUMERO_SPO_ALTERADO', ?, NOW())`,
        [id, user_id || null, user_name || 'Sistema', `Número SPO alterado de ${oldNumero} para ${novo_numero_spo}`]
      );
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/numero-spo]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Express error handler — ensures JSON even for unhandled errors
app.use((err, req, res, _next) => {
  const msg = err?.message || String(err) || 'Internal error';
  console.error('[express]', msg);
  if (!res.headersSent) res.status(500).json({ success: false, error: msg });
});

app.listen(PORT, async () => {
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}\n`);

  // Valida conexão de cada fase configurada no .env
  const checks = [
    { phase: 'air',  label: 'Air (dados_dachser)',    hostKey: 'MARIADB_AIR_HOST',  userKey: 'MARIADB_AIR_USER',  dbKey: 'MARIADB_AIR_DATABASE'  },
    { phase: 'auth', label: 'Auth (dados_dachser)',   hostKey: 'MARIADB_AUTH_HOST', userKey: 'MARIADB_AUTH_USER', dbKey: 'MARIADB_AUTH_DATABASE' },
    { phase: 'sea',  label: 'Sea (dados_dachser)',    hostKey: 'MARIADB_SEA_HOST',  userKey: 'MARIADB_SEA_USER',  dbKey: 'MARIADB_SEA_DATABASE'  },
    { phase: 'fin',  label: 'Fin/Esteira (dados_dachser)', hostKey: 'MARIADB_FIN_HOST', userKey: 'MARIADB_FIN_USER', dbKey: 'MARIADB_FIN_DATABASE' },
  ];

  for (const { phase, label, hostKey, userKey, dbKey } of checks) {
    const host = process.env[hostKey] || process.env.DB_HOST;
    const user = process.env[userKey] || process.env.DB_USER;
    const database = process.env[dbKey] || process.env.DB_NAME;
    if (!host || !database) {
      console.warn(`⚠️  [${label}] Variáveis ${hostKey} / ${dbKey} não definidas — fase não disponível.`);
      continue;
    }
    try {
      const db = getPoolFor(phase);
      const conn = await db.getConnection();
      conn.release();
      console.log(`✅ [${label}] ${user}@${host}/${database}`);
    } catch (err) {
      console.error(`❌ [${label}] Falha: ${err.message}`);
    }
  }

  console.log('');
});
