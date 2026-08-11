import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/auth/session";

/** Ctrl_lang::variant — cambia la variante de la sesión (cookie). */
export async function GET(req: NextRequest) {
  const variant = req.nextUrl.searchParams.get("variant") === "main" ? "" : (req.nextUrl.searchParams.get("variant") ?? "");

  const session = await getSession();
  await setSession({
    userId: session?.userId ?? 0,
    language: session?.language || "en",
    variant,
  });
  return NextResponse.redirect(new URL("/", req.url));
}
