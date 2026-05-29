// Espelho Deno do utilitário src/utils/demurrageCalc.ts
// Mantém regra de cálculo e nomenclatura de eventos por armador idênticas.

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
  if (!raw || raw === "-" || raw === "00/01/1900" || raw.startsWith("0000-00-00")) return null;
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

type CarrierEventRule = { ataEvents: string[]; returnEvents: string[] };

const RULES: Record<string, CarrierEventRule> = {
  "HAPAG-LLOYD": { ataEvents: ["vessel arrival"], returnEvents: ["gate in empty"] },
  "MSC": { ataEvents: ["import"], returnEvents: ["empty"] },
  "CMA-CGM": { ataEvents: ["vessel arrival"], returnEvents: ["empty in depot"] },
  "ZIM": { ataEvents: ["vessel arrival to port of discharge"], returnEvents: ["empty container gate in"] },
  "MAERSK": { ataEvents: ["vessel arrival"], returnEvents: ["empty container return"] },
  "HMM": { ataEvents: ["vessel arrival at pod"], returnEvents: ["import empty container returned"] },
  "ONE": { ataEvents: ["vessel arrival at port of discharge"], returnEvents: ["empty container returned from customer"] },
  "COSCO": { ataEvents: ["ata"], returnEvents: ["empty return"] },
};

function normalizeText(v?: string | null): string {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeCarrier(v?: string | null): string {
  const c = normalizeText(v).toUpperCase();
  if (c.includes("HAPAG")) return "HAPAG-LLOYD";
  if (c.includes("MSC")) return "MSC";
  if (c.includes("CMA")) return "CMA-CGM";
  if (c.includes("ZIM")) return "ZIM";
  if (c.includes("MAERSK")) return "MAERSK";
  if (c.includes("HMM") || c.includes("HYUNDAI")) return "HMM";
  if (c.includes("ONE") || c.includes("OCEAN NETWORK")) return "ONE";
  if (c.includes("COSCO")) return "COSCO";
  return c;
}

function matchesAnyEvent(desc: string, expected: string[]): boolean {
  const e = normalizeText(desc);
  return expected.some(x => e.includes(normalizeText(x)));
}

export function isAtaEvent(armador: string | null | undefined, desc: string): boolean {
  const r = RULES[normalizeCarrier(armador)];
  return r ? matchesAnyEvent(desc, r.ataEvents) : false;
}
export function isReturnEvent(armador: string | null | undefined, desc: string): boolean {
  const r = RULES[normalizeCarrier(armador)];
  return r ? matchesAnyEvent(desc, r.returnEvents) : false;
}

export function extractDemurrageDatesFromEvents(
  armador: string | null | undefined,
  events: Array<{ event_description?: string | null; event_datetime?: string | Date | null }>
) {
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

export function formatDateBR(v?: string | Date | null): string {
  const d = parseDateOnly(v);
  if (!d) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
