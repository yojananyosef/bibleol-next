"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GradeScheme } from "@/lib/grades/scales";

/**
 * Selector de teacher_exercises / teacher_exam del legacy (form GET):
 * exercise, grade_system, max_time, nongraded + periodo.
 */
export function GradeSelector({
  exercise,
  exerciseList,
  gradeSchemes,
  gradeSystem,
  maxTime,
  nongraded,
  startDate,
  endDate,
  extra,
}: {
  exercise: string;
  exerciseList: string[];
  gradeSchemes: GradeScheme[];
  gradeSystem: string;
  maxTime: string;
  nongraded: boolean;
  startDate: string;
  endDate: string;
  extra: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [ex, setEx] = useState(exercise);
  const [gs, setGs] = useState(gradeSystem);
  const [mt, setMt] = useState(maxTime);
  const [ng, setNg] = useState(nongraded);
  const [sd, setSd] = useState(startDate);
  const [ed, setEd] = useState(endDate);

  function submit() {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(extra)) {
      if (v === "") p.delete(k);
      else p.set(k, v);
    }
    if (ex) p.set("exercise", ex);
    else p.delete("exercise");
    if (gs) p.set("grade_system", gs);
    if (mt) p.set("max_time", mt);
    else p.delete("max_time");
    if (ng) p.set("nongraded", "on");
    else p.delete("nongraded");
    if (sd) p.set("start_date", sd);
    if (ed) p.set("end_date", ed);
    router.push(`?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border p-3">
      <div className="grid gap-1">
        <Label>Exercise</Label>
        <Select value={ex} onValueChange={(v) => v !== null && setEx(v)}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">—</SelectItem>
            {exerciseList.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label>Grade system</Label>
        <Select value={gs} onValueChange={(v) => v !== null && setGs(v)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {gradeSchemes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.schemeName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label>Max time per question</Label>
        <Input className="w-24" value={mt} onChange={(e) => setMt(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <Checkbox checked={ng} onCheckedChange={(v) => setNg(v === true)} />
        Show non-graded
      </label>
      <div className="grid gap-1">
        <Label>From</Label>
        <Input type="date" value={sd} onChange={(e) => setSd(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>To</Label>
        <Input type="date" value={ed} onChange={(e) => setEd(e.target.value)} />
      </div>
      <Button size="sm" onClick={submit}>
        OK
      </Button>
    </div>
  );
}
