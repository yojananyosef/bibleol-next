"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * datepicker_period.js del legacy → selector de periodo (start_date/end_date).
 * Envía GET con los parámetros actuales más start_date/end_date.
 */
export function PeriodPicker({
  startDate,
  endDate,
  extra,
}: {
  startDate: string;
  endDate: string;
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);

  function submit() {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(extra ?? {})) {
      if (v === "") p.delete(k);
      else p.set(k, v);
    }
    if (start) p.set("start_date", start);
    if (end) p.set("end_date", end);
    router.push(`?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border p-3">
      <div className="grid gap-1">
        <Label htmlFor="pp-start">From</Label>
        <Input id="pp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="pp-end">To</Label>
        <Input id="pp-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <Button size="sm" onClick={submit}>
        OK
      </Button>
    </div>
  );
}
