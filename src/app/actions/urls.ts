"use server";

// Acciones de FASE 9 — URLs para glosas (port de Ctrl_urls::change_url/delete_url).
// Validan los parámetros como el legacy y redirigen con requesturi + scrolltop.

import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth/guards";
import * as urls from "@/lib/services/urls";

export type UrlsResult = { ok?: true; error?: string };

function badPost(): UrlsResult {
  return { error: "bad_post_parameters" };
}

/** Ctrl_urls::change_url — crea (id=-1) o actualiza un enlace de lexema. */
export async function changeUrlAction(
  prev: UrlsResult | null,
  formData: FormData,
): Promise<UrlsResult> {
  try {
    await checkAdmin();
    const link = String(formData.get("link") ?? "");
    const icon = String(formData.get("icon") ?? "");
    const id = Number(formData.get("id"));
    const requesturi = String(formData.get("requesturi") ?? "");
    const scrolltop = Number(formData.get("scrolltop"));

    if (link === "" || !Number.isInteger(id) || requesturi === "" || !Number.isInteger(scrolltop)) return badPost();

    if (id === -1) {
      const lex = String(formData.get("lex") ?? "");
      const longlang = String(formData.get("longlang") ?? "");
      if (lex === "" || (longlang !== "Hebrew" && longlang !== "Aramaic")) return badPost();
      urls.createHebUrl(lex, longlang, link, icon);
    } else {
      urls.setHebUrl(id, link, icon);
    }

    redirect(`${requesturi}${requesturi.includes("?") ? "&" : "?"}scrolltop=${scrolltop}`);
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Ctrl_urls::delete_url — borra un enlace de lexema por id. */
export async function deleteUrlAction(
  prev: UrlsResult | null,
  formData: FormData,
): Promise<UrlsResult> {
  try {
    await checkAdmin();
    const urlid = Number(formData.get("urlid"));
    const requesturi = String(formData.get("requesturi") ?? "");
    const scrolltop = Number(formData.get("scrolltop"));

    if (!Number.isInteger(urlid) || requesturi === "" || !Number.isInteger(scrolltop)) return badPost();

    urls.deleteHebUrl(urlid);

    redirect(`${requesturi}${requesturi.includes("?") ? "&" : "?"}scrolltop=${scrolltop}`);
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    return { error: e instanceof Error ? e.message : String(e) };
  }
}