import { NextResponse } from "next/server";
import { currentUserOrDummy, sessionLanguage } from "@/lib/auth/guards";
import * as users from "@/lib/services/users";
import { langLine } from "@/lib/i18n/loader";
import { decodeMql, type ShebanqReply } from "@/lib/services/shebanq";

export const dynamic = "force-dynamic";

/** Ctrl_shebanq::import_shebanq — JSON {error, sentence_mql, sentence_unit, sentence_unit_mql}. */
export async function GET(request: Request) {
  const reply: ShebanqReply = { error: null, sentence_mql: null, sentence_unit: null, sentence_unit_mql: null };
  const lang = await sessionLanguage();
  const line = (group: string, key: string) => langLine(lang, group, key);

  try {
    const me = await currentUserOrDummy();
    if (!users.isLoggedIn(me)) throw new Error(line("common", "must_be_logged_in"));
    if (!users.isTeacher(me)) throw new Error(line("common", "must_be_teacher"));

    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const version = url.searchParams.get("version") ?? "";
    if (!/^\d+$/.test(id)) throw new Error(line("shebanq", "missing_shebanq_id"));
    if (!version) throw new Error(line("shebanq", "missing_shebanq_version"));

    const res = await fetch(`https://shebanq.ancient-data.org/hebrew/query.json?id=${id}`, {
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();

    if (data.good) {
      const mql = data?.data?.versions?.[version]?.mql;
      if (mql === undefined) throw new Error(line("shebanq", "version_does_not_exist").replace("%s", version));
      decodeMql(mql, reply);
    } else {
      let message = line("shebanq", "shebanq_error");
      const serverMsg = data?.msg?.[0] ?? "";
      const m = /^No query with id ([0-9]+)$/.exec(serverMsg);
      if (m) message += " " + line("shebanq", "no_query_with_id").replace("%s", m[1]);
      else message += " " + serverMsg;
      throw new Error(message);
    }
  } catch (e) {
    reply.error = e instanceof Error ? (e.message === "shebanq_malformed_quotes" ? line("shebanq", "shebanq_malformed_quotes") : e.message) : String(e);
  }

  return NextResponse.json(reply);
}
