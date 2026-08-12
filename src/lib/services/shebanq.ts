/** services/shebanq.ts — Port de Ctrl_shebanq::decode_mql (1:1). */

import { DataException } from "../errors.ts";

export interface ShebanqReply {
  error: string | null;
  sentence_mql: string | null;
  sentence_unit: string | null;
  sentence_unit_mql: string | null;
}

/** replace_in_quotes: sustituye `needle` solo fuera de comillas simples/dobles. */
export function replaceInQuotes(needle: string, haystack: string, replacement: string): string {
  let stringDel = "";
  let res = "";
  for (let i = 0; i < haystack.length; ++i) {
    const ch = haystack[i];
    if (ch === "'" || ch === '"') {
      if (stringDel === ch) stringDel = "";
      else if (stringDel === "") stringDel = ch;
      else throw new DataException("shebanq_malformed_quotes");
      res += ch;
    } else if (ch === needle) {
      res += stringDel === "" ? ch : replacement;
    } else {
      res += ch;
    }
  }
  return res;
}

/** decode_mql: convierte el MQL de SHEBANQ en selección de frases y unidades. */
export function decodeMql(request: string | null, reply: ShebanqReply): void {
  if (request) {
    let txt = request.replace(/\/\/.*$/gm, "");
    txt = txt.replace(/\n/g, " ");
    txt = txt.replace(/^[^\[]*/, "");

    reply.sentence_mql = txt.replace(/^\[ *([\w]+) *(FOCUS)?/i, "[$1 NORETRIEVE ");

    let txt2 = replaceInQuotes("]", txt, "ZZQQ");
    txt2 = replaceInQuotes("[", txt2, "ZZWW");

    const qo = /.*\[ *([\w]+) *FOCUS *([^\[\]]*)[\[\]].*/i.exec(txt2);
    if (qo) {
      reply.sentence_unit = qo[1];
      reply.sentence_unit_mql = qo[2].replace(/ZZQQ/g, "]").replace(/ZZWW/g, "[");
    }
  }
}
