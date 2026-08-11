"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const CHART_COLORS = [
  "#f00", "#0f0", "#00f", "#0ff", "#ff0", "#f0f", "#000",
  "#800", "#080", "#008", "#08f", "#8f0", "#80f", "#0f8", "#f80", "#f08",
  "#088", "#880", "#808",
  "#f88", "#8f8", "#88f",
  "#ff8", "#f8f", "#8ff", "#888",
];

export interface WeekHour {
  week: string; // format_week
  weekDate: number; // lunes de la semana (unix)
  hours: number;
}

/** Bar semanal (student_time: horas por semana). */
export function WeeklyBarChart({ data }: { data: WeekHour[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" />
        <YAxis unit="h" />
        <Tooltip
          formatter={(v) => [`${Number(v ?? 0).toFixed(1)} h`, "Hours"]}
        />
        <Bar dataKey="hours" fill="#3b82f6" name="Hours" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface ExerciseHours {
  name: string; // pathname
  hours: number;
}

/** HBar por ejercicio (student_time: horas por ejercicio). */
export function ExerciseHoursChart({ data }: { data: ExerciseHours[] }) {
  const rows = [...data].sort((a, b) => a.hours - b.hours);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 32 + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" unit="h" />
        <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(1)} h`, "Hours"]} />
        <Bar dataKey="hours" fill="#22c55e" name="Hours" radius={[0, 2, 2, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DayPoint {
  x: number; // unix del día (mediodía)
  y: number; // porcentaje o featpermin
  label: string; // formato fecha
  count: number;
  featpermin: number;
}

/** Scatter % correcto por día (student_exercise / teacher_exercises). */
export function DailyScatterChart({ data, domain = [0, 100] }: { data: DayPoint[]; domain?: [number | "auto", number | "auto"] }) {
  const rows = data.map((d) => ({ ...d, label: `${d.label} (${Math.round(d.y)}%)` }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v: number) => new Date(v * 1000).toLocaleDateString()}
        />
        <YAxis type="number" dataKey="y" domain={domain} unit={domain[1] === 100 ? "%" : undefined} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as DayPoint;
            return (
              <div className="rounded border bg-background px-2 py-1 text-xs shadow">
                <div>{p.label}</div>
                <div>Questions: {p.count}</div>
                <div>Per min: {p.featpermin.toFixed(1)}</div>
              </div>
            );
          }}
        />
        <Scatter data={rows} fill="#3b82f6" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Líneas % correcto por día, una serie por estudiante (teacher_exercises). */
export function DailyLinesChart({
  series,
  domain = [0, 100],
}: {
  series: { name: string; color: string; points: DayPoint[] }[];
  domain?: [number | "auto", number | "auto"];
}) {
  const rows = series.flatMap((s) => s.points.map((p) => ({ ...p, student: s.name })));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v: number) => new Date(v * 1000).toLocaleDateString()}
        />
        <YAxis type="number" dataKey="y" domain={domain} unit={domain[1] === 100 ? "%" : undefined} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as DayPoint & { student: string };
            return (
              <div className="rounded border bg-background px-2 py-1 text-xs shadow">
                <div>{p.student}</div>
                <div>{p.label}</div>
                <div>{Math.round(p.y)}%</div>
              </div>
            );
          }}
        />
        {series.map((s) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey="y"
            data={s.points.map((p) => ({ x: p.x, y: p.y, label: p.label, student: s.name }))}
            stroke={s.color}
            dot={{ r: 3, fill: s.color }}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface FeaturePct {
  name: string; // feature localizado
  pct: number;
}

/** HBar % correcto por feature (student_exercise / teacher_exercises). */
export function FeatureBarsChart({ data }: { data: FeaturePct[] }) {
  const rows = [...data].sort((a, b) => b.pct - a.pct);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 32 + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 100]} unit="%" />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [`${Math.round(Number(v ?? 0))}%`, "Correct"]} />
        <Bar dataKey="pct" name="Correct" radius={[0, 2, 2, 0]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** HBar % correcto por feature, una barra por estudiante (grouped). */
export function FeatureGroupedBarsChart({
  data,
}: {
  data: { feature: string; bars: { student: string; color: string; pct: number | null }[] }[];
}) {
  const rows = data.map((d) => {
    const row: Record<string, string | number | null> = { feature: d.feature };
    for (const b of d.bars) row[b.student] = b.pct;
    return row;
  });
  const students = data[0]?.bars.map((b) => b.student) ?? [];
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32 + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 100]} unit="%" />
        <YAxis type="category" dataKey="feature" width={160} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [`${Math.round(Number(v ?? 0))}%`, "Correct"]} />
        {students.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[0, 2, 2, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
