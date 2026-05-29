/**
 * Demurrage Importação — cálculo central.
 *
 * Regra (inclusive):
 *   Limite Devolução = ATA + FreeTime - 1
 *   Dias em Posse    = (Devolução || Hoje) - ATA + 1
 *   Dias Excedidos   = max(0, Dias em Posse - FreeTime)
 *
 * - ATA = data efetiva do evento do armador. Nunca ETA.
 * - Devolução = evento de empty return do armador.
 */

export type DemurrageInput = {
  armador?: string | null;
  ata?: string | Date | null;
  devolucao?: string | Date | null;
  freeTime?: number | null;
  hoje?: Date;
};

export type DemurrageCalculation = {
  ataDate: Date | null;
  devolucaoDate: Date | null;
  limiteDevolucaoDate: Date | null;
  diasEmPosse: number | null;
  diasExcedidos: number | null;
};

export function parseDateOnly(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "00/01/1900" || raw === "0000-00-00" || raw.startsWith("0000-00-00")) return null;

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

export function diffDaysInclusive(start: Date, end: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((e.getTime() - s.getTime()) / oneDay) + 1;
}

export function calculateImportDemurrage(input: DemurrageInput): DemurrageCalculation {
  const ataDate = parseDateOnly(input.ata);
  const devolucaoDate = parseDateOnly(input.devolucao);
  const freeTime = Number(input.freeTime || 0);
  const hoje = input.hoje || new Date();

  if (!ataDate || freeTime <= 0) {
    return { ataDate, devolucaoDate, limiteDevolucaoDate: null, diasEmPosse: null, diasExcedidos: null };
  }
  const limiteDevolucaoDate = addDays(ataDate, freeTime - 1);
  const dataFinal = devolucaoDate || hoje;
  const diasEmPosse = diffDaysInclusive(ataDate, dataFinal);
  const diasExcedidos = Math.max(0, diasEmPosse - freeTime);
  return { ataDate, devolucaoDate, limiteDevolucaoDate, diasEmPosse, diasExcedidos };
}

// ─── Eventos por armador ────────────────────────────────────────────────

type CarrierEventRule = { ataEvents: string[]; returnEvents: string[] };

const DEMURRAGE_EVENT_RULES: Record<string, CarrierEventRule> = {
  "HAPAG-LLOYD": { ataEvents: ["vessel arrival"], returnEvents: ["gate in empty"] },
  "MSC": { ataEvents: ["import"], returnEvents: ["empty"] },
  "CMA-CGM": { ataEvents: ["vessel arrival"], returnEvents: ["empty in depot"] },
  "ZIM": { ataEvents: ["vessel arrival to port of discharge"], returnEvents: ["empty container gate in"] },
  "MAERSK": { ataEvents: ["vessel arrival"], returnEvents: ["empty container return"] },
  "HMM": { ataEvents: ["vessel arrival at pod"], returnEvents: ["import empty container returned"] },
  "ONE": { ataEvents: ["vessel arrival at port of discharge"], returnEvents: ["empty container returned from customer"] },
  "COSCO": { ataEvents: ["ata"], returnEvents: ["empty return"] },
};

function normalizeText(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCarrier(value?: string | null): string {
  const carrier = normalizeText(value).toUpperCase();
  if (carrier.includes("HAPAG")) return "HAPAG-LLOYD";
  if (carrier.includes("MSC")) return "MSC";
  if (carrier.includes("CMA")) return "CMA-CGM";
  if (carrier.includes("ZIM")) return "ZIM";
  if (carrier.includes("MAERSK")) return "MAERSK";
  if (carrier.includes("HMM") || carrier.includes("HYUNDAI")) return "HMM";
  if (carrier.includes("ONE") || carrier.includes("OCEAN NETWORK")) return "ONE";
  if (carrier.includes("COSCO")) return "COSCO";
  return carrier;
}

function matchesAnyEvent(eventDescription: string, expected: string[]): boolean {
  const e = normalizeText(eventDescription);
  return expected.some(x => e.includes(normalizeText(x)));
}

export function isAtaEvent(armador: string | null | undefined, eventDescription: string): boolean {
  const rule = DEMURRAGE_EVENT_RULES[normalizeCarrier(armador)];
  return rule ? matchesAnyEvent(eventDescription, rule.ataEvents) : false;
}

export function isReturnEvent(armador: string | null | undefined, eventDescription: string): boolean {
  const rule = DEMURRAGE_EVENT_RULES[normalizeCarrier(armador)];
  return rule ? matchesAnyEvent(eventDescription, rule.returnEvents) : false;
}

export type TrackingEvent = { event_description?: string | null; event_datetime?: string | Date | null };

export function extractDemurrageDatesFromEvents(armador: string | null | undefined, events: TrackingEvent[]) {
  const sorted = [...(events || [])]
    .filter(e => e?.event_datetime)
    .sort((a, b) => new Date(a.event_datetime as any).getTime() - new Date(b.event_datetime as any).getTime());

  const ataEvent = sorted.find(e => isAtaEvent(armador, e.event_description || ""));
  const ataDate = ataEvent?.event_datetime || null;

  const returnEvent = sorted.find(e => {
    if (!isReturnEvent(armador, e.event_description || "")) return false;
    if (!ataDate) return true;
    return new Date(e.event_datetime as any).getTime() >= new Date(ataDate as any).getTime();
  });

  return {
    ata: ataDate,
    devolucao: returnEvent?.event_datetime || null,
    ataEventDescription: ataEvent?.event_description || null,
    devolucaoEventDescription: returnEvent?.event_description || null,
  };
}

// ─── Helpers de formatação para relatórios ─────────────────────────────

export function formatDateBR(value?: string | Date | null): string {
  const d = parseDateOnly(value);
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Resolve a ATA efetiva de um container, preferindo o evento real do armador
 * (quando disponível em c.data_atracacao), e nunca caindo silenciosamente em ETA.
 */
export function resolveAta(c: { data_atracacao?: string | null; ft_started_at?: string | null }): string | null {
  return c.data_atracacao || c.ft_started_at || null;
}
