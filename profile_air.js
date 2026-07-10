import 'dotenv/config';
import { getPoolFor, queryWithRetry } from './server/db/pools.js';

const ETD_CUTOFF = process.env.AIR_ETD_CUTOFF || '2026-06-01';

async function profile() {
  console.time('Total');
  
  console.time('Main Query');
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
          on tdaf.awb = tda.awb_number
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
  console.timeEnd('Main Query');
  console.log(`Main query returned ${rows?.length || 0} rows`);

  console.time('Discrepancy Query');
  const activeAwbs = [...new Set((rows||[]).map(r => (r.AWB||'').toString().trim()).filter(a => a.length > 0))];
  const awbInClause = activeAwbs.length > 0 ? activeAwbs.map(a=>`'${a.replace(/'/g,"''")}'`).join(',') : "'0'";
  const discSql = `
    WITH base_disc AS (
      SELECT tdaf.awb, tdaf.timeline_json
      FROM dados_dachser.t_fato_aereo tdaf
      WHERE tdaf.awb IN (${awbInClause}) AND tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json)
    ),
    eventos_disc AS (
      SELECT b.awb, jt.ordem, jt.description,
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
      SELECT awb, pieces_extraidas AS baseline_pecas FROM (SELECT e.*, ROW_NUMBER() OVER(PARTITION BY e.awb ORDER BY e.ordem) AS rn FROM eventos_disc e WHERE e.pieces_extraidas IS NOT NULL AND e.pieces_extraidas>0) x WHERE x.rn=1
    ),
    ultimo_evento_absoluto AS (
      SELECT awb, is_dis_event AS ultimo_is_dis_event FROM (SELECT e.*, ROW_NUMBER() OVER(PARTITION BY e.awb ORDER BY e.ordem DESC) AS rn FROM eventos_disc e) x WHERE x.rn=1
    ),
    eventos_validos_pecas AS (
      SELECT e.awb, e.ordem, e.pieces_extraidas, ROW_NUMBER() OVER(PARTITION BY e.awb ORDER BY e.ordem DESC) AS rn_desc, SUM(e.pieces_extraidas) OVER(PARTITION BY e.awb ORDER BY e.ordem DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS soma_pecas_desc
      FROM eventos_disc e WHERE e.pieces_extraidas IS NOT NULL AND e.pieces_extraidas>0
    ),
    ultimo_evento_pecas AS (SELECT awb, pieces_extraidas AS ultimo_evento_pecas FROM eventos_validos_pecas WHERE rn_desc=1),
    normalizado_por_soma_final AS (SELECT v.awb, MAX(CASE WHEN bp.baseline_pecas IS NOT NULL AND v.rn_desc>=2 AND v.soma_pecas_desc=bp.baseline_pecas THEN 1 ELSE 0 END) AS normalizado_soma_final FROM eventos_validos_pecas v LEFT JOIN baseline_pieces bp ON bp.awb=v.awb GROUP BY v.awb),
    agregado_disc AS (SELECT ev.awb, MIN(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas>0 THEN ev.pieces_extraidas END) AS min_pieces, MAX(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas>0 THEN ev.pieces_extraidas END) AS max_pieces FROM eventos_disc ev GROUP BY ev.awb),
    final_classificacao AS (
      SELECT a.awb, bp.baseline_pecas, up.ultimo_evento_pecas,
        CASE WHEN bp.baseline_pecas IS NOT NULL AND a.min_pieces IS NOT NULL AND a.max_pieces IS NOT NULL AND a.min_pieces<>a.max_pieces AND NOT(up.ultimo_evento_pecas IS NOT NULL AND up.ultimo_evento_pecas=bp.baseline_pecas) AND COALESCE(ns.normalizado_soma_final,0)=0 THEN 1 ELSE 0 END AS pieces_discrepancy,
        CASE WHEN ua.ultimo_is_dis_event=1 THEN 1 ELSE 0 END AS has_dis_event,
        CASE WHEN ua.ultimo_is_dis_event=1 THEN 'DIS_ULTIMO_EVENTO' WHEN bp.baseline_pecas IS NOT NULL AND a.min_pieces IS NOT NULL AND a.max_pieces IS NOT NULL AND a.min_pieces<>a.max_pieces AND NOT(up.ultimo_evento_pecas IS NOT NULL AND up.ultimo_evento_pecas=bp.baseline_pecas) AND COALESCE(ns.normalizado_soma_final,0)=0 THEN 'DISCREPANCIA_REAL' ELSE 'SEM_DISCREPANCIA' END AS status_final
      FROM agregado_disc a LEFT JOIN baseline_pieces bp ON bp.awb=a.awb LEFT JOIN ultimo_evento_pecas up ON up.awb=a.awb LEFT JOIN ultimo_evento_absoluto ua ON ua.awb=a.awb LEFT JOIN normalizado_por_soma_final ns ON ns.awb=a.awb
    )
    SELECT DISTINCT tda.awb_number AS AWB, tda.hawb_number AS HAWB, fc.baseline_pecas AS BASELINE_PECAS, fc.ultimo_evento_pecas AS ULTIMO_EVENTO_PECAS, fc.pieces_discrepancy AS PIECES_DISCREPANCY, fc.has_dis_event AS HAS_DIS_EVENT, fc.status_final AS STATUS_FINAL
    FROM final_classificacao fc
    INNER JOIN dados_dachser.t_dados_aereo tda ON tda.awb_number = fc.awb
    INNER JOIN dados_dachser.t_fato_aereo tdaf ON tdaf.awb = fc.awb
    WHERE fc.status_final IN ('DIS_ULTIMO_EVENTO','DISCREPANCIA_REAL') 
      AND tda.etd >= '${ETD_CUTOFF}'
      AND JSON_VALID(tdaf.hawbs_json)
      AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
  `;
  const discRows = await queryWithRetry(discSql);
  console.timeEnd('Discrepancy Query');
  console.log(`Discrepancy query returned ${discRows?.length || 0} rows`);

  console.timeEnd('Total');
  process.exit(0);
}

profile().catch(console.error);
