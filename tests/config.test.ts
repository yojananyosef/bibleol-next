import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";

// Import dinámico: BIBLEOL_DATA_DIR debe estar fijado ANTES de cargar db/sqlite.ts
process.env.BIBLEOL_DATA_DIR = mkdtempSync(path.join(tmpdir(), "bibleol-config-test-"));

import type * as Sqlite from "../src/lib/db/sqlite.ts";
import type * as Config from "../src/lib/services/config.ts";
import type { buildFontCss as buildFontCssFn } from "../src/lib/reader/font-css.ts";

let db: Database.Database;
let modSqlite: typeof Sqlite;
let modConfig: typeof Config;
let buildFontCss: typeof buildFontCssFn;

before(async () => {
  modSqlite = await import("../src/lib/db/sqlite.ts");
  modConfig = await import("../src/lib/services/config.ts");
  ({ buildFontCss } = await import("../src/lib/reader/font-css.ts"));
  db = modSqlite.getAppDb();
});

after(() => {
  db.close();
});

test("alphabets: 4 alfabetos 1:1 (hebrew, hebrew_translit, greek, latin)", () => {
  const alphas = modConfig.alphabets();
  assert.deepEqual(
    alphas.map((a) => a.name),
    ["hebrew", "hebrew_translit", "greek", "latin"],
  );
  assert.equal(alphas[0].direction, "rtl");
});

test("font_setting: default de user_id=0 (Ezra SIL para hebrew)", () => {
  const fs = modConfig.fontSetting("hebrew", 0);
  assert.equal(fs.font_family, "Ezra SIL Webfont, Times New Roman, Serif");
  assert.equal(fs.text_size, 19);
  assert.equal(fs.name, "hebrew");
});

test("font_setting: preferencia de usuario con fallback al default", () => {
  const uid = db.prepare("INSERT INTO bol_user (first_name,last_name,username,password,isadmin,created_time,preflang) VALUES ('A','B','fontuser','x',0,0,'en')").run().lastInsertRowid as number;
  // sin fila propia → fallback a user_id=0
  assert.equal(modConfig.fontSetting("greek", uid).font_family, "Gentium Plus Webfont, Times New Roman, serif");
  modConfig.setFont(uid, { hebrewchoice: "hebrew_1" });
  assert.equal(modConfig.fontSetting("hebrew", uid).font_family, "Frank Ruehl CLM Webfont");
  db.prepare("DELETE FROM bol_font WHERE user_id=?").run(uid);
  db.prepare("DELETE FROM bol_user WHERE id=?").run(uid);
});

test("set_font: guarda los 4 alfabetos con estilos (bold/italic/size)", () => {
  const uid = db.prepare("INSERT INTO bol_user (first_name,last_name,username,password,isadmin,created_time,preflang) VALUES ('A','B','fontuser2','x',0,0,'en')").run().lastInsertRowid as number;
  modConfig.setFont(uid, {
    hebrewchoice: "hebrew_2",
    hebrewtextsize: "20",
    hebrewtextbold: "on",
    hebrewtextitalic: "on",
    hebrewfeaturesize: "12",
    greekchoice: "greek_1",
    greekfeaturesize: "13",
    latinchoice: "latin_none",
    hebrew_translitchoice: "hebrew_translit_mine",
    hebrew_translit_myfont: "My Personal Font",
  });
  const hebrew = modConfig.fontSetting("hebrew", uid);
  assert.equal(hebrew.font_family, "David CLM Webfont");
  assert.equal(hebrew.text_size, 20);
  assert.equal(hebrew.text_bold, 1);
  assert.equal(hebrew.text_italic, 1);
  assert.equal(hebrew.feature_size, 12);
  assert.equal(modConfig.fontSetting("greek", uid).feature_size, 13);
  // latin_none → conserva el valor actual (default Titillium)
  assert.equal(modConfig.fontSetting("latin", uid).font_family, "Titillium, Segoe UI, Arial, sans-serif");
  // fuente personal
  assert.equal(modConfig.personalFont("hebrew_translit", uid), "My Personal Font");
  assert.equal(modConfig.fontSetting("hebrew_translit", uid).font_family, "My Personal Font");
  db.prepare("DELETE FROM bol_font WHERE user_id=?").run(uid);
  db.prepare("DELETE FROM bol_personal_font WHERE user_id=?").run(uid);
  db.prepare("DELETE FROM bol_user WHERE id=?").run(uid);
});

test("get_radio_button_value: índice / mine / none", () => {
  const avail = modConfig.availFonts("hebrew");
  assert.equal(modConfig.getRadioButtonValue("Ezra SIL Webfont", avail, ""), "0");
  assert.equal(modConfig.getRadioButtonValue("David CLM Webfont", avail, "David CLM Webfont"), "2");
  assert.equal(modConfig.getRadioButtonValue("My Font", avail, "My Font"), "mine");
  assert.equal(modConfig.getRadioButtonValue("My Font", avail, "Other"), "none");
});

test("font_selection: del usuario si existe, si no defaults de user_id=0", () => {
  const uid = db.prepare("INSERT INTO bol_user (first_name,last_name,username,password,isadmin,created_time,preflang) VALUES ('A','B','fontuser3','x',0,0,'en')").run().lastInsertRowid as number;
  const defaults = modConfig.fontSelection(0);
  assert.equal(defaults.length, 4);
  assert.equal(defaults[0].name, "hebrew");
  assert.equal(defaults[0].font_family, "Ezra SIL Webfont, Times New Roman, Serif");
  // usuario sin preferencias → defaults
  assert.deepEqual(modConfig.fontSelection(uid).map((f) => f.font_family), defaults.map((f) => f.font_family));
  modConfig.setFont(uid, { hebrewchoice: "hebrew_1", greekchoice: "greek_1" });
  const mine = modConfig.fontSelection(uid);
  assert.equal(mine.length, 4);
  assert.equal(mine[0].font_family, "Frank Ruehl CLM Webfont");
  assert.equal(mine[2].font_family, "Gentium Plus Webfont");
  db.prepare("DELETE FROM bol_font WHERE user_id=?").run(uid);
  db.prepare("DELETE FROM bol_personal_font WHERE user_id=?").run(uid);
  db.prepare("DELETE FROM bol_user WHERE id=?").run(uid);
});

test("buildFontCss: clases .hebrew/.greek con font-family, direction y tamaños", () => {
  const css = buildFontCss(modConfig.fontSelection(0));
  assert.match(css, /\.hebrew \{\n  font-family: Ezra SIL Webfont, Times New Roman, Serif !important;\n  direction: rtl;\n  text-align: right;/);
  assert.match(css, /\.textdisplay\.hebrew \{\n  font-size: 19pt;/);
  assert.match(css, /\.greek \{\n  font-family: Gentium Plus Webfont, Times New Roman, serif !important;\n  direction: ltr;/);
  assert.match(css, /\.textdisplay\.greek \{\n  font-size: 16pt;/);
  assert.match(css, /font-weight: normal;\n  font-style: normal;/);
  // solo reglas de alfabetos presentes
  assert.match(css, /#virtualKeyboard\.HE div\.kbButton span/);
  assert.match(css, /#virtualKeyboard\.EL div\.kbButton span/);
});

test("buildFontCss: estilos bold/italic del usuario", () => {
  const uid = db.prepare("INSERT INTO bol_user (first_name,last_name,username,password,isadmin,created_time,preflang) VALUES ('A','B','fontuser4','x',0,0,'en')").run().lastInsertRowid as number;
  modConfig.setFont(uid, { hebrewchoice: "hebrew_0", hebrewtextsize: "19", hebrewtextbold: "on", hebrewtooltipsize: "14", hebrewtooltipitalic: "on", hebrewfeaturesize: "9" });
  const css = buildFontCss(modConfig.fontSelection(uid));
  assert.match(css, /\.textdisplay\.hebrew \{\n  font-size: 19pt;\n\n  font-weight: bold;\n  font-style: normal;/);
  assert.match(css, /\.bol-tooltip\.hebrew \{\n  font-size: 14pt;\n\n  font-weight: normal;\n  font-style: italic;/);
  assert.match(css, /select\.hebrew,\n\.wordgrammar\.hebrew, #quiztab td\.hebrew\{\n  font-size: 9pt;\n\n  font-weight: normal;/);
  db.prepare("DELETE FROM bol_font WHERE user_id=?").run(uid);
  db.prepare("DELETE FROM bol_personal_font WHERE user_id=?").run(uid);
  db.prepare("DELETE FROM bol_user WHERE id=?").run(uid);
});
