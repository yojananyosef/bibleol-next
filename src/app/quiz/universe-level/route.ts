import { NextResponse } from "next/server";
import { addUniverseLevel } from "@/lib/services/text-quiz";
import { sessionLanguage } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/** Expansión perezosa de un nivel del árbol de universo (add_universe_level). */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const prop = url.searchParams.get("prop") ?? "";
  const rangelow = Number(url.searchParams.get("rangelow") ?? "0");
  const rangehigh = Number(url.searchParams.get("rangehigh") ?? "0");
  const ref = url.searchParams.get("ref") ?? "";
  const lev = Number(url.searchParams.get("lev") ?? "0");

  try {
    const json = addUniverseLevel(prop, rangelow, rangehigh, ref, lev, "Everything");
    return NextResponse.json(JSON.parse(json));
  } catch {
    return NextResponse.json({ error: "cannot_open_file" }, { status: 404 });
  }
}
