"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClassesForUserAction } from "@/app/actions/userclass";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ClassForUserRow {
  clid: number;
  classname: string;
  checked: boolean;
}

/** Formulario de asignación usuario↔clases (1:1 view_edit_classes_for_user). */
export function ClassesForUserForm({
  userid,
  rows,
  extras,
  l10n,
}: {
  userid: number;
  rows: ClassForUserRow[];
  extras: string;
  l10n: { class: string; inThisClass: string; ok: string; cancel: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (fd: FormData) => {
        const res = await updateClassesForUserAction(fd);
        if (res.ok) router.push(`/admin/users?${extras}`);
        else setError(res.error ?? "unknown error");
      }}
      className="space-y-3"
    >
      <input type="hidden" name="userid" value={userid} />
      <div className="max-w-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{l10n.class}</TableHead>
              <TableHead className="text-center">{l10n.inThisClass}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.clid}>
                <TableCell>{r.classname}</TableCell>
                <TableCell className="text-center">
                  <Checkbox name="foruser[]" value={String(r.clid)} defaultChecked={r.checked} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="flex gap-2">
        <Button type="submit">{l10n.ok}</Button>
        <Button type="button" variant="outline" onClick={() => router.push(`/admin/users?${extras}`)}>
          {l10n.cancel}
        </Button>
      </p>
    </form>
  );
}