import { redirect } from "next/navigation";
import { checkTranslator } from "@/lib/auth/guards";

/** Ctrl_translate::index → translate_if. */
export default async function TranslateIndexPage() {
  await checkTranslator();
  redirect("/translate/if");
}
