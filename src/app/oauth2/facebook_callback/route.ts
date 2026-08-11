import { redirect } from "next/navigation";
import type { OAuth2Authority } from "@/lib/oauth2/oauth2";
import { oauth2Callback } from "@/lib/oauth2/callback";
import { DataException } from "@/lib/errors";

export const dynamic = "force-dynamic";

const AUTHORITY: OAuth2Authority = "facebook";

/** Ctrl_oauth2::facebook_callback. */
export async function GET(request: Request) {
  try {
    await oauth2Callback(new URL(request.url), AUTHORITY);
    redirect("/");
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const msg = e instanceof DataException ? e.message : String(e);
    redirect(`/oauth2/error?key=${encodeURIComponent(msg)}`);
  }
}