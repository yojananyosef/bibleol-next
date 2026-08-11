"use client";

// save_exam (1:1): los inputs de cada ejercicio se llaman
// `{exercisename}numq` / `{exercisename}weight` (como el POST del legacy).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveExamAction } from "@/app/actions/exams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type EditExamData = {
  id: number;
  exam_name: string;
  teacher_id: number;
  description: string;
  exercises: Array<{ exercisename: string; numq: number; weight: number }>;
};

export function EditExamForm({ data }: { data: EditExamData }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (fd: FormData) => {
        const res = await saveExamAction(fd);
        if (res.ok) router.push("/exams");
        else setError(res.error ?? "unknown error");
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={data.id} />
      <input type="hidden" name="exam_name" value={data.exam_name} />
      <input type="hidden" name="teacher_id" value={data.teacher_id} />
      <div>
        <Label>Exam name</Label>
        <Input value={data.exam_name} readOnly className="bg-muted" />
      </div>
      <div>
        <Label htmlFor="description">Exam description</Label>
        <Textarea id="description" name="description" defaultValue={data.description} rows={3} />
      </div>

      <div className="space-y-2">
        {data.exercises.map((x) => (
          <div key={x.exercisename} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
            <span className="truncate font-medium">{x.exercisename}</span>
            <span className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Number of questions</Label>
              <Input
                type="number"
                min={1}
                className="w-20"
                name={`${x.exercisename}numq`}
                defaultValue={x.numq}
              />
              <Label className="text-xs text-muted-foreground">Weight</Label>
              <Input
                type="number"
                min={1}
                className="w-20"
                name={`${x.exercisename}weight`}
                defaultValue={x.weight}
              />
            </span>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/exams")}>Cancel</Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}