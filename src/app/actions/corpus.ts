"use server";

import { redirect } from "next/navigation";

export type SelectTextActionState = { error?: string } | null;

/**
 * Ctrl_text::select_text — valida el formulario y redirige a
 * /text/<db>/<book>/<chapter>[/<vfrom>[/<vto>]][?icons=on].
 */
export async function selectTextAction(prev: SelectTextActionState | null, formData: FormData): Promise<SelectTextActionState> {
  const db = String(formData.get("db") ?? "");
  const book = String(formData.get(`book_${db}`) ?? "");
  const chapter = String(formData.get("chapter") ?? "").trim();
  const vfrom = String(formData.get("vfrom") ?? "").trim();
  const vto = String(formData.get("vto") ?? "").trim();

  if (!db) return { error: "missing_database" };
  if (!book) return { error: "missing_book" };
  if (!/^[1-9]\d*$/.test(chapter)) return { error: "bad_chapter" };
  if (vfrom !== "" && !/^[1-9]\d*$/.test(vfrom)) return { error: "bad_vfrom" };
  if (vto !== "" && !/^[1-9]\d*$/.test(vto)) return { error: "bad_vto" };

  const icons = formData.get("showicons") === "on" ? "?icons=on" : "";
  if (vfrom === "") redirect(`/text/${db}/${book}/${chapter}${icons}`);
  if (vto === "") redirect(`/text/${db}/${book}/${chapter}/${vfrom}${icons}`);
  redirect(`/text/${db}/${book}/${chapter}/${vfrom}/${vto}${icons}`);
}
