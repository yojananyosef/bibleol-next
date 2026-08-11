"use client";

// delete_exam — soft delete (archived=1), 1:1 con el legacy.

import { useRouter } from "next/navigation";
import { deleteExamAction } from "@/app/actions/exams";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function DeleteExam({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Badge className="cursor-pointer">Delete</Badge>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete exam</AlertDialogTitle>
          <AlertDialogDescription>
            The following exam will be deleted: &ldquo;{name}&rdquo;
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form
            action={async (fd: FormData) => {
              fd.set("id", String(id));
              await deleteExamAction(fd);
              router.refresh();
            }}
          >
            <Button type="submit" variant="destructive">Delete</Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}