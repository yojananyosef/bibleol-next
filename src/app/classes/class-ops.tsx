"use client";

// Operaciones por clase (1:1 view_class_list): borrar con confirmación,
// change owner (admin) y añadir grader (admin).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeOwnerAction, deleteClassAction, addGraderAction } from "@/app/actions/classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ClassOps({
  classId,
  className_,
  isAdmin,
  teachers,
}: {
  classId: number;
  className_: string;
  isAdmin: boolean;
  teachers: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [chownError, setChownError] = useState<string | null>(null);
  const [graderError, setGraderError] = useState<string | null>(null);

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger render={<Badge className="cursor-pointer">Delete</Badge>} />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the class &ldquo;{className_}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form
              action={async (fd: FormData) => {
                await deleteClassAction(fd);
                router.refresh();
              }}
            >
              <input type="hidden" name="classid" value={classId} />
              <Button type="submit" variant="destructive">Delete</Button>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isAdmin && (
        <AlertDialog>
          <AlertDialogTrigger render={<Badge className="cursor-pointer">Change owner</Badge>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change owner</AlertDialogTitle>
              <AlertDialogDescription>Select the new owner teacher for this class.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogDescription>
              {chownError && <span className="text-sm text-destructive">{chownError}</span>}
            </AlertDialogDescription>
            <form
              action={async (fd: FormData) => {
                fd.set("classid", String(classId));
                const res = await changeOwnerAction(fd);
                if (!res.ok) setChownError(res.error ?? "error");
                router.refresh();
              }}
            >
              <select name="newowner" className="w-full rounded border bg-background px-2 py-1.5 text-sm" defaultValue="0">
                <option value="0" disabled>Choose teacher…</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="submit" size="sm">OK</Button>
              </div>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isAdmin && (
        <AlertDialog>
          <AlertDialogTrigger render={<Badge className="cursor-pointer">Add grader</Badge>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add grader</AlertDialogTitle>
              <AlertDialogDescription>Enter the username of the teacher to add as grader.</AlertDialogDescription>
            </AlertDialogHeader>
            <form
              action={async (fd: FormData) => {
                fd.set("classid", String(classId));
                const res = await addGraderAction(fd);
                if (!res.ok) setGraderError(res.error ?? "error");
                router.refresh();
              }}
            >
              <Input name="grader_username" placeholder="username" className="w-full" />
              {graderError && <p className="mt-2 text-sm text-destructive">{graderError}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <Button type="submit" size="sm">OK</Button>
              </div>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}