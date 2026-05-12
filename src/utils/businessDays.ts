/**
 * Business day utilities for Brazilian calendar.
 * Excludes weekends and national holidays (fixed + movable).
 */

const holidayCache = new Map<number, Set<string>>();

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Meeus/Jones/Butcher algorithm for Easter Sunday (Gregorian). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getBrazilianHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const set = new Set<string>();

  // Feriados nacionais fixos
  const fixed: Array<[number, number]> = [
    [1, 1],   // Confraternização Universal
    [4, 21],  // Tiradentes
    [5, 1],   // Dia do Trabalho
    [9, 7],   // Independência
    [10, 12], // Nossa Senhora Aparecida
    [11, 2],  // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ];
  for (const [month, day] of fixed) {
    set.add(toKey(new Date(year, month - 1, day)));
  }

  // Feriados móveis baseados na Páscoa
  const easter = easterSunday(year);
  set.add(toKey(addDays(easter, -48))); // Segunda de Carnaval
  set.add(toKey(addDays(easter, -47))); // Terça de Carnaval
  set.add(toKey(addDays(easter, -2)));  // Sexta-feira Santa
  set.add(toKey(addDays(easter, 60)));  // Corpus Christi

  holidayCache.set(year, set);
  return set;
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !getBrazilianHolidays(date.getFullYear()).has(toKey(date));
}
