"use server";

import { redirect } from "next/navigation";
import { checkLoggedIn } from "@/lib/auth/guards";
import { setFont } from "@/lib/services/config";

export type ActionResult = { error?: string; ok?: true };

/** Ctrl_config::fonts — POST del formulario de fuentes. */
export async function saveFontSettingsAction(prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await checkLoggedIn();
  const post = Object.fromEntries(formData.entries());
  setFont(me.id ?? 0, post);
  redirect("/");
}
