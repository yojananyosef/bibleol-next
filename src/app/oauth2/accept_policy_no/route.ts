import { redirect } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth/session";
import { getOAuth2Flow, clearOAuth2Flow } from "@/lib/oauth2/cookie";
import { revokeGooglePermissions } from "@/lib/oauth2/oauth2";
import * as users from "@/lib/services/users";

export const dynamic = "force-dynamic";

/** Ctrl_oauth2::accept_policy_no — borra la cuenta OAuth2 (con código válido). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const acceptanceCode = url.searchParams.get("acceptance_code") ?? "";

  // Solo borramos si el código de aceptación es válido (seguridad del legacy):
  // evita borrados maliciosos o accidentales entrando en esta ruta.
  const session = await getSession();
  const flow = await getOAuth2Flow();
  const me = session ? users.getUserById(session.userId) : null;
  if (me && users.verifyAcceptCode(me, acceptanceCode, "", false)) {
    users.deleteUser(me.id!);
    if (flow?.newOauth2 === "google" && flow.accessToken) {
      await revokeGooglePermissions(flow.accessToken).catch(() => undefined);
    }
  }

  await clearSession();
  await clearOAuth2Flow();
  redirect("/oauth2/rejected");
}