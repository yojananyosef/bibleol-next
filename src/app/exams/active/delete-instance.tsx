"use client";

// Borrado de instancia (1:1 con delete_exam_instance del legacy).

import { useRouter } from "next/navigation";
import { deleteExamInstanceAction } from "@/app/actions/exams";
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

export function DeleteExamInstance({ id }: { id: number }) {
  const router = useRouter();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Badge className="cursor-pointer">Delete instance</Badge>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete exam instance</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the exam instance and all its results.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form
            action={async (fd: FormData) => {
              fd.set("id", String(id));
              await deleteExamInstanceAction(fd);
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