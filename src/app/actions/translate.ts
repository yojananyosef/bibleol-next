"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser, checkTranslator } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import * as translate from "@/lib/services/translate";

export type TranslateResult = { error?: string; ok?: true };

function clean(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Guard: solo traductores (check_translator). */
async function translator(): Promise<void> {
  await checkTranslator();
}

async function variant(): Promise<string | null> {
  const s = await getSession();
  return s?.variant || null;
}

/** Ctrl_translate::update_if — guarda las cadenas de un textgroup. */
export async function updateIfAction(prev: TranslateResult | null, formData: FormData): Promise<TranslateResult> {
  try {
    await translator();
    const langEdit = clean(formData.get("lang_edit"));
    const group = clean(formData.get("group"));
    if (!langEdit || !group) return { error: "Missing language/textgroup identification" };
    const post: Record<string, string> = {};
    for (const [k, v] of formData.entries()) post[k] = typeof v === "string" ? v : "";
    translate.updateIfLines(langEdit, group, post, await variant());
    revalidatePath("/translate");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Ctro_translate::update_grammar — guarda el JSON de un grupo de gramática. */
export async function updateGrammarAction(prev: TranslateResult | null, formData: FormData): Promise<TranslateResult> {
  try {
    await translator();
    const langEdit = clean(formData.get("lang_edit"));
    const db = clean(formData.get("db"));
    if (!langEdit || !db) return { error: "Missing language/database identification" };
    const post: Record<string, string> = {};
    for (const [k, v] of formData.entries()) post[k] = typeof v === "string" ? v : "";
    translate.updateGrammarLines(langEdit, db, post, await variant());
    revalidatePath("/translate/grammar");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Ctrl_translate::update_lex — guarda las glosas del léxico. */
export async function updateLexAction(prev: TranslateResult | null, formData: FormData): Promise<TranslateResult> {
  try {
    await translator();
    const srcLang = clean(formData.get("src_lang"));
    const langEdit = clean(formData.get("lang_edit"));
    if (!srcLang || !langEdit) return { error: "Missing language identification" };
    const post: Record<string, string> = {};
    for (const [k, v] of formData.entries()) post[k] = typeof v === "string" ? v : "";
    translate.updateGlosses(srcLang, langEdit, post, await variant());
    revalidatePath("/translate/lexicon");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Ctrl_translate::modify_localization — enable/disable iface/heblex/greeklex/… */
export async function modifyLocalizationAction(formData: FormData): Promise<void> {
  await translator();
  const enable = clean(formData.get("enable")) === "true";
  const locType = clean(formData.get("loc_type"));
  const langAbb = clean(formData.get("lang"));
  translate.modifyLocalization(enable, locType as never, langAbb);
  revalidatePath("/translate");
  redirect("/translate");
}

/** Ctrl_translate::add_language — crea un nuevo idioma de traducción. */
export async function addLanguageAction(formData: FormData): Promise<void> {
  await translator();
  const internal = clean(formData.get("internal-name")).replace(/\s+/g, "_").toLowerCase();
  const nativeName = clean(formData.get("native-name"));
  const abbrev = clean(formData.get("abbrev"));
  if (!internal || !nativeName || !abbrev) throw new Error("bad_post_parameters");
  translate.addLanguage(abbrev, internal, nativeName);
  revalidatePath("/translate");
  redirect("/translate");
}

/** Ctrl_lang::index — cambia el idioma de sesión (cookie). */
export async function setLanguageAction(formData: FormData): Promise<void> {
  const me = await currentUser();
  const langs = translate.getIfLanguages();
  const lang = clean(formData.get("lang"));
  if (!langs[lang]) return;
  const { setSession } = await import("@/lib/auth/session");
  const session = await getSession();
  await setSession({
    userId: me.id!,
    language: lang,
    variant: session?.variant || me.prefvariant === "main" ? "" : session?.variant || "",
  });
  revalidatePath("/", "layout");
  redirect((formData.get("from") as string) || "/");
}
