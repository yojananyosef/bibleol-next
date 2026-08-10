import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { harvest, featHandToMql, sentenceSelectorMql } from "../../src/lib/quiz/template-parser.ts";

const DEMO_DIR = "/home/j/dev/BibleOL/quiz_templates/ETCBC4/demo";

for (const file of readdirSync(DEMO_DIR).filter((f) => f.endsWith(".3et"))) {
  test(`harvest counts files: ${file}`, () => {
    const xml = readFileSync(path.join(DEMO_DIR, file), "utf8");
    const tpl = harvest(xml);
    assert.ok(tpl.desc.length > 0);
    assert.equal(tpl.database, "ETCBC4");
    assert.ok(tpl.selectedPaths.length > 0);
  });
  test(`sentence MQL: ${file}`, () => {
    const xml = readFileSync(path.join(DEMO_DIR, file), "utf8");
    const tpl = harvest(xml);
    const mql = sentenceSelectorMql(tpl.sentenceSelection);
    assert.ok(mql.startsWith("["), `MQL: ${mql}`);
    assert.ok(mql.includes("NORETRIEVE"), `MQL: ${mql}`);
  });
}

test("stem.3et: sentence featHand MQL", () => {
  const xml = readFileSync(path.join(DEMO_DIR, "stem.3et"), "utf8");
  const tpl = harvest(xml);
  assert.equal(featHandToMql(tpl.sentenceSelection.featHand), "NOT vs IN (NA,qal)");
});

test("number_state.3et: quizFeatures", () => {
  const xml = readFileSync(path.join(DEMO_DIR, "number_state.3et"), "utf8");
  const tpl = harvest(xml);
  assert.deepEqual(tpl.quizFeatures.showFeatures, ["g_voc_lex_utf8_variant", "nu", "gn", "st"]);
  assert.deepEqual(
    tpl.quizFeatures.requestFeatures.map((r) => ({ name: r.name, usedropdown: r.usedropdown, hideFeatures: r.hideFeatures })),
    [{ name: "g_word_nocant_utf8", usedropdown: false, hideFeatures: null }]
  );
  assert.equal(tpl.maylocate, true);
  assert.equal(tpl.fixedquestions, 0);
  assert.equal(tpl.randomize, true);
  assert.equal(sentenceSelectorMql(tpl.sentenceSelection), '[word NORETRIEVE st IN (c) AND sp IN (subs) AND suffix_gender IN (absent)]');
  assert.equal(featHandToMql(tpl.quizObjectSelection.featHand), 'sp IN (subs) AND suffix_gender IN (absent)');
});

test("useForQo clones sentenceSelection", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<questiontemplate version="6">
  <desc>test</desc>
  <database>ETCBC4</database>
  <properties>ETCBC4</properties>
  <sentenceselection version="1">
    <questionobject>word</questionobject>
    <featurehandlers version="2">
      <enumfeature version="1"><name>sp</name><comparator>equals</comparator><value>verb</value></enumfeature>
    </featurehandlers>
    <useforquizobjects>true</useforquizobjects>
  </sentenceselection>
  <quizfeatures version="3">
    <show>g_lex</show>
  </quizfeatures>
</questiontemplate>`;
  const tpl = harvest(xml);
  assert.equal(tpl.sentenceSelection.useForQo, true);
  assert.equal(tpl.quizObjectSelection.object, "word");
  assert.equal(tpl.quizObjectSelection.featHand.length, 1);
  assert.equal(tpl.quizObjectSelection.useForQo, undefined);
  assert.equal(tpl.properties, "ETCBC4");
});

test("properties fallback to database", () => {
  const xml = `<questiontemplate version="6"><database>ETCBC4</database></questiontemplate>`;
  const tpl = harvest(xml);
  assert.equal(tpl.properties, "ETCBC4");
});

test("qerefeature & rangeintegerfeature MQL", () => {
  const xml = `<?xml version="1.0"?>
<questiontemplate version="6">
  <database>ETCBC4</database>
  <sentenceselection version="1">
    <questionobject>word</questionobject>
    <featurehandlers version="2">
      <qerefeature version="1"><name>g_qere</name><value>true</value></qerefeature>
      <rangeintegerfeature version="1"><name>monad</name><comparator>gte</comparator><valuelow>10</valuelow><valuehigh>20</valuehigh></rangeintegerfeature>
    </featurehandlers>
  </sentenceselection>
</questiontemplate>`;
  const tpl = harvest(xml);
  assert.equal(
    featHandToMql(tpl.sentenceSelection.featHand),
    "(g_qere='' AND g_word_translit<>'HÎʔ') AND (monad>=10 AND monad<=20)"
  );
});

test("enumlistfeature MQL", () => {
  const xml = `<?xml version="1.0"?>
<questiontemplate version="6">
  <database>ETCBC4</database>
  <sentenceselection version="1">
    <questionobject>phrase</questionobject>
    <featurehandlers version="2">
      <enumlistfeature version="1">
        <name>kind</name>
        <listvalues>
          <yes>cjn</yes>
          <no>cjnx</no>
        </listvalues>
      </enumlistfeature>
    </featurehandlers>
  </sentenceselection>
</questiontemplate>`;
  const tpl = harvest(xml);
  assert.equal(featHandToMql(tpl.sentenceSelection.featHand), "((kind HAS cjn AND NOT kind HAS cjnx))");
});