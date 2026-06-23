import mysql from 'mysql2/promise';

const DB = process.env.MARIADB_OLIMPO_DATABASE || process.env.MARIADB_AIR_DATABASE || process.env.MARIADB_OPS_DATABASE || process.env.DB_NAME || 'dados_dachser';
const ERROR_MESSAGE = 'Não foi possível carregar os dados do Olimpo no momento. Tente novamente.';

const pools = new Map();

function getPoolFor(phase = 'olimpo') {
  if (!pools.has(phase)) {
    const upper = phase.toUpperCase();
    pools.set(phase, mysql.createPool({
      host: process.env[`MARIADB_${upper}_HOST`] || process.env.MARIADB_AIR_HOST || process.env.MARIADB_OPS_HOST || process.env.DB_HOST,
      port: parseInt(process.env[`MARIADB_${upper}_PORT`] || process.env.MARIADB_AIR_PORT || process.env.MARIADB_OPS_PORT || process.env.DB_PORT || '3306', 10),
      database: process.env[`MARIADB_${upper}_DATABASE`] || process.env.MARIADB_AIR_DATABASE || process.env.MARIADB_OPS_DATABASE || process.env.DB_NAME,
      user: process.env[`MARIADB_${upper}_USER`] || process.env.MARIADB_AIR_USER || process.env.MARIADB_OPS_USER || process.env.DB_USER || undefined,
      password: process.env[`MARIADB_${upper}_PASSWORD`] || process.env.MARIADB_AIR_PASSWORD || process.env.MARIADB_OPS_PASSWORD || process.env.DB_PASSWORD || undefined,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 8000,
    }));
  }
  return pools.get(phase);
}

async function query(sql, params = []) {
  const [rows] = await getPoolFor('olimpo').query(sql, params);
  return rows;
}

function parsePageLimit(req) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const rawLimit = parseInt(req.query.limit || req.query.pageSize || '50', 10) || 50;
  const limit = Math.max(1, Math.min(rawLimit, 2000));
  return { page, limit, offset: (page - 1) * limit };
}

function handleError(res, label, error) {
  console.error(`[olimpo/${label}]`, error?.message || error);
  if (!res.headersSent) res.status(500).json({ success: false, error: ERROR_MESSAGE });
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

const AIRPORTS = {
  GRU: { lat: -23.4356, lon: -46.4731 }, VCP: { lat: -23.0074, lon: -47.1345 },
  GIG: { lat: -22.8099, lon: -43.2506 }, CWB: { lat: -25.5285, lon: -49.1758 },
  POA: { lat: -29.9939, lon: -51.1714 }, CNF: { lat: -19.6244, lon: -43.9719 },
  FRA: { lat: 50.0379, lon: 8.5622 }, CDG: { lat: 49.0097, lon: 2.5479 },
  AMS: { lat: 52.3105, lon: 4.7683 }, LHR: { lat: 51.4700, lon: -0.4543 },
  MAD: { lat: 40.4983, lon: -3.5676 }, MIA: { lat: 25.7959, lon: -80.2870 },
  ATL: { lat: 33.6407, lon: -84.4277 }, IAH: { lat: 29.9902, lon: -95.3368 },
  YYZ: { lat: 43.6777, lon: -79.6248 }, DOH: { lat: 25.2731, lon: 51.6081 },
  DXB: { lat: 25.2532, lon: 55.3657 }, IST: { lat: 41.2753, lon: 28.7519 },
  HKG: { lat: 22.3080, lon: 113.9185 }, SIN: { lat: 1.3644, lon: 103.9915 },
  NRT: { lat: 35.7719, lon: 140.3929 }, SCL: { lat: -33.3928, lon: -70.7858 },
  EZE: { lat: -34.8222, lon: -58.5358 }, BOG: { lat: 4.7016, lon: -74.1469 },
  PTY: { lat: 9.0714, lon: -79.3835 }, ZRH: { lat: 47.4581, lon: 8.5555 },
  VIE: { lat: 48.1103, lon: 16.5697 }, BRU: { lat: 50.9014, lon: 4.4844 },
};

const PORTS = {
  SANTOS: [-23.9618, -46.3322], SSZ: [-23.9618, -46.3322],
  PARANAGUA: [-25.5161, -48.5089], ITAJAI: [-26.9078, -48.6619],
  NAVEGANTES: [-26.8975, -48.6536], ITAPOA: [-26.1133, -48.6122],
  'RIO GRANDE': [-32.0350, -52.0986], ROTTERDAM: [51.9244, 4.4777],
  ANTWERP: [51.2602, 4.4023], ANTWERPEN: [51.2602, 4.4023],
  HAMBURG: [53.5413, 9.9836], BREMERHAVEN: [53.5396, 8.5810],
  'LE HAVRE': [49.4944, 0.1079], VALENCIA: [39.4699, -0.3763],
  BARCELONA: [41.3500, 2.1500], GENOA: [44.4056, 8.9463],
  'LA SPEZIA': [44.0950, 9.8200], FELIXSTOWE: [51.9542, 1.3464],
  LISBON: [38.7081, -9.1361], LISBOA: [38.7081, -9.1361],
  NEWYORK: [40.6840, -74.0480], 'NEW YORK': [40.6840, -74.0480],
  MIAMI: [25.7780, -80.1700], HOUSTON: [29.7300, -95.3000],
  SHANGHAI: [31.3300, 121.5000], NINGBO: [29.8683, 121.5440],
  SHENZHEN: [22.5333, 113.9333], YANTIAN: [22.5733, 114.2767],
  'HONG KONG': [22.3050, 114.1700], QINGDAO: [36.0833, 120.3167],
  TIANJIN: [38.9833, 117.7833], BUSAN: [35.1000, 129.0400],
  TOKYO: [35.6500, 139.7500], SINGAPORE: [1.2640, 103.8200],
  'PORT KLANG': [3.0000, 101.3833], 'JEBEL ALI': [25.0167, 55.0667],
  DUBAI: [25.2700, 55.3000], BUENOSAIRES: [-34.6000, -58.3667],
  'BUENOS AIRES': [-34.6000, -58.3667], MONTEVIDEO: [-34.9100, -56.2100],
  // Brasil (adicionais)
  MANAUS: [-3.1300, -60.0200], VITORIA: [-20.3200, -40.3300],
  PECEM: [-3.5500, -38.8000], SUAPE: [-8.3900, -34.9500],
  SALVADOR: [-12.9700, -38.5100], IMBITUBA: [-28.2300, -48.6500],
  ITAGUAI: [-22.9200, -43.8200], BARCARENA: [-1.5100, -48.6200],
  FORTALEZA: [-3.7200, -38.4800], VILA_DO_CONDE: [-1.5400, -48.7500],
  // Ásia
  CHATTOGRAM: [22.3000, 91.8000], CHITTAGONG: [22.3000, 91.8000],
  'NHAVA SHEVA': [18.9500, 72.9500], MUNDRA: [22.8400, 69.7000],
  COLOMBO: [6.9500, 79.8400], 'PORT QASIM': [24.7800, 67.3400],
  KARACHI: [24.8400, 66.9800], TIANJINXINGANG: [38.9800, 117.7800],
  XINGANG: [38.9800, 117.7800], KAOHSIUNG: [22.5500, 120.3000],
  HAIPHONG: [20.8600, 106.6800], 'LAEM CHABANG': [13.0800, 100.8800],
  'HO CHI MINH': [10.7600, 106.7900], 'CAT LAI': [10.7600, 106.7900],
  JEDDAH: [21.4800, 39.1800],
  // Europa (adicionais)
  ALGECIRAS: [36.1300, -5.4400], SINES: [37.9500, -8.8300],
  GDANSK: [54.4000, 18.6700], GOTHENBURG: [57.6900, 11.8400],
  'LONDON GATEWAY': [51.5100, 0.4300], TANGER: [35.8800, -5.5100],
  RAUMA: [61.1300, 21.5000], FREDERICIA: [55.5700, 9.7500],
  'GIOIA TAURO': [38.4500, 15.9000], 'PIRAEUS': [37.9400, 23.6400],
  ISKENDERUN: [36.6800, 36.2000], MERSIN: [36.8000, 34.6300],
  // Américas (adicionais)
  'LONG BEACH': [33.7500, -118.2000], 'LOS ANGELES': [33.7400, -118.2700],
  SAVANNAH: [32.0800, -81.1000], CHARLESTON: [32.7800, -79.9200],
  NORFOLK: [36.9200, -76.3300], CALLAO: [-12.0500, -77.1500],
  VERACRUZ: [19.2000, -96.1300], MANZANILLO: [19.0500, -104.3200],
  CARTAGENA: [10.4000, -75.5400], COTONOU: [6.3500, 2.4300],
  GUAYAQUIL: [-2.2700, -79.9000], 'LA GUAIRA': [10.6000, -66.9300],
  // África / Mediterrâneo / Oriente Médio
  DURBAN: [-29.8700, 31.0300], ALGIERS: [36.7700, 3.0600],
  ORAN: [35.7100, -0.6200], ALEXANDRIA: [31.1800, 29.8700],
  'EL DEKHEILA': [31.1300, 29.8100], 'PORT SAID': [31.2600, 32.3000],
  // Europa (adicionais)
  LIVERPOOL: [53.4500, -3.0200], 'FOS SUR MER': [43.4200, 4.9400],
  MARSEILLE: [43.3400, 5.3400], BILBAO: [43.3500, -3.0200],
  // Ásia (adicionais)
  NANSHA: [22.7500, 113.6200], DALIAN: [38.9500, 121.8800],
  XIAMEN: [24.4500, 118.0800], 'PORT KELANG': [3.0000, 101.3833],
};

// Chaves de PORTS ordenadas do nome mais longo para o mais curto, para casar
// "PORT QASIM" / "LE HAVRE" antes de "PORT" / "LE" ao varrer prefixos.
const PORT_KEYS_BY_LEN = Object.keys(PORTS).sort((a, b) => b.length - a.length);

function portCoords(raw) {
  if (!raw) return null;
  // Normaliza: maiúsculas e colapsa espaços múltiplos (ex.: "SANTOS  BRAZIL").
  const clean = String(raw).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (PORTS[clean]) return PORTS[clean];

  // Remove sufixo após vírgula/parêntese (ex.: "CHATTOGRAM, BD" -> "CHATTOGRAM").
  const beforeComma = clean.split(/[,(]/)[0].trim();
  if (PORTS[beforeComma]) return PORTS[beforeComma];
  if (PORTS[beforeComma.replace(/\s+/g, '')]) return PORTS[beforeComma.replace(/\s+/g, '')];

  // Casa uma chave conhecida que seja prefixo do nome (lida com "PORTO PAÍS",
  // ex.: "SANTOS BRAZIL", "LE HAVRE FRANCE", "PORT QASIM PAKISTAN").
  for (const key of PORT_KEYS_BY_LEN) {
    if (beforeComma === key || beforeComma.startsWith(key + ' ')) return PORTS[key];
  }

  // Último recurso: primeiro token (ex.: "VITORIA BR" -> "VITORIA").
  const firstToken = beforeComma.split(' ')[0];
  return PORTS[firstToken] || null;
}

function fmtBRDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}

function hashString(value) {
  let h = 0;
  const s = String(value || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function agingBaseSubquery() {
  return `
    SELECT t.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM ${DB}.t_fin_disputas d
        WHERE (((COALESCE(d.documento,'') <> 'CR'
              AND d.documento COLLATE utf8mb4_unicode_ci = t.documento COLLATE utf8mb4_unicode_ci
              AND COALESCE(d.nf,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.numero_nf,'') COLLATE utf8mb4_unicode_ci
              AND COALESCE(d.nd,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.nd,'') COLLATE utf8mb4_unicode_ci)
            OR (d.documento = 'CR'
              AND CONCAT('CR|', COALESCE(d.nf,'')) COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci)))
          AND d.is_disputa = 1 AND d.resolved_at IS NULL AND d.deleted_at IS NULL
      ) THEN 1 ELSE 0 END AS is_disputa
    FROM ${DB}.v_fin_regua_contas_receber t
    WHERE NOT EXISTS (
      SELECT 1 FROM ${DB}.t_fin_soft_delete sd
      WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
        AND sd.active = 0
    )
  `;
}

function mapAgingRows(rows) {
  const fields = [
    'not_due', 'aging_30', 'aging_40', 'aging_60', 'aging_90', 'aging_120', 'aging_180', 'aging_240', 'aging_365', 'aging_366_plus',
    'count_not_due', 'count_30', 'count_40', 'count_60', 'count_90', 'count_120', 'count_180', 'count_240', 'count_365', 'count_366_plus',
    'disp_not_due', 'disp_30', 'disp_40', 'disp_60', 'disp_90', 'disp_120', 'disp_180', 'disp_240', 'disp_365', 'disp_366_plus', 'disp_total',
  ];
  const totals = { product: 'Grand Total' };
  fields.forEach(f => { totals[f] = 0; });
  const data = (rows || []).map(r => {
    const row = { product: r.product || 'Outros' };
    if (r.cnpjs) row.cnpjs = String(r.cnpjs).split(',');
    fields.forEach(f => {
      row[f] = Number(r[f]) || 0;
      totals[f] += row[f];
    });
    return row;
  });
  return { data, totals };
}

async function getCobrancaAging(viewMode) {
  const groupExpr = viewMode === 'client'
    ? "COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1)))"
    : "COALESCE(t.modal, 'Outros')";
  const joinGroup = viewMode === 'client'
    ? `LEFT JOIN ${DB}.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci`
    : '';
  const cnpjs = viewMode === 'client'
    ? ", GROUP_CONCAT(DISTINCT REPLACE(REPLACE(REPLACE(t.cnpj, '.', ''), '/', ''), '-', '') SEPARATOR ',') AS cnpjs"
    : '';
  const sql = `
    SELECT
      ${groupExpr} AS product,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN t.valor_nf ELSE 0 END) AS not_due,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN t.valor_nf ELSE 0 END) AS aging_30,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 40 THEN t.valor_nf ELSE 0 END) AS aging_40,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 41 AND 60 THEN t.valor_nf ELSE 0 END) AS aging_60,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 61 AND 90 THEN t.valor_nf ELSE 0 END) AS aging_90,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 120 THEN t.valor_nf ELSE 0 END) AS aging_120,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 121 AND 180 THEN t.valor_nf ELSE 0 END) AS aging_180,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN t.valor_nf ELSE 0 END) AS aging_240,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 365 THEN t.valor_nf ELSE 0 END) AS aging_365,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) > 365 THEN t.valor_nf ELSE 0 END) AS aging_366_plus,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN 1 ELSE 0 END) AS count_not_due,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS count_30,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 40 THEN 1 ELSE 0 END) AS count_40,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 41 AND 60 THEN 1 ELSE 0 END) AS count_60,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS count_90,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 120 THEN 1 ELSE 0 END) AS count_120,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 121 AND 180 THEN 1 ELSE 0 END) AS count_180,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN 1 ELSE 0 END) AS count_240,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 365 THEN 1 ELSE 0 END) AS count_365,
      SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) > 365 THEN 1 ELSE 0 END) AS count_366_plus,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN t.valor_nf ELSE 0 END) AS disp_not_due,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN t.valor_nf ELSE 0 END) AS disp_30,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 40 THEN t.valor_nf ELSE 0 END) AS disp_40,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 41 AND 60 THEN t.valor_nf ELSE 0 END) AS disp_60,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 61 AND 90 THEN t.valor_nf ELSE 0 END) AS disp_90,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 120 THEN t.valor_nf ELSE 0 END) AS disp_120,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 121 AND 180 THEN t.valor_nf ELSE 0 END) AS disp_180,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN t.valor_nf ELSE 0 END) AS disp_240,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 365 THEN t.valor_nf ELSE 0 END) AS disp_365,
      SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) > 365 THEN t.valor_nf ELSE 0 END) AS disp_366_plus,
      SUM(CASE WHEN t.is_disputa = 1 THEN t.valor_nf ELSE 0 END) AS disp_total
      ${cnpjs}
    FROM (${agingBaseSubquery()}) t
    ${joinGroup}
    GROUP BY ${groupExpr}
    ORDER BY SUM(t.valor_nf) DESC
  `;
  const rows = await query(sql);
  const mapped = mapAgingRows(rows);
  const lastRows = await query(`SELECT MAX(datavalidade) as last_update FROM ${DB}.v_fin_regua_contas_receber`);
  return { success: true, ...mapped, lastUpdate: lastRows?.[0]?.last_update || null };
}

async function getFaturamentoRows() {
  return query(`
    SELECT processo, faturado_em, filial, modal, cliente,
           CAST(COALESCE(valor_total_faturado, 0) AS DOUBLE) as valor_total_faturado,
           regiao, divisao_por_modal, 'TOTVS_RM' as fonte
      FROM ${DB}.t_base_totvs_rm
     WHERE faturado_em IS NOT NULL
    UNION ALL
    SELECT CAST(id_ref_object AS CHAR), service_date, branch,
           CASE WHEN cost_center_iv LIKE '%Air%' THEN 'AI' WHEN cost_center_iv LIKE '%Sea%' THEN 'SI' ELSE 'OUTROS' END,
           deb_cred_name, CAST(COALESCE(total_revenue, 0) AS DOUBLE), NULL, NULL, 'NACIONAL_NAO_RLS'
      FROM ${DB}.t_othello_nacional_nao_rls
     WHERE service_date IS NOT NULL
    UNION ALL
    SELECT CAST(id_ref_object AS CHAR), service_date, branch,
           CASE WHEN cost_center_iv LIKE '%Air%' THEN 'AI' WHEN cost_center_iv LIKE '%Sea%' THEN 'SI' ELSE 'OUTROS' END,
           deb_cred_name, CAST(COALESCE(revenue, 0) AS DOUBLE), NULL, NULL, 'INTERNACIONAL_NAO_RLS'
      FROM ${DB}.t_othello_internacional_nao_rls
     WHERE service_date IS NOT NULL
     ORDER BY faturado_em DESC
  `);
}

async function getMovementRows() {
  const out = [];
  const now = Date.now();
  const sourceErrors = [];

  try {
    const airRows = await query(`
      SELECT DISTINCT af.awb, UPPER(REPLACE(af.num_voo, ' ', '')) AS flight, dm.cliente, dm.tipo_processo AS tipo
        FROM ${DB}.t_awb_voo af
        INNER JOIN ${DB}.t_master_dados dm ON dm.mawb = af.awb
       WHERE af.num_voo IS NOT NULL AND TRIM(af.num_voo) <> '' AND TRIM(af.num_voo) <> '0'
         AND dm.cliente IS NOT NULL AND TRIM(dm.cliente) <> ''
       LIMIT 500
    `);
    const hubs = { LH: 'FRA', LA: 'SCL', DL: 'ATL', AZ: 'FCO', AF: 'CDG', KL: 'AMS', BA: 'LHR', IB: 'MAD', TP: 'LIS', UA: 'IAH', AA: 'MIA', AC: 'YYZ', QR: 'DOH', EK: 'DXB', TK: 'IST', CX: 'HKG', SQ: 'SIN', JL: 'NRT', NH: 'NRT', AV: 'BOG', CM: 'PTY' };

    airRows.forEach((r, i) => {
      const flight = String(r.flight || '').replace(/[^A-Z0-9]/g, '');
      const carrier = (flight.match(/^([A-Z]{2,3}|[0-9][A-Z])/) || [])[1];
      const hub = hubs[carrier] || 'MIA';
      const isExport = String(r.tipo || '').toUpperCase().includes('EXPORT');
      const oCode = isExport ? 'GRU' : hub;
      const dCode = isExport ? hub : 'GRU';
      const h = hashString(r.awb || flight || String(i));
      const etaIso = new Date(now + (2 + (h % 20)) * 3600 * 1000).toISOString();
      const prog = 0.15 + ((h % 70) / 100);
      const o = AIRPORTS[oCode] || AIRPORTS.GRU;
      const d = AIRPORTS[dCode] || AIRPORTS.MIA;

      out.push({
        id: `air:${r.awb || flight || i}`,
        mode: 'air',
        tipo_label: r.tipo || 'Air',
        cliente: String(r.cliente || '').split(' - ')[0].trim(),
        rota: `${oCode} \u2192 ${dCode}`,
        eta_iso: etaIso,
        eta_api: fmtBRDateTime(etaIso),
        ata_iso: null,
        delivered_until_ts: null,
        status: 'Em trânsito',
        orig: o ? [o.lat, o.lon] : null,
        dest: d ? [d.lat, d.lon] : null,
        prog,
        pos: o && d ? [o.lat + (d.lat - o.lat) * prog, o.lon + (d.lon - o.lon) * prog] : null,
        flight,
        asset: r.awb || null,
      });
    });
  } catch (error) {
    sourceErrors.push('air');
    console.error('[olimpo:movimentacao-global:air]', error.message);
  }

  try {
    const seaRows = await query(`
      SELECT ts.mbl_id, ts.container, ts.consignee, ts.tipo_processo, ts.origem AS porto_origem,
             ts.destino AS porto_destino, ts.navio AS vessel_name, ts.eta, ts.container_status,
             ts.last_event, ts.last_check, ts.shipping_line,
             CASE WHEN COALESCE(MAX(sm.eta_ata), MAX(mdn.eta)) IS NOT NULL AND MAX(ts.eta) IS NOT NULL
                    AND MAX(ts.eta) > COALESCE(MAX(sm.eta_ata), MAX(mdn.eta))
                    AND DATEDIFF(MAX(ts.eta), COALESCE(MAX(sm.eta_ata), MAX(mdn.eta))) >= 3
                  THEN 1 ELSE 0 END AS is_eta_delayed,
             MAX(ot.origem_lat) AS origem_lat, MAX(ot.origem_lon) AS origem_lon,
             MAX(ot.destino_lat) AS destino_lat, MAX(ot.destino_lon) AS destino_lon,
             MAX(ot.current_lat) AS current_lat, MAX(ot.current_lon) AS current_lon
        FROM ${DB}.t_sea_tracking_current ts
        LEFT JOIN ${DB}.t_olimpo_tracking ot ON ot.mode = 'sea' AND ot.asset COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN ${DB}.t_sea_master sm ON TRIM(sm.master) COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN ${DB}.t_master_dados mdn ON TRIM(mdn.mawb) COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
          AND mdn.tipo_processo IN ('SI', 'SE') AND mdn.data_insert >= '2026-02-01'
       WHERE ts.active = 1
         AND NOT (UPPER(ts.container_status) IN ('DELIVERED', 'DLV', 'GOD', 'EMPTY_RETURNED') AND ts.last_check < DATE_SUB(NOW(), INTERVAL 24 HOUR))
       GROUP BY ts.mbl_id
       ORDER BY ts.eta ASC
       LIMIT 500
    `);

    seaRows.forEach((s) => {
      const oCode = String(s.porto_origem || '').toUpperCase().trim() || 'ORIGEM';
      const dCode = String(s.porto_destino || '').toUpperCase().trim() || 'DESTINO';
      const orig = s.origem_lat && s.origem_lon ? [Number(s.origem_lat), Number(s.origem_lon)] : portCoords(oCode);
      const dest = s.destino_lat && s.destino_lon ? [Number(s.destino_lat), Number(s.destino_lon)] : portCoords(dCode);
      const etaIso = s.eta ? new Date(s.eta).toISOString() : null;
      const statusRaw = String(s.container_status || '').toUpperCase();
      let status = 'Em trânsito';
      let deliveredUntil = null;
      if (['DELIVERED', 'DLV', 'GOD', 'EMPTY_RETURNED'].includes(statusRaw)) {
        status = 'Entregue';
        deliveredUntil = s.last_check ? new Date(s.last_check).getTime() + 24 * 3600 * 1000 : null;
      } else if (Number(s.is_eta_delayed) === 1 || (etaIso && now > new Date(etaIso).getTime())) {
        status = 'Atraso';
      }

      out.push({
        id: `sea:${s.mbl_id || s.container}`,
        mode: 'sea',
        tipo_label: s.tipo_processo || 'SEA IMPORT',
        cliente: s.consignee || '',
        rota: `${oCode} \u2192 ${dCode}`,
        eta_iso: etaIso,
        eta_api: fmtBRDateTime(etaIso),
        ata_iso: null,
        delivered_until_ts: deliveredUntil,
        status,
        orig,
        dest,
        prog: 0.5,
        pos: s.current_lat && s.current_lon ? [Number(s.current_lat), Number(s.current_lon)] : null,
        flight: null,
        asset: s.mbl_id || s.container || null,
      });
    });
  } catch (error) {
    sourceErrors.push('sea');
    console.error('[olimpo:movimentacao-global:sea]', error.message);
  }

  if (out.length === 0 && sourceErrors.length > 0) {
    throw new Error('movement_sources_unavailable');
  }

  return out;
}
export function registerOlimpoRoutes(app) {
  app.get('/api/olimpo/mapbox-token', (_req, res) => res.json({ success: true, token: process.env.MAPBOX_PUBLIC_TOKEN || '' }));

  app.get('/api/olimpo/movimentacao-global', async (req, res) => {
    try {
      const { page, limit, offset } = parsePageLimit(req);
      let data = await getMovementRows();
      const q = String(req.query.search || '').toLowerCase().trim();
      if (q) data = data.filter(i => [i.tipo_label, i.cliente, i.rota, i.asset, i.flight, i.status].join(' ').toLowerCase().includes(q));
      if (req.query.mode) data = data.filter(i => i.mode === req.query.mode);
      if (req.query.status) data = data.filter(i => i.status === req.query.status);
      const total = data.length;
      res.json({ success: true, data: data.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (e) { handleError(res, 'movimentacao-global', e); }
  });

  app.get('/api/olimpo/movimentacao-global/summary', async (_req, res) => {
    try {
      const data = await getMovementRows();
      res.json({ success: true, summary: {
        totalRegistros: data.length,
        containers: data.filter(i => i.mode === 'sea' && i.status === 'Em trânsito').length,
        voos: data.filter(i => i.mode === 'air' && i.status !== 'Entregue').length,
        atrasos: data.filter(i => i.status === 'Atraso').length,
      } });
    } catch (e) { handleError(res, 'movimentacao-global/summary', e); }
  });

  app.get('/api/olimpo/filters', async (_req, res) => {
    try {
      const data = await getMovementRows();
      res.json({ success: true, filters: {
        status: [...new Set(data.map(i => i.status).filter(Boolean))],
        clientes: [...new Set(data.map(i => i.cliente).filter(Boolean))].sort(),
        modes: [...new Set(data.map(i => i.mode).filter(Boolean))],
      } });
    } catch (e) { handleError(res, 'filters', e); }
  });

  app.get('/api/olimpo/cobranca', async (req, res) => {
    try { res.json(await getCobrancaAging(req.query.viewMode === 'client' ? 'client' : 'product')); }
    catch (e) { handleError(res, 'cobranca', e); }
  });

  app.get('/api/olimpo/cobranca/summary', async (req, res) => {
    try {
      const data = await getCobrancaAging(req.query.viewMode === 'client' ? 'client' : 'product');
      const fields = ['not_due', 'aging_30', 'aging_40', 'aging_60', 'aging_90', 'aging_120', 'aging_180', 'aging_240', 'aging_365', 'aging_366_plus'];
      const totalValor = fields.reduce((s, k) => s + Number(data.totals[k] || 0), 0);
      res.json({ success: true, summary: { totalRegistros: data.data.length, totalValor, emAberto: totalValor, emDisputa: Number(data.totals.disp_total || 0) } });
    } catch (e) { handleError(res, 'cobranca/summary', e); }
  });

  app.get('/api/olimpo/cobranca/budget-forecast', async (req, res) => {
    try {
      const viewMode = req.query.viewMode === 'client' ? 'client' : 'product';
      const period = new Date().toISOString().slice(0, 7);
      let budget = 0;
      try {
        const rows = await query(`SELECT COALESCE(budget_value, 0) AS budget FROM ${DB}.t_budget_cobranca WHERE period = DATE_FORMAT(CURDATE(), '%Y-%m') AND view_mode = ?`, [viewMode]);
        budget = Number(rows?.[0]?.budget) || 0;
      } catch {}
      res.json({ success: true, period, budget, forecast: 0, asOf: new Date().toISOString() });
    } catch (e) { handleError(res, 'cobranca/budget-forecast', e); }
  });

  app.get('/api/olimpo/cobranca/payment-term-rating', (_req, res) => res.json({ success: true, data: [], legacy: true }));
  app.get('/api/olimpo/cobranca/aging-historical', (_req, res) => res.json({ success: true, data: [], legacy: true }));
  app.get('/api/olimpo/cobranca/aging-analitico', async (_req, res) => {
    try {
      const pool = getPoolFor('olimpo');
      const [rows] = await pool.query(`
        SELECT
          t.documento,
          t.numero_nf,
          t.modal,
          t.tipo_documento,
          t.data_emissao,
          t.data_prev_baixa AS data_vencimento,
          NULL AS cod_cliente,
          t.razao_social,
          REPLACE(REPLACE(REPLACE(COALESCE(t.cnpj,''),'.',''),'/',''),'-','') AS cnpj_clean,
          t.valor_nf,
          t.valor_liquido,
          t.processo,
          t.master,
          t.house,
          t.id_rm,
          DATEDIFF(CURDATE(), t.data_prev_baixa) AS dias_vencimento,
          le.last_success AS email_success,
          le.last_error AS email_error,
          le.last_sent_at AS email_sent_at
        FROM ${DB}.v_fin_regua_contas_receber t
        LEFT JOIN (
          SELECT REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') AS cnpj_clean,
                 SUBSTRING_INDEX(GROUP_CONCAT(success ORDER BY sent_at DESC), ',', 1) AS last_success,
                 SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(error_message,'') ORDER BY sent_at DESC SEPARATOR '||'), '||', 1) AS last_error,
                 MAX(sent_at) AS last_sent_at
          FROM ${DB}.t_fin_email_log
          GROUP BY REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','')
        ) le
          ON le.cnpj_clean COLLATE utf8mb4_unicode_ci = REPLACE(REPLACE(REPLACE(COALESCE(t.cnpj,''),'.',''),'/',''),'-','') COLLATE utf8mb4_unicode_ci
        WHERE NOT EXISTS (
            SELECT 1 FROM ${DB}.t_fin_soft_delete sd
            WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
              AND sd.active = 0
          )
          AND NOT EXISTS (
            SELECT 1 FROM ${DB}.t_fin_disputas d
            WHERE (
                    (COALESCE(d.documento,'') <> 'CR'
                     AND d.documento COLLATE utf8mb4_unicode_ci = t.documento COLLATE utf8mb4_unicode_ci
                     AND COALESCE(d.nf,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.numero_nf,'') COLLATE utf8mb4_unicode_ci
                     AND COALESCE(d.nd,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.nd,'') COLLATE utf8mb4_unicode_ci)
                    OR
                    (d.documento = 'CR'
                     AND CONCAT('CR|', COALESCE(d.nf,'')) COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci)
                  )
              AND d.is_disputa = 1
              AND d.resolved_at IS NULL
              AND d.deleted_at IS NULL
          )
        ORDER BY DATEDIFF(CURDATE(), t.data_prev_baixa) DESC, t.razao_social, t.data_prev_baixa
        LIMIT ?
      `, [10000]);

      const data = rows.map((row) => {
        let email_status = 'nao_enviado';
        if (row.email_sent_at) {
          email_status = Number(row.email_success) === 1 ? 'enviado' : 'falha';
        }

        return {
          documento: row.documento,
          numero_nf: row.numero_nf,
          modal: row.modal,
          tipo_documento: row.tipo_documento,
          data_emissao: row.data_emissao,
          data_vencimento: row.data_vencimento,
          cod_cliente: row.cod_cliente,
          razao_social: row.razao_social,
          cnpj_clean: row.cnpj_clean,
          valor_nf: Number(row.valor_nf) || 0,
          valor_liquido: Number(row.valor_liquido) || Number(row.valor_nf) || 0,
          processo: row.processo,
          master: row.master,
          house: row.house,
          id_rm: row.id_rm,
          dias_vencimento: Number(row.dias_vencimento) || 0,
          email_status,
          email_error: email_status === 'falha' ? row.email_error || '' : '',
        };
      });

      res.json({ success: true, data, dataCorte: new Date().toISOString().slice(0, 10) });
    } catch (error) {
      console.error('[olimpo:cobranca:aging-analitico]', error.message);
      res.status(500).json({ success: false, error: ERROR_MESSAGE });
    }
  });
  app.get('/api/olimpo/cobranca/payment-term-by-client', (_req, res) => res.json({ success: true, data: [], legacy: true }));
  app.get('/api/olimpo/cobranca/aging-historical-by-client', (_req, res) => res.json({ success: true, data: [], legacy: true }));

  app.get('/api/olimpo/cobranca/client-detail', async (req, res) => {
    try {
      const clientName = String(req.query.clientName || '').trim();
      if (!clientName) return res.status(400).json({ success: false, error: 'clientName required' });
      const rows = await query(`
        SELECT REPLACE(REPLACE(REPLACE(t.cnpj, '.', ''), '/', ''), '-', '') AS cnpj_clean, t.cnpj AS cnpj_original,
               SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN t.valor_nf ELSE 0 END) AS not_due,
               SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN t.valor_nf ELSE 0 END) AS aging_30,
               SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 90 THEN t.valor_nf ELSE 0 END) AS aging_90,
               SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 180 THEN t.valor_nf ELSE 0 END) AS aging_180,
               SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN t.valor_nf ELSE 0 END) AS aging_240,
               SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 360 THEN t.valor_nf ELSE 0 END) AS aging_360,
               SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) > 360 THEN t.valor_nf ELSE 0 END) AS aging_360_plus,
               COUNT(*) AS total_count, MAX(t.condicao_pag) AS condicao_pagamento, MAX(t.nome_vendedor) AS nome_vendedor,
               SUM(CASE WHEN t.is_disputa = 1 THEN t.valor_nf ELSE 0 END) AS disputa_total,
               SUM(CASE WHEN t.is_disputa = 1 THEN 1 ELSE 0 END) AS disputa_count
          FROM (${agingBaseSubquery()}) t
          LEFT JOIN ${DB}.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci
         WHERE COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1))) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
         GROUP BY cnpj_clean, cnpj_original
         ORDER BY total_count DESC
      `, [clientName]);
      const data = rows.map(r => ({
        cnpj: r.cnpj_original || r.cnpj_clean,
        cnpjClean: r.cnpj_clean,
        not_due: Number(r.not_due) || 0,
        aging_30: Number(r.aging_30) || 0,
        aging_90: Number(r.aging_90) || 0,
        aging_180: Number(r.aging_180) || 0,
        aging_240: Number(r.aging_240) || 0,
        aging_360: Number(r.aging_360) || 0,
        aging_360_plus: Number(r.aging_360_plus) || 0,
        totalCount: Number(r.total_count) || 0,
        condicao_pagamento: r.condicao_pagamento || null,
        nome_vendedor: r.nome_vendedor || null,
        disputa_total: Number(r.disputa_total) || 0,
        disputa_count: Number(r.disputa_count) || 0,
      }));
      const cnpjs = data.map(d => d.cnpjClean).filter(Boolean);
      let observacoes = [], contatos = [];
      if (cnpjs.length) {
        const ph = cnpjs.map(() => '?').join(',');
        try { observacoes = await query(`SELECT cnpj, observacao, updated_by, updated_at FROM ${DB}.t_cobranca_observacoes WHERE cnpj IN (${ph})`, cnpjs); } catch {}
        try {
          contatos = await query(`SELECT REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') AS cnpjClean, MAX(nome_contato) AS nome_contato, LOWER(TRIM(email_contato)) AS email_contato FROM ${DB}.t_dados_financeiro_contatos WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') IN (${ph}) AND email_contato IS NOT NULL AND email_contato <> '' GROUP BY cnpjClean, LOWER(TRIM(email_contato)) ORDER BY cnpjClean, email_contato`, cnpjs);
        } catch {}
      }
      res.json({ success: true, data, observacoes, contatos });
    } catch (e) { handleError(res, 'cobranca/client-detail', e); }
  });

  app.get('/api/olimpo/cobranca/email-logs', async (req, res) => {
    try {
      const cnpj = onlyDigits(req.query.cnpj);
      if (!cnpj) return res.json({ success: true, logsByEmail: {} });
      const rows = await query(`SELECT id, stage, LOWER(TRIM(email_to)) AS email_to, subject, sent_at, success, error_message FROM ${DB}.t_fin_email_log WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY sent_at DESC LIMIT 200`, [cnpj]);
      const logsByEmail = {};
      for (const r of rows || []) {
        const key = String(r.email_to || '').toLowerCase().trim();
        if (!key) continue;
        if (!logsByEmail[key]) logsByEmail[key] = [];
        if (logsByEmail[key].length < 10) logsByEmail[key].push({ ...r, success: Number(r.success) === 1 ? 1 : 0 });
      }
      res.json({ success: true, logsByEmail });
    } catch (e) { handleError(res, 'cobranca/email-logs', e); }
  });

  app.get('/api/olimpo/cobranca/client-faturas', async (req, res) => {
    try {
      const clientName = String(req.query.clientName || '').trim();
      if (!clientName) return res.status(400).json({ success: false, error: 'clientName required' });
      const { page, limit, offset } = parsePageLimit(req);
      const modal = String(req.query.modalFilter || '').trim();
      const modalClause = modal ? ` AND COALESCE(t.modal,'') COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ? COLLATE utf8mb4_unicode_ci, '%')` : '';
      const order = req.query.vencSort === 'asc' ? 't.data_prev_baixa ASC' : req.query.vencSort === 'desc' ? 't.data_prev_baixa DESC' : "CASE WHEN t.data_prev_baixa < CURDATE() THEN 0 ELSE 1 END, t.data_prev_baixa ASC";
      const params = modal ? [clientName, modal, limit, offset] : [clientName, limit, offset];
      const rows = await query(`
        SELECT t.doc_key, t.documento, t.numero_nf, t.nd, t.cnpj, t.razao_social,
               DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
               DATE_FORMAT(t.data_prev_baixa, '%d/%m/%Y') AS data_vencimento,
               t.valor_nf, t.valor_liquido, t.modal, t.tipo_documento, t.processo AS numero_processo,
               t.master, t.house, t.condicao_pag AS condicao_pagamento, t.nome_vendedor, t.id_rm, t.idlan,
               CASE WHEN t.is_disputa = 1 THEN 1 ELSE 0 END AS disputa,
               COALESCE(NULLIF(t.numero_nf,''), t.documento) AS referencia_cliente
          FROM (${agingBaseSubquery()}) t
          LEFT JOIN ${DB}.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci
         WHERE COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1))) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
         ${modalClause}
         ORDER BY ${order}
         LIMIT ? OFFSET ?
      `, params);
      const countParams = modal ? [clientName, modal] : [clientName];
      const countRows = await query(`
        SELECT COUNT(*) AS total
          FROM (${agingBaseSubquery()}) t
          LEFT JOIN ${DB}.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci
         WHERE COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1))) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
         ${modalClause}
      `, countParams);
      res.json({ success: true, rows, total: Number(countRows?.[0]?.total || 0), page, pageSize: limit });
    } catch (e) { handleError(res, 'cobranca/client-faturas', e); }
  });

  app.get('/api/olimpo/cobranca/client-disputas', async (req, res) => {
    try {
      const cnpj = onlyDigits(req.query.cnpj);
      if (!cnpj) return res.status(400).json({ success: false, error: 'cnpj required' });
      const rows = await query(`
        SELECT t.nd, t.numero_nf, t.documento, t.valor_nf, t.modal,
               DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
               DATE_FORMAT(t.data_prev_baixa, '%d/%m/%Y') AS data_vencimento
          FROM (${agingBaseSubquery()}) t
         WHERE REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-','') = ?
           AND t.is_disputa = 1
         ORDER BY t.data_prev_baixa DESC
         LIMIT 500
      `, [cnpj]);
      res.json({ success: true, rows: rows.map(r => ({ ...r, valor_nf: Number(r.valor_nf) || 0 })) });
    } catch (e) { handleError(res, 'cobranca/client-disputas', e); }
  });

  app.post('/api/olimpo/cobranca/observacao', async (req, res) => {
    try {
      const cnpj = onlyDigits(req.body?.cnpj);
      if (!cnpj) return res.status(400).json({ success: false, error: 'cnpj required' });
      await query(`INSERT INTO ${DB}.t_cobranca_observacoes (cnpj, observacao, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE observacao = VALUES(observacao), updated_by = VALUES(updated_by)`, [cnpj, req.body?.observacao || '', req.body?.updatedBy || null]);
      res.json({ success: true });
    } catch (e) { handleError(res, 'cobranca/observacao', e); }
  });

  app.get('/api/olimpo/faturamento', async (req, res) => {
    try {
      const { page, limit, offset } = parsePageLimit(req);
      let rows = await getFaturamentoRows();
      const q = String(req.query.search || '').toLowerCase().trim();
      if (q) rows = rows.filter(r => [r.processo, r.filial, r.modal, r.cliente, r.regiao, r.divisao_por_modal].join(' ').toLowerCase().includes(q));
      if (req.query.startDate) rows = rows.filter(r => r.faturado_em && new Date(r.faturado_em) >= new Date(String(req.query.startDate)));
      if (req.query.endDate) rows = rows.filter(r => r.faturado_em && new Date(r.faturado_em) <= new Date(String(req.query.endDate)));
      const total = rows.length;
      res.json({ success: true, data: rows.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (e) { handleError(res, 'faturamento', e); }
  });

  app.get('/api/olimpo/faturamento/summary', async (_req, res) => {
    try {
      const rows = await getFaturamentoRows();
      res.json({ success: true, summary: { totalRegistros: rows.length, totalValor: rows.reduce((s, r) => s + Number(r.valor_total_faturado || 0), 0) } });
    } catch (e) { handleError(res, 'faturamento/summary', e); }
  });
}
