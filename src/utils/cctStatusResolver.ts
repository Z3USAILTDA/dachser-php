import type { CCTEvento, StatusCCTOficial } from "@/types/cct";
import { STATUS_MAPPING } from "@/types/cct";

export const CCT_EVENT_TO_STATUS: Record<string, StatusCCTOficial> = {
  AREA_TRANSFERENCIA: "EM_AREA_TRANSFERENCIA",
  EM_AREA_TRANSFERENCIA: "EM_AREA_TRANSFERENCIA",
  MANIFESTADO: "MANIFESTADA",
  MANIFESTADA: "MANIFESTADA",
  RECEPCIONADO: "RECEPCIONADA",
  RECEPCIONADA: "RECEPCIONADA",
  CHEGADA_INFORMADA: "INFORMADA",
  CHEGADA_AERONAVE: "INFORMADA",
  INFORMADA: "INFORMADA",
  EM_TRANSITO: "EM_TRANSITO_TERRESTRE",
  EM_TRANSITO_TERRESTRE: "EM_TRANSITO_TERRESTRE",
  EM_TRNSITO_TERRESTRE: "EM_TRANSITO_TERRESTRE",
  EM_TROCA_RECINTOS: "EM_TROCA_RECINTOS",
  ENTREGUE: "ENTREGUE",
  BLOQUEIO: "BLOQUEIO",
  DESEMBARACO: "ENTREGUE",
  LIBERADO: "ENTREGUE",
  DESBLOQUEIO: "RECEPCIONADA",
  ...STATUS_MAPPING,
};

const toTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const toNumericId = (id: string): number | null => {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
};

export const compareCCTEventsByRecency = (a: CCTEvento, b: CCTEvento): number => {
  const byEventDate = toTimestamp(b.data_hora_evento) - toTimestamp(a.data_hora_evento);
  if (byEventDate !== 0) return byEventDate;

  const byCreatedAt = toTimestamp(b.created_at) - toTimestamp(a.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;

  const aNum = toNumericId(a.id);
  const bNum = toNumericId(b.id);

  if (aNum !== null && bNum !== null && bNum !== aNum) {
    return bNum - aNum;
  }

  return b.id.localeCompare(a.id);
};

export const mapEventCodeToStatus = (code?: string | null): StatusCCTOficial | null => {
  if (!code) return null;
  return CCT_EVENT_TO_STATUS[code.toUpperCase()] || null;
};

// Map free-text description (e.g. "Em trânsito terrestre", "Recepcionada") to canonical status.
const mapDescriptionToStatus = (descricao?: string | null): StatusCCTOficial | null => {
  if (!descricao) return null;
  const s = descricao.toLowerCase().trim();
  if (!s) return null;
  if (s.includes('bloque')) return 'BLOQUEIO';
  if (s.includes('entregue')) return 'ENTREGUE';
  if (s.includes('trans') && s.includes('terre')) return 'EM_TRANSITO_TERRESTRE';
  if (s.includes('troca') && s.includes('recint')) return 'EM_TROCA_RECINTOS';
  if (s.includes('recepc')) return 'RECEPCIONADA';
  if (s.includes('transfer')) return 'EM_AREA_TRANSFERENCIA';
  if (s.includes('manifest')) return 'MANIFESTADA';
  if (s.includes('inform')) return 'INFORMADA';
  return null;
};

export const getLatestTimelineStatus = (
  eventos: CCTEvento[],
  fallback: StatusCCTOficial | string = "AGUARDANDO_MANIFESTACAO"
): StatusCCTOficial | string => {
  if (!eventos?.length) return fallback;

  const sorted = [...eventos].sort(compareCCTEventsByRecency);
  for (const evento of sorted) {
    const mapped =
      mapEventCodeToStatus(evento.codigo_evento) ||
      mapDescriptionToStatus((evento as any).descricao || (evento as any).descricao_evento);
    if (mapped) return mapped;
  }

  return fallback;
};
