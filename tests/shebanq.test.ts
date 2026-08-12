import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeMql, replaceInQuotes, type ShebanqReply } from "../src/lib/services/shebanq.ts";
import { DataException } from "../src/lib/errors.ts";

const reply = (): ShebanqReply => ({ error: null, sentence_mql: null, sentence_unit: null, sentence_unit_mql: null });

test("decodeMql: FOCUS → NORETRIEVE y extrae la unidad de frase", () => {
  const r = reply();
  decodeMql("[clause FOCUS book=1 chapter=2]\n  [word lex_utf8='and']", r);
  // (el doble espacio tras NORETRIEVE es comportamiento exacto del preg_replace PHP)
  assert.equal(r.sentence_mql, "[clause NORETRIEVE  book=1 chapter=2]   [word lex_utf8='and']");
  assert.equal(r.sentence_unit, "clause");
  assert.equal(r.sentence_unit_mql, "book=1 chapter=2");
});

test("decodeMql: sin FOCUS la unidad queda null", () => {
  const r = reply();
  decodeMql("[clause book=1]", r);
  assert.equal(r.sentence_mql, "[clause NORETRIEVE book=1]");
  assert.equal(r.sentence_unit, null);
  assert.equal(r.sentence_unit_mql, null);
});

test("decodeMql: quita comentarios y salta hasta el primer [", () => {
  const r = reply();
  decodeMql("// comment\nselect [word FOCUS lex_utf8='[literal']", r);
  assert.equal(r.sentence_mql, "[word NORETRIEVE  lex_utf8='[literal']");
  assert.equal(r.sentence_unit, "word");
  assert.equal(r.sentence_unit_mql, "lex_utf8='[literal'");
});

test("decodeMql: usa el último bloque con FOCUS", () => {
  const r = reply();
  decodeMql("[clause FOCUS book=1] [clause FOCUS book=2]", r);
  assert.equal(r.sentence_unit, "clause");
  assert.equal(r.sentence_unit_mql, "book=2");
});

test("decodeMql: null no toca la respuesta", () => {
  const r = reply();
  decodeMql(null, r);
  assert.deepEqual(r, reply());
});

test("replaceInQuotes: sustituye dentro de comillas, no fuera", () => {
  assert.equal(replaceInQuotes("]", "[a=']']", "ZZQQ"), "[a='ZZQQ']");
  assert.equal(replaceInQuotes("]", "[a=1]", "ZZQQ"), "[a=1]");
  assert.throws(() => replaceInQuotes("]", "['\"]", "ZZQQ"), DataException);
});
