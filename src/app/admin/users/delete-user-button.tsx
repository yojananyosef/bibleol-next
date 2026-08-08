"use client";

import { useActionState } from "react";
import { adminDeleteUserAction, type ActionResult } from "@/app/actions/auth";
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
import { Button } from "@/components/ui/button";

export function DeleteUserButton({
  userId,
  username,
  offset,
  orderby,
  sortorder,
}: {
  userId: number;
  username: string;
  offset: number;
  orderby: string;
  sortorder: string;
}) {
  const [, formAction] = useActionState<ActionResult | null, FormData>(adminDeleteUserAction, null);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" className="h-6 px-2 text-xs" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the user &ldquo;{username}&rdquo;? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="userid" value={userId} />
            <input type="hidden" name="offset" value={offset} />
            <input type="hidden" name="orderby" value={orderby} />
            <input type="hidden" name="sortorder" value={sortorder} />
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
