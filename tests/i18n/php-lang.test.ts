import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLangFile, parseCommentFile } from "../../src/lib/i18n/php-lang.ts";

test("parseLangFile: asignación simple con comillas dobles escapadas", () => {
  const php = `<?php\n$lang['login'] = "Log in";\n$lang['quote'] = "He said \\"hello\\"";\n`;
  const out = parseLangFile(php);
  assert.equal(out["login"], "Log in");
  assert.equal(out["quote"], 'He said "hello"');
});

test("parseLangFile: concatenación multilínea con .", () => {
  const php = `<?php\n$lang['desc'] = "Línea uno\\n"\n        . "línea dos\\n"\n        . "y tres";\n`;
  const out = parseLangFile(php);
  assert.equal(out["desc"], "Línea uno\nlínea dos\ny tres");
});

test("parseLangFile: ignora otras variables e interpola \\$ como literal", () => {
  const php = `<?php\n$lang['price'] = "Coste \\$5";\n$foo['x'] = "no";\n`;
  const out = parseLangFile(php);
  assert.equal(out["price"], "Coste $5");
  assert.equal(out["x"], undefined);
});

test("parseLangFile: texto con ; y <ul> en una sola línea (js_lang)", () => {
  const php = `<?php\n$lang['html'] = "<ul><li>a;</li><li>b;</li></ul>";\n`;
  const out = parseLangFile(php);
  assert.equal(out["html"], "<ul><li>a;</li><li>b;</li></ul>");
});

test("parseCommentFile: comment/format/use_textarea", () => {
  const php = `<?php\n$comment['k1'] = "ayuda";\n$format['k1'] = "";\n$use_textarea['k1'] = false;\n$use_textarea['k2'] = true;\n`;
  const { comment, format, use_textarea } = parseCommentFile(php);
  assert.equal(comment["k1"], "ayuda");
  assert.equal(format["k1"], "");
  assert.equal(use_textarea["k1"], false);
  assert.equal(use_textarea["k2"], true);
});
