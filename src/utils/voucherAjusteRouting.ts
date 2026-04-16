// Utilities for routing a voucher back to the stage that requested the adjustment.
// We persist the requester via a text marker prefixed in `ajuste_operacao` /
// `ajuste_fiscal`, e.g. "[REQ:FINANCEIRO] motivo do ajuste".
// This avoids any schema change while letting the "send forward" handlers
// route the voucher directly back to the requesting stage.

export type EtapaSolicitanteAjuste = "FINANCEIRO" | "SUPERVISOR" | "FISCAL";

const MARKER_RE = /^\s*\[REQ:(FINANCEIRO|SUPERVISOR|FISCAL)\]\s*/i;

export const buildAjusteWithRequester = (
  requester: EtapaSolicitanteAjuste,
  motivo: string,
): string => {
  const cleaned = stripRequesterMarker(motivo || "");
  return `[REQ:${requester}] ${cleaned}`.trim();
};

export const parseRequesterFromAjuste = (
  texto?: string | null,
): EtapaSolicitanteAjuste | null => {
  if (!texto) return null;
  const m = texto.match(MARKER_RE);
  if (!m) return null;
  return m[1].toUpperCase() as EtapaSolicitanteAjuste;
};

export const stripRequesterMarker = (texto?: string | null): string => {
  if (!texto) return "";
  return texto.replace(MARKER_RE, "");
};
