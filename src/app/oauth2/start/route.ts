import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { setOAuth2Flow } from "@/lib/oauth2/cookie";
import { authUrl, oauth2State, type OAuth2Authority } from "@/lib/oauth2/oauth2";
import { DataException } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** login page → /oauth2/start?authority=google (o facebook): arranca el flujo. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const authority = url.searchParams.get("authority") as OAuth2Authority | null;
  if (authority !== "google" && authority !== "facebook") throw new DataException("illegal_lang_code");

  const cfg = getConfig();
  const enabled = authority === "google" ? cfg.google_login_enabled : cfg.facebook_login_enabled;
  if (!enabled || (authority === "google" ? cfg.google_client_id : cfg.facebook_client_id) === "")
    redirect(`/login?oauth2_error=${authority}_disabled`);

  const state = oauth2State();
  await setOAuth2Flow({ state });
  redirect(authUrl(authority, state, cfg));
}