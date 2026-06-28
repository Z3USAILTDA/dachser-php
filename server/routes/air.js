/**
 * server/routes/air.js
 * Rotas do módulo AIR: /api/air/*, /api/cct/*, /api/parsers/*
 * Pool: MARIADB_AIR_* — database padrão: dados_dachser
 */
import { getPoolFor, queryWithRetry } from '../db/pools.js';

// ─── Constantes ───────────────────────────────────────────────────────────────
const AIR_DB    = process.env.MARIADB_AIR_DATABASE || process.env.DB_NAME || 'dados_dachser';
const ETD_CUTOFF = process.env.AIR_ETD_CUTOFF || '2026-06-01';

const CHECK_TABLE    = 'dados_dachser.t_awb_check';
const PARSED_TABLE   = 'dados_dachser.t_awb_parsed';
const DOCUMENT_TABLE = 'dados_dachser.t_awb_document';
const LOG_TABLE      = 'dados_dachser.t_awb_check_log';
const MATRIX_TABLE   = 'dados_dachser.t_awb_rule_matrix';
const RULE_TABLE     = 'dados_dachser.t_awb_rule_row';

const getPool      = () => getPoolFor('air');
const getCheckPool = () => getPoolFor('air');
const finQuery     = (sql, params = []) => queryWithRetry(sql, params, 1, 'fin');

// ─── Caches in-memory ─────────────────────────────────────────────────────────
let discrepancyCache     = null;
let routeCache           = null;
let trackingResultCache  = null; // cache de resultado completo de computeTrackingData
let trackingInflight     = null; // deduplicação: evita computações paralelas
const CACHE_TTL              = 60_000;
const TRACKING_RESULT_TTL    = 25_000; // 25s — ligeiramente abaixo do polling (30s) do frontend

// ─── IATA helpers ─────────────────────────────────────────────────────────────
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

// ─── Core: computeTrackingData ────────────────────────────────────────────────
async function computeTrackingData() {
  // Serve do cache se ainda estiver dentro do TTL
  if (trackingResultCache && (Date.now() - trackingResultCache.at) < TRACKING_RESULT_TTL) {
    return trackingResultCache.data;
  }
  // Deduplicação: se já existe uma computação em andamento, aguarda a mesma promise
  if (trackingInflight) return trackingInflight;

  async function doCompute() {
  const normalizeDesc = s => (s || '').toUpperCase().trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

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

  let visibilityMap = {};
  try {
    const visRows = await queryWithRetry(`SELECT awb, hawb, hide_reason FROM dados_dachser.t_air_process_visibility`);
    for (const v of visRows || []) { visibilityMap[`${v.awb||''}|${v.hawb||''}`] = v.hide_reason || ''; }
  } catch {}

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
    queryWithRetry(routeSql).then(routeRows => {
      const fresh = {};
      for (const rr of routeRows || []) {
        fresh[`${rr.AWB||''}|${rr.HAWB||''}`] = { origin: rr.ORIGEM_FINAL||null, destination: rr.DESTINO_FINAL||null, conexoes: rr.CONEXOES||null, status: rr.STATUS_ROTA||'' };
      }
      routeCache = { at: Date.now(), data: fresh };
      console.log(`[ROUTE-BG] Cache refreshed: ${Object.keys(fresh).length} records`);
    }).catch(err => console.warn('[ROUTE-BG] Failed:', err.message));
  }

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
    'NIL','NIF','DIS','OFD','OFL','BUP','RDP','LAT','TKG','SCR','ECC',
    'TFD','TRM','RFC','DMG','RET','AWB','PRE','DEP','ARR','RCF','RCS',
    'MAN','NFD','DLV','POD','BKD','BKG','BKF','FOH','AWD','CCD','ASN',
    'MOV','OFLD','FWB','DOC','AWR','TDE','LOF','TFS','MIS','BCBP','UNK',
    'TRA','PRD','RCP','CAN','LRC','FSH','FSU',
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

  const result = { success: true, data, failed_count: failed.length };
  trackingResultCache = { at: Date.now(), data: result };
  return result;
  } // fim doCompute

  trackingInflight = doCompute().finally(() => { trackingInflight = null; });
  return trackingInflight;
}

// ─── Handler functions ─────────────────────────────────────────────────────────

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

async function handleFailedAlert(req, res) {
  const awbs = Array.isArray(req.body?.awbs) ? req.body.awbs : [];
  console.log(`[tracking-aereo] failed-alert: ${awbs.length} AWB(s) com falha de rastreio`);
  res.json({ success: true, count: awbs.length, emailed: false });
}

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

// ─── Parser helpers ────────────────────────────────────────────────────────────

async function parseAnthropicPdfJson({ fileBase64, prompt, logName }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.PARSER_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 16000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) throw new Error('Limite de requisições excedido. Tente novamente em alguns minutos.');
    throw new Error(`${logName} Anthropic API error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.content?.[0]?.text || '';
  if (!content) throw new Error('Resposta vazia da IA');
  const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
}

async function parseGeminiPdfJson({ fileBase64, mimeType = 'application/pdf', systemPrompt, userPrompt, logName }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada');

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.PARSER_GEMINI_MODEL || 'gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          ],
        },
      ],
      max_tokens: 16000,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) throw new Error('Limite de requisições excedido. Tente novamente em alguns minutos.');
    throw new Error(`${logName} Gemini API error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || '';
  const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Não foi possível extrair JSON da resposta da IA');
  return JSON.parse(jsonMatch[0]);
}

const HAWB_CADASTRO_PROMPT = `You are an expert at extracting data from HAWB (House Air Waybill) documents.
Extract ALL fields from this HAWB PDF and return a JSON object. If a field is not found, use null.

CRITICAL MAWB RULES:
1. Try labeled MAWB fields: "MAWB", "Master AWB", "Air Waybill No", "Accounting Information".
2. Also inspect the top header triple pattern: 3-digit airline prefix + 3-letter airport code + 7-8 digit number. Example "001 | MAD | 2208 4156" means awb_number = "001-22084156".
3. awb_number is the MASTER airway bill number (XXX-XXXXXXXX). hawb_number is the HOUSE number.

Return ONLY valid JSON with:
{
  "awb_number": null,
  "hawb_number": null,
  "airport_departure": null,
  "shipper_name": null,
  "shipper_address": null,
  "shipper_account": null,
  "issuing_agent": null,
  "agent_city": null,
  "agent_iata_code": null,
  "agent_account": null,
  "nie_code": null,
  "nif_code": null,
  "routing_destination": null,
  "currency": null,
  "chgs_wt_val": null,
  "declared_value_carriage": null,
  "declared_value_customs": null,
  "handling_references": null,
  "handling_info": null,
  "pieces": null,
  "gross_weight_kg": null,
  "rate_class": null,
  "chargeable_weight": null,
  "rate": null,
  "total_charge": null,
  "nature_of_goods": null,
  "itn_number": null,
  "packaging": null,
  "hs_code": null,
  "volume_cbm": null,
  "dimensions": null,
  "other_charges_agent": null,
  "other_charges_carrier": null,
  "signature_name": null,
  "signature_date": null,
  "signature_place": null,
  "total_prepaid": null,
  "total_collect": null,
  "consignee_name": null,
  "consignee_address": null,
  "consignee_cnpj": null
}`;

const BL_CADASTRO_PROMPT = `You are an expert at extracting data from Bill of Lading (BL) documents for maritime/ocean freight.
Extract ALL fields from this BL PDF and return a JSON object. If a field is not found, use null.

Return ONLY valid JSON with:
{
  "bl_number": null,
  "shipper_name": null,
  "shipper_address": null,
  "consignee_name": null,
  "consignee_address": null,
  "consignee_cnpj": null,
  "notify_party": null,
  "delivery_agent": null,
  "port_loading": null,
  "port_discharge": null,
  "vessel_voyage": null,
  "place_receipt": null,
  "place_delivery": null,
  "container_numbers": null,
  "seal_numbers": null,
  "marks_numbers": null,
  "nature_of_goods": null,
  "hs_code": null,
  "gross_weight_kg": null,
  "volume_cbm": null,
  "pieces": null,
  "packaging": null,
  "freight_charges": null,
  "freight_payment": null,
  "service_type": null,
  "total_prepaid": null,
  "total_collect": null,
  "num_original_bls": null,
  "shipped_on_board_date": null,
  "place_date_issue": null,
  "issued_by": null
}`;

function finParseComprovanteFromFilename(fileName = '') {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  const collect = (text) => Array.from(new Set((text.match(/(?<![0-9])(\d{5,13})(?![0-9])/g) || [])));
  const spoScores = new Map();
  const ndScores = new Map();
  const add = (map, value, score) => {
    if (!value) return;
    const v = String(value).trim();
    if (!/^\d+$/.test(v) && !/^\d{2,4}-\d{4,13}$/.test(v)) return;
    map.set(v, Math.max(map.get(v) || 0, score));
  };

  for (const c of collect(nameWithoutExt)) {
    add(spoScores, c, 20);
    add(ndScores, c, 20);
  }
  for (const m of fileName.matchAll(/(\d{3})-(\d{6})[A-Z]\d{8}\.\d{1,3}/gi)) {
    add(spoScores, `${m[1]}-${m[2]}`, 102);
    add(spoScores, m[2], 100);
  }
  for (const m of fileName.matchAll(/(\d{3})-(\d{5,7})(?:\.|$|[^0-9])/g)) {
    add(spoScores, `${m[1]}-${m[2]}`, 97);
    add(spoScores, m[2], 95);
  }
  for (const m of fileName.matchAll(/(?:OT\s*)?(\d{3})-(\d{10,13})/gi)) {
    add(ndScores, m[2], 90);
  }
  for (const m of nameWithoutExt.matchAll(/(?<![0-9])(20\d{8,11})(?![0-9])/g)) {
    add(ndScores, m[1], 55);
  }
  for (const m of nameWithoutExt.matchAll(/(?<![0-9])(\d{6,7})(?![0-9])/g)) {
    add(spoScores, m[1], 60);
    add(ndScores, m[1], 60);
  }

  const sortedSPO = [...spoScores.entries()].sort((a, b) => b[1] - a[1]);
  const sortedND  = [...ndScores.entries()].sort((a, b) => b[1] - a[1]);
  return {
    numeroSPO: sortedSPO[0]?.[0] || null,
    numeroND: sortedND[0]?.[0] || null,
    linhaDigitavel: null,
    valor: null,
    fornecedor: null,
    dataVencimento: null,
    confidence: Math.min(0.99, Math.max(sortedSPO[0]?.[1] || 0, sortedND[0]?.[1] || 0) / 110),
    source: 'filename',
    candidatosSPO: sortedSPO.map(([v]) => v),
    candidatosND: sortedND.map(([v]) => v),
  };
}

function formatLinhaDigitavelFin(clean) {
  if (clean.length === 47) {
    return `${clean.slice(0, 5)}.${clean.slice(5, 10)} ${clean.slice(10, 15)}.${clean.slice(15, 21)} ${clean.slice(21, 26)}.${clean.slice(26, 32)} ${clean.slice(32, 33)} ${clean.slice(33)}`;
  }
  if (clean.length === 48) {
    return `${clean.slice(0, 11)}-${clean.slice(11, 12)} ${clean.slice(12, 23)}-${clean.slice(23, 24)} ${clean.slice(24, 35)}-${clean.slice(35, 36)} ${clean.slice(36, 47)}-${clean.slice(47)}`;
  }
  return clean;
}

async function finExtractBoletoWithAnthropic({ base64, mediaType }) {
  const key = process.env.ANTHROPIC_FINANCEIRO_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_FINANCEIRO_API_KEY/ANTHROPIC_API_KEY não configurada');
  const prompt = `Analise este documento e extraia a LINHA DIGITÁVEL do boleto ou arrecadação.

Formatos possíveis:
- Boleto bancário: 47 dígitos.
- Arrecadação/convênio/DAI/DARF: 48 dígitos, geralmente começa com 8.

Retorne exatamente:
TIPO: BANCARIO ou ARRECADACAO
FORMATADA: <linha formatada>
LIMPA: <somente dígitos, 47 ou 48>

Se não encontrar nenhum código, responda apenas: NAO_ENCONTRADO`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.FIN_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: mediaType || 'application/pdf', data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic boleto error ${response.status}: ${errorText.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  if (/NAO_ENCONTRADO/i.test(text)) return null;
  const limpa = text.match(/LIMPA:\s*(\d+)/i)?.[1] || text.replace(/\D/g, '');
  const clean = limpa.length > 48 ? limpa.slice(0, limpa[0] === '8' ? 48 : 47) : limpa;
  if (clean.length !== 47 && clean.length !== 48) throw new Error(`Linha digitável com tamanho inválido (${clean.length} dígitos)`);
  return {
    tipo: clean.length === 48 || clean[0] === '8' ? 'ARRECADACAO' : 'BANCARIO',
    linhaDigitavel: clean,
    linhaDigitavelFormatada: formatLinhaDigitavelFin(clean),
    rawResponse: text,
  };
}

// ─── Registro de rotas ─────────────────────────────────────────────────────────
export function registerAirRoutes(app, { resend } = {}) {

  // ── CHECK AWB ──────────────────────────────────────────────────────────────

  // GET /api/air/check-awb
  app.get('/api/air/check-awb', async (req, res) => {
    try {
      const db = getCheckPool();
      const [rows] = await db.query(`
        SELECT
          c.*,
          p.extracted_awb, p.extracted_cnpj, p.extracted_origin, p.extracted_destination,
          p.extracted_customer, p.confidence_score, p.shipper, p.consignee, p.carrier,
          p.gross_weight_kg, p.chargeable_weight_kg, p.mrn, p.routing_legs,
          p.flight_numbers, p.hs_codes, p.dims, p.incoterms, p.\`references\`,
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

  // POST /api/air/check-awb/upload
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

  // GET /api/air/check-awb/document/:id
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

  // POST /api/air/check-awb/parse — extrai dados via Claude
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
          model: process.env.PARSER_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
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

  // POST /api/air/check-awb — cria validação
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
            hs_codes, dims, incoterms, \`references\`)
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

  // PATCH /api/air/check-awb/:id/parsed
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
               \`references\`=?, extracted_awb=?, extracted_cnpj=?, extracted_origin=?,
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

  // GET /api/air/check-awb/matrices
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

  // GET /api/air/check-awb/rules
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

  // GET /api/air/check-awb/matrices/active
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

  // POST /api/air/check-awb/rules
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

  // DELETE /api/air/check-awb/rules/:id
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

  // ── AIR stats / status ──────────────────────────────────────────────────────

  // GET /api/air/stats
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

  // GET /api/air/status-aereo
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

  // GET /api/air/awb-list
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

  // GET /api/air/timeline/:awb
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
        } catch (_) {}
      }

      const invalidStatuses = new Set(['', 'N/A', 'NOT_FOUND', 'ERRO', 'UNK']);
      const wsStatus = (wsRecord.last_status_code || '').trim().toUpperCase();
      const needsFallback = timelineData.length === 0
        || isErrorEvent(wsRecord.timeline_json ? String(wsRecord.timeline_json) : null)
        || invalidStatuses.has(wsStatus)
        || !wsRecord.last_status_code;

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
      } catch (_) {}

      if (needsFallback && timelineData.length > 0 && apiTimelineRaw.length > 0) {
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

      const IATA_WEIGHT_TL = { POD:44,DLV:43,NFD:42,RCF:41,AWD:40,ARR:39,TRM:38,TFD:37,DEP:36,MAN:35,RCS:34,FOH:33,BKD:32,AWR:40,CCD:40,FWB:4,RCT:11,PRE:20,DIS:30,OFLD:28 };
      if (validEvents.length >= 2) {
        const topN = Math.min(4, validEvents.length);
        const topWithDate = validEvents.slice(0, topN).map((ev, idx) => ({
          ev, idx, dateMs: ev.data_hora_evento ? new Date(ev.data_hora_evento).getTime() : 0,
        }));
        const latestDateMs = Math.max(...topWithDate.map(({ dateMs }) => isNaN(dateMs) ? 0 : dateMs));
        if (latestDateMs > 0) {
          const bestGroup = topWithDate.filter(({ dateMs }) => !isNaN(dateMs) && dateMs === latestDateMs);
          let bestIdx = bestGroup[0].idx;
          let bestW   = IATA_WEIGHT_TL[(bestGroup[0].ev.codigo_evento || '').toUpperCase()] || 0;
          for (let i = 1; i < bestGroup.length; i++) {
            const w = IATA_WEIGHT_TL[(bestGroup[i].ev.codigo_evento || '').toUpperCase()] || 0;
            if (w > bestW || (w === bestW && bestGroup[i].idx < bestIdx)) { bestW = w; bestIdx = bestGroup[i].idx; }
          }
          if (bestIdx > 0) { const [winner] = validEvents.splice(bestIdx, 1); validEvents.unshift(winner); }
        }
      }

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
      } catch (_) {}

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
      } catch (_) {}

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

  // ── Email regras ───────────────────────────────────────────────────────────

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

  // ── CCT routes ─────────────────────────────────────────────────────────────

  // GET /api/cct/profiles
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

  // ── Parsers ────────────────────────────────────────────────────────────────

  // POST /api/parsers/hawb-cadastro
  app.post('/api/parsers/hawb-cadastro', async (req, res) => {
    const startTime = Date.now();
    try {
      const { fileBase64 } = req.body || {};
      if (!fileBase64) return res.status(400).json({ error: 'fileBase64 é obrigatório' });
      const data = await parseAnthropicPdfJson({ fileBase64, prompt: HAWB_CADASTRO_PROMPT, logName: 'parse-hawb-cadastro' });
      res.json({ success: true, data, processingTimeMs: Date.now() - startTime });
    } catch (err) {
      console.error('[api/parsers/hawb-cadastro]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/parsers/bl-cadastro
  app.post('/api/parsers/bl-cadastro', async (req, res) => {
    const startTime = Date.now();
    try {
      const { fileBase64 } = req.body || {};
      if (!fileBase64) return res.status(400).json({ error: 'fileBase64 é obrigatório' });
      const data = await parseAnthropicPdfJson({ fileBase64, prompt: BL_CADASTRO_PROMPT, logName: 'parse-bl-cadastro' });
      res.json({ success: true, data, processingTimeMs: Date.now() - startTime });
    } catch (err) {
      console.error('[api/parsers/bl-cadastro]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/parsers/manifest-swap
  app.post('/api/parsers/manifest-swap', async (req, res) => {
    const startTime = Date.now();
    try {
      const { fileBase64, mimeType } = req.body || {};
      if (!fileBase64) return res.status(400).json({ error: 'fileBase64 é obrigatório' });

      const systemPrompt = `You are a specialist in parsing DACHSER air cargo manifest PDFs.
Extract the MAWB and all HAWB entries. Return ONLY valid JSON with:
{
  "mawb": "XXX-XXXXXXXX",
  "hawbs": [
    {
      "hawb_number": "string",
      "shipper": "string",
      "consignee": "string",
      "cnpj": "string or null",
      "dep_des": "string or null",
      "pieces": number or null,
      "weight": number or null
    }
  ]
}`;
      const data = await parseGeminiPdfJson({
        fileBase64,
        mimeType: mimeType || 'application/pdf',
        systemPrompt,
        userPrompt: 'Parse this DACHSER manifest PDF and extract the MAWB and all HAWBs with their details.',
        logName: 'parse-manifest-swap',
      });
      res.json({ success: true, data, processingTimeMs: Date.now() - startTime });
    } catch (err) {
      console.error('[api/parsers/manifest-swap]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/parsers/comprovante-pdf
  app.post('/api/parsers/comprovante-pdf', async (req, res) => {
    try {
      const { fileName } = req.body || {};
      if (!fileName) return res.status(400).json({ error: 'fileName é obrigatório' });
      res.json({ success: true, data: finParseComprovanteFromFilename(fileName) });
    } catch (err) {
      console.error('[api/parsers/comprovante-pdf]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/parsers/boleto-barcode
  app.post('/api/parsers/boleto-barcode', async (req, res) => {
    try {
      const { fileUrl, base64, mediaType } = req.body || {};
      let fileBase64 = base64 || null;
      let effectiveMediaType = mediaType || 'application/pdf';
      if (!fileBase64 && fileUrl) {
        // Se é um path interno de anexo, lê o BLOB direto do banco (funciona em qualquer ambiente)
        const internalMatch = typeof fileUrl === 'string' && fileUrl.match(/\/api\/fin\/vouchers\/anexos\/([^/]+)\/download/);
        if (internalMatch) {
          const anexoId = internalMatch[1];
          const rows = await finQuery(
            `SELECT file_content, mime_type FROM dados_dachser.t_voucher_anexos WHERE id = ? LIMIT 1`,
            [anexoId]
          );
          if (!rows?.length || !rows[0].file_content) {
            return res.status(404).json({ success: false, error: 'Anexo não encontrado no banco' });
          }
          fileBase64 = Buffer.isBuffer(rows[0].file_content)
            ? rows[0].file_content.toString('base64')
            : Buffer.from(rows[0].file_content).toString('base64');
          effectiveMediaType = rows[0].mime_type || effectiveMediaType;
        } else {
          const fileResponse = await fetch(fileUrl);
          if (!fileResponse.ok) return res.status(400).json({ success: false, error: 'Failed to fetch file from URL' });
          fileBase64 = Buffer.from(await fileResponse.arrayBuffer()).toString('base64');
          effectiveMediaType = fileResponse.headers.get('content-type')?.split(';')[0]?.trim() || effectiveMediaType;
        }
      }
      if (!fileBase64) return res.status(400).json({ success: false, error: 'No file data provided' });
      const result = await finExtractBoletoWithAnthropic({ base64: fileBase64, mediaType: effectiveMediaType });
      if (!result) return res.json({ success: false, error: 'Linha digitável não encontrada no documento' });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[api/parsers/boleto-barcode]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Tracking + handlers ────────────────────────────────────────────────────

  app.get('/tracking-aereo', handleTrackingAereo);                    // compat legado
  app.get('/api/air/tracking-aereo', handleTrackingAereo);
  app.get('/api/air/tracking-aereo/filters', handleFilters);
  app.get('/api/air/tracking-aereo/summary', handleSummary);
  app.post('/api/air/tracking-aereo/failed-alert', handleFailedAlert);
  app.post('/api/air/master-swaps', handleMasterSwaps);
  app.get('/api/air/master-discrepancies', handleDiscrepancyList);
  app.post('/api/air/master-discrepancies/resolve', handleDiscrepancyResolve);
  app.post('/api/air/usage-log', handleUsageLog);
  app.post('/api/usage-log', handleUsageLog);                         // compat genérico

  // ── Olimpo proxy ───────────────────────────────────────────────────────────

  // POST /api/air/olimpo/force-swap-log
  app.post('/api/air/olimpo/force-swap-log', async (req, res) => {
    try {
      const { awb, old_mawb, hawb_number = null, swapped_by = null } = req.body || {};
      if (!awb || !old_mawb) return res.status(400).json({ error: 'awb e old_mawb são obrigatórios' });
      await finQuery(
        `INSERT INTO dados_dachser.t_master_swap_log (hawb_number, old_mawb, new_mawb, swapped_by) VALUES (?, ?, ?, ?)`,
        [hawb_number, old_mawb, awb, swapped_by]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/air/olimpo/force-swap-log]', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}


