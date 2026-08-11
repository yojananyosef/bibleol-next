/**
 * statistics/period.ts — Réplica 1:1 de `libraries/Statistics_timeperiod.php`.
 * Periodos de tiempo para los reportes de estadísticas (fechas, semanas,
 * mediodías) con timestamps UNIX.
 */

export const MAX_PERIOD = 26 * 7 * 24 * 3600; // 26 semanas (periodo máximo)
export const WEEK_EPOCH_OFFSET = 4 * 24 * 3600; // segundos de 1970-01-01 a 1970-01-05 (lunes)
export const SECS_PER_WEEK = 7 * 24 * 3600;
export const SECS_PER_DAY = 24 * 3600;

export type PeriodLength = "short" | "long";

/** Constructor: 'long' → MAX_PERIOD, si no → 1 semana. */
export class StatisticsPeriod {
  private periodStart: number;
  private periodEnd: number;
  readonly defaultPeriod: number;

  constructor(defaultPeriod: PeriodLength = "short") {
    this.defaultPeriod = defaultPeriod === "long" ? MAX_PERIOD : SECS_PER_WEEK;
    this.periodStart = 0;
    this.periodEnd = 0;
  }

  static formatWeek(ut: number): string {
    const d = new Date(ut * 1000);
    return `${d.getUTCFullYear()}-W${String(isoWeek(d)).padStart(2, "0")}`;
  }

  static formatDate(ut: number): string {
    return new Date(ut * 1000).toISOString().slice(0, 10);
  }

  static formatDay(ut: number): string {
    return new Date(ut * 1000).toISOString().slice(8, 10);
  }

  static formatTime(ut: number): string {
    return new Date(ut * 1000).toISOString().slice(0, 19).replace("T", " ");
  }

  static lastMidnight(ut: number): number {
    return Math.floor(ut / SECS_PER_DAY) * SECS_PER_DAY;
  }

  static nextMidnight(ut: number): number {
    return StatisticsPeriod.lastMidnight(ut + SECS_PER_DAY);
  }

  /** Clave de día para las gráficas (el legacy usa el mediodía). */
  static roundToNoon(ut: number): number {
    return StatisticsPeriod.lastMidnight(ut) + 12 * 3600;
  }

  static lastMonday(ut: number): number {
    return (
      Math.floor((ut - WEEK_EPOCH_OFFSET) / SECS_PER_WEEK) * SECS_PER_WEEK + WEEK_EPOCH_OFFSET
    );
  }

  static nextMonday(ut: number): number {
    return StatisticsPeriod.lastMonday(ut + SECS_PER_WEEK);
  }

  /**
   * decode_start_date: null → next_midnight(now) - default_period;
   * si no, la fecha 'YYYY-MM-DD 00:00:00' en UTC.
   */
  decodeStartDate(date: string | null): number {
    if (date === null) return StatisticsPeriod.nextMidnight(Math.floor(Date.now() / 1000)) - this.defaultPeriod;
    return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
  }

  /** decode_end_date: null → next_midnight(now); si no, 'YYYY-MM-DD 23:59:59' + 1. */
  decodeEndDate(date: string | null): number {
    if (date === null) return StatisticsPeriod.nextMidnight(Math.floor(Date.now() / 1000));
    return Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000) + 1;
  }

  /**
   * ok_dates: fija periodStart/periodEnd desde start_date/end_date
   * (null → default) y clampa el periodo a MAX_PERIOD.
   */
  okDates(startDate: string | null, endDate: string | null): void {
    const start = this.decodeStartDate(startDate);
    const end = this.decodeEndDate(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      this.defaultDates();
      return;
    }
    this.periodStart = start;
    this.periodEnd = Math.min(end, start + MAX_PERIOD);
  }

  /** default_dates: desde el último medianoche hasta ahora + 1 día. */
  defaultDates(): void {
    this.periodEnd = StatisticsPeriod.lastMidnight(Math.floor(Date.now() / 1000)) + SECS_PER_DAY;
    this.periodStart = this.periodEnd - this.defaultPeriod;
  }

  startTimestamp(): number {
    return this.periodStart;
  }

  endTimestamp(): number {
    return this.periodEnd;
  }

  /** Fecha de inicio 'YYYY-MM-DD'. */
  startString(): string {
    return StatisticsPeriod.formatDate(this.periodStart);
  }

  /** Fecha final INCLUSIVA (end - 1, como el legacy). */
  endString(): string {
    return StatisticsPeriod.formatDate(this.periodEnd - 1);
  }

  startWeek(): number {
    return StatisticsPeriod.lastMonday(this.periodStart);
  }

  endWeek(): number {
    return StatisticsPeriod.nextMonday(this.periodEnd - 1);
  }
}

/** Número de semana ISO 8601 de una fecha UTC. */
function isoWeek(d: Date): number {
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d.getTime());
  thursday.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return week;
}
