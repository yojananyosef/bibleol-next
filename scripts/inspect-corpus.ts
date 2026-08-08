import Database from "better-sqlite3";

const db = new Database(process.argv[2], { readonly: true });

const cols = db.prepare("SELECT name FROM pragma_table_info('book_objects')").all();
console.log("book cols:", cols.map((c) => (c as { name: string }).name).join(","));
const b = db.prepare("SELECT * FROM book_objects ORDER BY first_monad LIMIT 3").all();
console.log("books:", JSON.stringify(b, null, 1));

const vcols = db.prepare("SELECT name FROM pragma_table_info('verse_objects')").all();
console.log("verse cols:", vcols.map((c) => (c as { name: string }).name).join(","));
const v = db.prepare("SELECT * FROM verse_objects WHERE first_monad BETWEEN 1 AND 10 ORDER BY first_monad LIMIT 3").all();
console.log("verses monads 1-10:", JSON.stringify(v, null, 1));

const c = db.prepare("SELECT object_id_d, first_monad, last_monad, monads, mdf_number, mdf_sequence_number FROM clause_objects WHERE first_monad <= 20 AND last_monad >= 1 ORDER BY first_monad LIMIT 3").all();
console.log("clauses en monads 1-20:", JSON.stringify(c, null, 1));

const w = db.prepare("SELECT object_id_d, first_monad, monads, mdf_g_word_utf8, mdf_sp, mdf_gn, mdf_nu FROM word_objects WHERE first_monad BETWEEN 1 AND 10 ORDER BY first_monad").all();
console.log("words 1-10 (int features):", JSON.stringify(w, null, 1));

const gw = db.prepare("SELECT id_d, string_value FROM word_mdf_g_word_utf8_set WHERE id_d IN (1,2,3)").all();
console.log("g_word_utf8_set:", JSON.stringify(gw));
const sp = db.prepare("SELECT enum_value_name FROM enumeration_constants WHERE enum_id=786432 AND value IN (1,2,5)").all();
console.log("sp names:", JSON.stringify(sp));

const p = db.prepare(`SELECT w.object_id_d wid, w.first_monad monad, w.mdf_g_word_utf8, gws.string_value word_utf8, w.mdf_lex, lxs.string_value lex,
  w.mdf_functional_parent fparent, w.mdf_distributional_parent dparent
  FROM word_objects w
  JOIN word_mdf_g_word_utf8_set gws ON gws.id_d = w.mdf_g_word_utf8
  JOIN word_mdf_lex_set lxs ON lxs.id_d = w.mdf_lex
  WHERE w.first_monad BETWEEN 1 AND 10 ORDER BY w.first_monad`).all();
console.log("Gn1:1-10 words:", JSON.stringify(p, null, 1));

db.close();
