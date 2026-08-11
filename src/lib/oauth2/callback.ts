/**
 * oauth2-callback.ts — Lógica transversal de Ctrl_oauth2::common_callback,
 * compartida por /oauth2/google_callback y /oauth2/facebook_callback.
 * Gestiona la cookie de flujo y la sesión; lanza DataException con la clave
 * i18n del legacy en caso de error.
 */

import { getConfig } from "@/lib/config";
import { sessionLanguage } from "@/lib/auth/guards";
import { setSession } from "@/lib/auth/session";
import * as users from "@/lib/services/users";
import { DataException } from "@/lib/errors";
import { exchangeCode, fetchUserInfo, type OAuth2Authority } from "@/lib/oauth2/oauth2";
import { getOAuth2Flow, setOAuth2Flow } from "@/lib/oauth2/cookie";

/** Port de common_callback(authority) — devuelve sin errores si todo fue bien. */
export async function oauth2Callback(url: URL, authority: OAuth2Authority): Promise<void> {
  if (url.searchParams.get("error")) {
    const err = url.searchParams.get("error")!;
    if (err === "access_denied") throw new DataException(`access_denied_from_${authority}`);
    throw new DataException(err);
  }

  // Comprobar que fuimos nosotros quienes enviamos la petición de autorización
  const flow = await getOAuth2Flow();
  if (url.searchParams.get("state") !== flow?.state) throw new DataException("bad_state_information");

  const code = url.searchParams.get("code");
  if (!code) throw new DataException(`wrong_answer_from_${authority}`);

  // Canjear el código de autorización por un access token
  const cfg = getConfig();
  const accessToken = await exchangeCode(authority, code, cfg);
  if (!accessToken) throw new DataException(`${authority}_no_valid_reply`);

  await setOAuth2Flow({ ...flow, accessToken });

  // Obtener información del usuario remoto
  const info = await fetchUserInfo(authority, accessToken, cfg);
  if (info.id === "") throw new DataException(`${authority}_no_valid_reply`);

  const lang = await sessionLanguage();
  const newUser = users.newOauth2User(
    authority, info.id, info.first_name, info.last_name, info.family_name_first, info.email, lang,
  );

  // set_login_session del legacy (iguala el comportamiento de Ctrl_login)
  const sessionUser = newUser ?? users.getOauth2User(authority, info.id) ?? users.dummyUser();
  if (!newUser && users.acceptedCurrentPolicy(sessionUser)) users.updateLoginStat(sessionUser);
  await setSession({
    userId: sessionUser.id!,
    language: sessionUser.preflang && sessionUser.preflang !== "none" ? sessionUser.preflang : "en",
    variant: sessionUser.prefvariant && sessionUser.prefvariant !== "none" ? (sessionUser.prefvariant === "main" ? "" : sessionUser.prefvariant) : "",
  });

  if (newUser) {
    // Primera vez que entra: la página de inicio le pide aceptar la política
    await setOAuth2Flow({ ...flow, accessToken, newOauth2: authority });
  }
}