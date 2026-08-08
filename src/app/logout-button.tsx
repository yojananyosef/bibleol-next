"use client";

import { useActionState } from "react";
import { logoutAction } from "@/app/actions/auth";

export function LogoutButton() {
  const [, formAction] = useActionState(logoutAction, null);
  return (
    <form action={formAction}>
      <button type="submit" className="text-muted-foreground underline-offset-4 hover:underline">
        Log out
      </button>
    </form>
  );
}
