"use client";

// Modal "Create instance" (1:1 con view_manage_exams): clase, nombre,
// ventana fecha/hora y duración. La conversión a unix se hace en el cliente
// (en el legacy el navegador enviaba el offset y el server re-interpretaba).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createExamInstanceAction } from "@/app/actions/exams";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function defaultTimes(): { start: string; end: string } {
  const start = new Date(Date.now() + 86_400_000); // mañana
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3_600_000); // 20:00
  const local = (d: Date): string => {
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return { start: local(start), end: local(end) };
}

export function CreateInstanceDialog({
  examId,
  examName,
  classes,
}: {
  examId: number;
  examName: string;
  classes: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [times] = useState(defaultTimes);
  const [start, setStart] = useState(times.start);
  const [end, setEnd] = useState(times.end);
  const [duration, setDuration] = useState("90");
  const [className, setClassName] = useState(classes[0]?.id ?? 0);
  const [instanceName, setInstanceName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (fd: FormData): Promise<void> => {
    const toUnix = (v: string): number => Math.floor(new Date(v).getTime() / 1000);
    fd.set("exam_id", String(examId));
    fd.set("class_id", String(fd.get("class_id") || className));
    fd.set("exam_start_time", String(toUnix(start)));
    fd.set("exam_end_time", String(toUnix(end)));
    fd.set("exam_length", String(fd.get("exam_length") || duration));
    fd.set("instance_name", String(fd.get("instance_name") || instanceName || examName));
    const res = await createExamInstanceAction(fd);
    if (res.ok) router.push("/exams/active");
    else setError(res.error ?? "unknown error");
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Badge className="cursor-pointer">Create instance</Badge>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create instance</AlertDialogTitle>
          <AlertDialogDescription>Schedule this exam for a class.</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={submit} className="grid gap-3">
          <input type="hidden" name="class_id" />
          <input type="hidden" name="exam_length" />
          <input type="hidden" name="instance_name" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Class</Label>
              <select
                name="class"
                className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                value={className}
                onChange={(e) => setClassName(Number(e.target.value))}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Instance name</Label>
              <Input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} placeholder={examName} />
            </div>
            <div>
              <Label>Start</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">OK</Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}