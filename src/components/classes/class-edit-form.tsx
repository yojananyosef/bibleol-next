"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveClassAction } from "@/app/actions/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Formulario de clase (1:1 view_edit_class): nombre + password + enrol_before. */
export function ClassEditForm({
  classid,
  info,
}: {
  classid: number;
  info: {
    id: number;
    classname: string;
    password: string | null;
    enrol_before: string | null;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (fd: FormData) => {
        const res = await saveClassAction(fd);
        if (res.ok) router.push("/classes");
        else setError(res.error ?? "unknown error");
      }}
      className="space-y-3"
    >
      <input type="hidden" name="classid" value={classid} />
      <div>
        <Label htmlFor="classname">Class name</Label>
        <Input id="classname" name="classname" defaultValue={info.classname} required />
      </div>
      <div>
        <Label htmlFor="password">Class password</Label>
        <Input id="password" name="password" defaultValue={info.password ?? ""} placeholder="Leave blank if no password" />
      </div>
      <div>
        <Label htmlFor="enrol_before">Enroll before</Label>
        <Input id="enrol_before" name="enrol_before" defaultValue={info.enrol_before ?? ""} placeholder="YYYY-MM-DD or blank" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">OK</Button>
    </form>
  );
}