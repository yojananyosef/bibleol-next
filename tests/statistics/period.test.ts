import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PERIOD,
  SECS_PER_DAY,
  SECS_PER_WEEK,
  StatisticsPeriod,
  WEEK_EPOCH_OFFSET,
} from "../../src/lib/statistics/period.ts";

const DAY = SECS_PER_DAY;
const NOW = 1_760_000_000; // fecha fija de referencia (UTC)

test("Statistics_timeperiod: constantes", () => {
  assert.equal(MAX_PERIOD, 26 * SECS_PER_WEEK);
  assert.equal(WEEK_EPOCH_OFFSET, 4 * DAY);
});

test("lastMidnight / nextMidnight / roundToNoon", () => {
  const ut = NOW - 3600; // dentro del mismo día UTC
  assert.equal(StatisticsPeriod.lastMidnight(ut), Math.floor(ut / DAY) * DAY);
  assert.equal(StatisticsPeriod.nextMidnight(ut), StatisticsPeriod.lastMidnight(ut) + DAY);
  assert.equal(StatisticsPeriod.roundToNoon(ut), StatisticsPeriod.lastMidnight(ut) + 12 * 3600);
});

test("lastMonday / nextMonday: lunes de la semana", () => {
  // 2026-08-11 es martes → lunes = 2026-08-10
  const tue = Math.floor(Date.parse("2026-08-11T12:00:00Z") / 1000);
  const monday = StatisticsPeriod.lastMonday(tue);
  assert.equal(StatisticsPeriod.formatDate(monday), "2026-08-10");
  assert.equal(StatisticsPeriod.nextMonday(tue), monday + SECS_PER_WEEK);
});

test("format_*", () => {
  const ut = Math.floor(Date.parse("2026-08-11T14:30:00Z") / 1000);
  assert.equal(StatisticsPeriod.formatDate(ut), "2026-08-11");
  assert.equal(StatisticsPeriod.formatDay(ut), "11");
  assert.equal(StatisticsPeriod.formatTime(ut), "2026-08-11 14:30:00");
});

test("decode_start_date / decode_end_date", () => {
  const p = new StatisticsPeriod("short");
  assert.equal(p.decodeStartDate("2026-08-01"), Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000));
  assert.equal(p.decodeEndDate("2026-08-01"), Math.floor(Date.parse("2026-08-01T23:59:59Z") / 1000) + 1);
});

test("ok_dates: clampa a MAX_PERIOD (short = 1 semana)", () => {
  const p = new StatisticsPeriod("short");
  p.okDates("2026-01-01", "2026-09-01"); // 8 meses > 26 semanas
  assert.equal(p.endTimestamp() - p.startTimestamp(), MAX_PERIOD);
  assert.equal(p.startString(), "2026-01-01");
});

test("ok_dates: rango corto sin clamp", () => {
  const p = new StatisticsPeriod("short");
  p.okDates("2026-08-01", "2026-08-10");
  assert.equal(p.startTimestamp(), Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000));
  assert.equal(p.endTimestamp(), Math.floor(Date.parse("2026-08-10T23:59:59Z") / 1000) + 1);
  assert.equal(p.endString(), "2026-08-10"); // inclusiva
});

test("ok_dates: fechas inválidas → default_dates", () => {
  const p = new StatisticsPeriod("short");
  p.okDates("not-a-date", null);
  assert.ok(p.startTimestamp() > 0);
  assert.ok(p.endTimestamp() - p.startTimestamp() <= SECS_PER_WEEK);
});

test("default_dates: largo = 26 semanas", () => {
  const p = new StatisticsPeriod("long");
  p.defaultDates();
  assert.equal(p.endTimestamp() - p.startTimestamp(), MAX_PERIOD);
});
