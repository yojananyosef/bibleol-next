"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "./export-buttons";
import { StatisticsPeriod } from "@/lib/statistics/period";

export interface GradeAttemptRow {
  time: number;
  percentage: number;
  duration: number;
  avgPerQi: number;
  grade: string | number;
  quizzid: number;
  userid: number;
}

export interface GradeStudentRow {
  name: string;
  email: string;
  attempts: GradeAttemptRow[];
  hgstGrade: string | number;
}

/**
 * grading_table del legacy (view_grades_teacher_exercises / _exams):
 * por estudiante, primera fila = mejor intento (header), resto = detalle
 * colapsable. Export CSV/Excel excluye las filas de detalle.
 */
export function GradeTable({
  tableId,
  students,
  filename,
  detailHrefPrefix,
}: {
  tableId: string;
  students: GradeStudentRow[];
  filename: string;
  detailHrefPrefix: string;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-2">
          <ExportButtons filename={filename} tableId={tableId} />
        </div>
      </div>
      <Table id={tableId} className="border">
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-center">Date</TableHead>
            <TableHead className="text-center">Correct</TableHead>
            <TableHead className="text-center">Quiz grade</TableHead>
            <TableHead className="text-center">Best total time</TableHead>
            <TableHead className="text-center">Avg per qi</TableHead>
            <TableHead data-exclude />
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((st, i) => {
            return (
              <StudentRows
                key={i}
                st={st}
                open={open[i] ?? false}
                toggle={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                detailHrefPrefix={detailHrefPrefix}
                headerGrade={st.hgstGrade}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function StudentRows({
  st,
  open,
  toggle,
  detailHrefPrefix,
  headerGrade,
}: {
  st: GradeStudentRow;
  open: boolean;
  toggle: () => void;
  detailHrefPrefix: string;
  headerGrade: string | number;
}) {
  const first = st.attempts[0];
  if (!first)
    return (
      <TableRow>
        <TableCell>{st.name}</TableCell>
        <TableCell>{st.email}</TableCell>
        <TableCell colSpan={6} />
      </TableRow>
    );
  return (
    <>
      <TableRow className="font-medium">
        <TableCell>
          {st.name} (hgst grade)
        </TableCell>
        <TableCell>{st.email}</TableCell>
        <TableCell className="text-center">{StatisticsPeriod.formatTime(first.time)}</TableCell>
        <TableCell className="text-center">{Math.round(first.percentage)}%</TableCell>
        <TableCell className="text-center">
          <Link href={`${detailHrefPrefix}${first.quizzid}?userid=${first.userid}`} className="text-primary hover:underline">
            {headerGrade}
          </Link>
        </TableCell>
        <TableCell className="text-center">{first.duration}</TableCell>
        <TableCell className="text-center">{first.avgPerQi.toFixed(1)}</TableCell>
        <TableCell className="text-center" data-exclude>
          <Button variant="outline" size="sm" onClick={toggle}>
            {open ? "Hide detail" : "Detail"}
          </Button>
        </TableCell>
      </TableRow>
      {st.attempts.slice(1).map((a) => (
        <TableRow key={a.quizzid} className={open ? "" : "hidden"} data-exclude>
          <TableCell>&gt;&gt;&gt; {st.name}</TableCell>
          <TableCell />
          <TableCell className="text-center">{StatisticsPeriod.formatTime(a.time)}</TableCell>
          <TableCell className="text-center">{Math.round(a.percentage)}%</TableCell>
          <TableCell className="text-center">
            <Link href={`${detailHrefPrefix}${a.quizzid}?userid=${a.userid}`} className="text-primary hover:underline">
              {a.grade}
            </Link>
          </TableCell>
          <TableCell className="text-center">{a.duration}</TableCell>
          <TableCell className="text-center">{a.avgPerQi.toFixed(1)}</TableCell>
          <TableCell data-exclude />
        </TableRow>
      ))}
    </>
  );
}
