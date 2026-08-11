"use client";

// Asignación de usuarios a una clase (1:1 view_edit_users_in_class + el POST
// de Ctrl_userclass::users_in_class). Checkboxes en dos columnas.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsersInClassAction, updateUsersInClassAction } from "@/app/actions/classes";
import type { ClsResult } from "@/app/actions/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UsersPayload = {
  classInfo: { id: number; classname: string };
  allUsers: Array<{ id: number; name: string }>;
  oldUsers: number[];
};

export function UsersInClassForm({ classid }: { classid: number }) {
  const router = useRouter();
  const [data, setData] = useState<UsersPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fd = new FormData();
    fd.set("classid", String(classid));
    getUsersInClassAction(fd).then((res: ClsResult) => {
      if (res.ok && res.data) {
        const d = res.data as UsersPayload;
        setData(d);
        setChecked(new Set(d.oldUsers));
      } else {
        setError(res.error ?? "unknown error");
      }
    });
  }, [classid]);

  if (error)
    return <p className="text-sm text-destructive">{error}</p>;
  if (!data)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows = (slice: Array<{ id: number; name: string }>) =>
    slice.map((u) => (
      <div key={u.id} className="flex items-center gap-2 py-0.5 text-sm">
        <Input
          type="checkbox"
          className="h-4 w-4"
          checked={checked.has(u.id)}
          onChange={() => toggle(u.id)}
        />
        <span>{u.name}</span>
      </div>
    ));

  const mid = Math.ceil(data.allUsers.length / 2);

  return (
    <form
      action={async () => {
        const fd = new FormData();
        fd.set("classid", String(classid));
        for (const id of checked) fd.append("inclass", String(id));
        const res = await updateUsersInClassAction(fd);
        if (res.ok) router.push("/classes");
      }}
    >
      <div className="flex flex-wrap gap-8">
        <div className="min-w-48">{rows(data.allUsers.slice(0, mid))}</div>
        <div className="min-w-48">{rows(data.allUsers.slice(mid))}</div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button type="submit">OK</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/classes")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}