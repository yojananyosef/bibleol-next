import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { harvest } from "../../src/lib/quiz/template-parser.ts";
import { writeQuizTemplateXml } from "../../src/lib/quiz/template-writer.ts";
import { packageTestQuiz, saveQuiz, newQuiz } from "../../src/lib/services/text-quiz.ts";

const DEMO_DIR = "/home/j/dev/BibleOL/quiz_templates/ETCBC4/demo";

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "bibleol-quiz-"));
}

test("writeQuizTemplateXml: round-trip sobre todos los .3et de ETCBC4", () => {
  for (const file of readdirSync(DEMO_DIR).filter((f) => f.endsWith(".3et"))) {
    const xml = readFileSync(path.join(DEMO_DIR, file), "utf8");
    const tpl = harvest(xml);
    const out = writeQuizTemplateXml(tpl, null);

    const reparsed = harvest(out);
    assert.equal(reparsed.desc, tpl.desc, file);
    assert.equal(reparsed.database, tpl.database, file);
    assert.equal(reparsed.properties, tpl.properties, file);
    assert.deepEqual(reparsed.selectedPaths, tpl.selectedPaths, file);
    assert.deepEqual(reparsed.quizFeatures, tpl.quizFeatures, file);
    assert.equal(reparsed.maylocate, tpl.maylocate, file);
    assert.equal(reparsed.sentbefore, tpl.sentbefore, file);
    assert.equal(reparsed.sentafter, tpl.sentafter, file);
    assert.equal(reparsed.fixedquestions, tpl.fixedquestions, file);
    assert.equal(reparsed.randomize, tpl.randomize, file);
  }
});

test("writeQuizTemplateXml: conserva MQL directo de sentenceselection", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questiontemplate version="6">
  <desc>mql directo</desc>
  <database>ETCBC4</database>
  <properties>ETCBC4</properties>
  <sentenceselection version="1">
    <questionobject>verse</questionobject>
    <mql>[verse book=Genesis AND chapter=1]</mql>
    <useforquizobjects>false</useforquizobjects>
  </sentenceselection>
  <quizobjectselection version="1">
    <questionobject>word</questionobject>
    <featurehandlers version="2">
      <enumfeature version="1"><name>sp</name><comparator>equals</comparator><value>verb</value></enumfeature>
    </featurehandlers>
  </quizobjectselection>
  <quizfeatures version="6">
    <show>lex</show>
    <request>g_cons</request>
    <requestdd>sp</requestdd>
    <dontshow>g_voc</dontshow>
    <dontshowobject>dontshow1</dontshowobject>
    <glosslimit>2</glosslimit>
  </quizfeatures>
  <maylocate>true</maylocate>
  <sentbefore>1</sentbefore>
  <sentafter>2</sentafter>
  <fixedquestions>3</fixedquestions>
  <randomize>false</randomize>
</questiontemplate>
`;
  const tpl = harvest(xml);
  const out = writeQuizTemplateXml(tpl, null);

  assert.match(out, /<desc><!\[CDATA\[mql directo\]\]><\/desc>/);
  assert.match(out, /<mql>\[verse book=Genesis AND chapter=1\]<\/mql>/);
  assert.match(out, /<useforquizobjects>false<\/useforquizobjects>/);
  assert.match(out, /<requestdd>sp<\/requestdd>/);
  assert.match(out, /<dontshowobject>dontshow1<\/dontshowobject>/);
  assert.match(out, /<sentbefore>1<\/sentbefore>/);
  assert.match(out, /<fixedquestions>3<\/fixedquestions>/);
  assert.match(out, /<randomize>false<\/randomize>/);
});

test("writeQuizTemplateXml: requestfeatures ordenadas por order_val", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questiontemplate version="6">
  <desc>x</desc>
  <database>ETCBC4</database>
  <properties>ETCBC4</properties>
  <sentenceselection version="1">
    <questionobject>verse</questionobject>
    <mql>[verse book=Genesis]</mql>
    <useforquizobjects>true</useforquizobjects>
  </sentenceselection>
  <quizfeatures version="6">
    <request>zeta</request>
    <request>alpha</request>
    <glosslimit>0</glosslimit>
  </quizfeatures>
  <maylocate>true</maylocate>
  <sentbefore>0</sentbefore>
  <sentafter>0</sentafter>
  <fixedquestions>0</fixedquestions>
  <randomize>true</randomize>
</questiontemplate>
`;
  const tpl = harvest(xml);
  tpl.quizFeatures.requestFeatures[0].order_val = 200;
  tpl.quizFeatures.requestFeatures[1].order_val = 100;
  const out = writeQuizTemplateXml(tpl, null);
  const alpha = out.indexOf("<request>alpha</request>");
  const zeta = out.indexOf("<request>zeta</request>");
  assert.ok(alpha !== -1 && zeta !== -1 && alpha < zeta, out);
});

test("packageTestQuiz/saveQuiz: escriben fichero .3et reparseable", () => {
  const xml = readFileSync(path.join(DEMO_DIR, "stem.3et"), "utf8");
  const tpl = harvest(xml);

  const dir = tmpDir();
  const file = path.join(dir, "pkg.3et");

  const res = packageTestQuiz(tpl, file);
  assert.equal(res, readFileSync(file, "utf8"));
  assert.deepEqual(harvest(res).quizFeatures, tpl.quizFeatures);

  saveQuiz(tpl, file);
  assert.deepEqual(harvest(readFileSync(file, "utf8")).quizFeatures, tpl.quizFeatures);
});

test("packageTestQuiz: lanza QuizError si no se puede escribir", () => {
  const xml = readFileSync(path.join(DEMO_DIR, "stem.3et"), "utf8");
  const tpl = harvest(xml);
  assert.throws(
    () => packageTestQuiz(tpl, "/nonexistent-dir/foo.3et"),
    (e: Error) => e.message === "cannot_write_to_quiz_file",
  );
});

test("newQuiz: JSON de plantilla por defecto de ETCBC4", () => {
  const json = newQuiz("ETCBC4");
  const tpl = JSON.parse(json);
  assert.equal(tpl.desc, "");
  assert.equal(tpl.database, "ETCBC4");
  assert.equal(tpl.properties, "ETCBC4");
  assert.deepEqual(tpl.selectedPaths, []);
  assert.equal(tpl.sentenceSelection.object, "word");
  assert.equal(tpl.sentenceSelection.useForQo, true);
  assert.equal(tpl.quizObjectSelection.object, "word");
  assert.equal(tpl.quizFeatures.glosslimit, 0);
  assert.equal(tpl.maylocate, true);
  assert.equal(tpl.randomize, true);
});
