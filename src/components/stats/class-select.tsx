"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ClassRow } from "@/lib/services/classes";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Select de clase que navega con el query param dado (classid). */
export function ClassSelect({
  classId,
  classes,
  paramName,
}: {
  classId: number;
  classes: ClassRow[];
  paramName: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function change(value: string | null) {
    if (value === null) return;
    const p = new URLSearchParams(params.toString());
    if (value === "0" || value === "") p.delete(paramName);
    else p.set(paramName, value);
    router.push(`?${p.toString()}`);
  }

  return (
    <div className="grid gap-1">
      <Label>Class</Label>
      <Select value={String(classId)} onValueChange={change}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">All classes</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.classname}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
