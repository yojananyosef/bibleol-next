import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/auth/session";
import { getAppDb } from "@/lib/db/sqlite";

/** Ctrl_lang::index — cambia el idioma de interfaz de la sesión (cookie). */
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") ?? "en";
  const valid = (getAppDb().prepare("SELECT 1 as x FROM bol_translation_languages WHERE abb = ?").get(lang) as { x: number } | undefined) !== undefined;
  if (!valid) return NextResponse.redirect(new URL("/", req.url));

  const session = await getSession();
  await setSession({
    userId: session?.userId ?? 0,
    language: lang,
    variant: session?.variant || "",
  });
  return NextResponse.redirect(new URL("/", req.url));
}
