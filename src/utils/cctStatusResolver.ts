import type { CCTEvento, StatusCCTOficial } from "@/types/cct";
import { STATUS_MAPPING } from "@/types/cct";

export const CCT_EVENT_TO_STATUS: Record<string, StatusCCTOficial> = {
  AREA_TRANSFERENCIA: "EM_AREA_TRANSFERENCIA",
  MANIFESTADO: "MANIFESTADA",
  RECEPCIONADO: "RECEPCIONADA",
  CHEGADA_INFORMADA: "INFORMADA",
  CHEGADA_AERONAVE: "INFORMADA",
  EM_TRANSITO: "EM_TRANSITO_TERRESTRE",
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

export const getLatestTimelineStatus = (
  eventos: CCTEvento[],
  fallback: StatusCCTOficial | string = "AGUARDANDO_MANIFESTACAO"
): StatusCCTOficial | string => {
  if (!eventos?.length) return fallback;

  const sorted = [...eventos].sort(compareCCTEventsByRecency);
  for (const evento of sorted) {
    const mapped = mapEventCodeToStatus(evento.codigo_evento);
    if (mapped) return mapped;
  }

  return fallback;
};
