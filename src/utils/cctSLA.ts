import type { SLAInfo, SLAStatus, StatusCCTOficial, TipoVoo } from "@/types/cct";

// América do Sul / Brasil → VOO_CURTO. Demais → VOO_LONGO.
const SOUTH_AMERICA_AIRPORTS = new Set<string>([
  // Brasil (cobre principais; qualquer origem nacional também é curto)
  "GRU", "VCP", "GIG", "CWB", "POA", "CNF", "BSB", "REC", "FOR", "SSA",
  "MAO", "BEL", "MCZ", "NAT", "FLN", "VIX", "GYN", "AJU", "THE", "SLZ",
  // Argentina
  "EZE", "AEP", "COR", "MDZ",
  // Chile
  "SCL", "ARI", "IPC",
  // Colombia
  "BOG", "MDE", "CLO", "CTG", "BAQ",
  // Peru
  "LIM", "CUZ", "AQP",
  // Equador
  "UIO", "GYE",
  // Venezuela
  "CCS", "MAR", "VLN",
  // Uruguai / Paraguai / Bolívia
  "MVD", "ASU", "VVI", "LPB",
  // Guianas
  "GEO", "PBM", "CAY",
]);

// Hierarquia de status (índice ≥ MANIFESTADA = SLA cumprido)
const STATUS_ORDER: Record<string, number> = {
  AGUARDANDO_CONSULTA: 0,
  INFORMADA: 1,
  MANIFESTADA: 2,
  EM_AREA_TRANSFERENCIA: 3,
  RECEPCIONADA: 4,
  EM_TROCA_RECINTOS: 5,
  EM_TRANSITO_TERRESTRE: 6,
  ENTREGUE: 7,
};

const MANIFESTADA_INDEX = STATUS_ORDER.MANIFESTADA;

function inferTipoVoo(originAirport: string | null | undefined): TipoVoo {
  const code = String(originAirport || "").toUpperCase().trim();
  if (!code || code === "N/A") return "VOO_LONGO";
  return SOUTH_AMERICA_AIRPORTS.has(code) ? "VOO_CURTO" : "VOO_LONGO";
}

function parseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const d = new Date(String(input).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function isFulfilledByStatus(status: StatusCCTOficial | null | undefined): boolean {
  if (!status) return false;
  const idx = STATUS_ORDER[status as string];
  return typeof idx === "number" && idx >= MANIFESTADA_INDEX;
}

export interface ComputeSLAArgs {
  depDatetime: string | null | undefined;
  eta?: string | null | undefined;
  originAirport: string | null | undefined;
  status: StatusCCTOficial | null | undefined;
  dataManifestacao?: string | null | undefined;
}

export function computeSLAInfo(args: ComputeSLAArgs): SLAInfo {
  const tipoVoo = inferTipoVoo(args.originAirport);
  const slaConfigHoras = tipoVoo === "VOO_CURTO" ? 0.5 : 4;

  const dep = parseDate(args.depDatetime);
  const eta = parseDate(args.eta);

  // Calcula o limite SLA
  let slaLimite: Date | null = null;
  if (tipoVoo === "VOO_CURTO" && dep) {
    slaLimite = new Date(dep.getTime() + 30 * 60 * 1000); // +30min
  } else if (tipoVoo === "VOO_LONGO") {
    if (eta) {
      slaLimite = new Date(eta.getTime() - 4 * 60 * 60 * 1000); // ETA -4h
    } else if (dep) {
      slaLimite = new Date(dep.getTime() + 4 * 60 * 60 * 1000); // fallback dep +4h
    }
  }

  // SLA cumprido?
  const fulfilledByStatus = isFulfilledByStatus(args.status);
  const fulfilledByDate = !!args.dataManifestacao;
  const cumprido = fulfilledByStatus || fulfilledByDate;

  let status: SLAStatus = "OK";
  let horasRestantes: number | null = null;

  if (cumprido) {
    status = "CUMPRIDO";
  } else if (slaLimite) {
    const diffMs = slaLimite.getTime() - Date.now();
    horasRestantes = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    if (diffMs < 0) status = "VENCIDO";
    else if (horasRestantes <= 1) status = "CRITICO";
    else if (horasRestantes <= 4) status = "ALERTA";
    else status = "OK";
  }

  return {
    status,
    horasRestantes,
    tipoVoo,
    slaLimite: slaLimite ? slaLimite.toISOString() : null,
    slaConfigHoras,
    percentual: null,
    tempoResposta: null,
    usouNovaLogica: true,
  };
}
