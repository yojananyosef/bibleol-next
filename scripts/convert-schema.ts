import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const SRC = "/home/j/dev/BibleOL/bolsetup.sql";
const OUT = join(process.cwd(), "db", "schema.sqlite.sql");

type CreateInfo = { name: string; sql: string; indexes: string[] };

function convertColumn(line: string): string {
  return line
    .replace(/\s+int\s+NOT NULL AUTO_INCREMENT/i, " INTEGER NOT NULL")
    .replace(/\s+int\s+/gi, " INTEGER ")
    .replace(/\s+tinyint\(1\)\s*/gi, " INTEGER ")
    .replace(/\s+tinyint\s+/gi, " INTEGER ")
    .replace(/\s+mediumtext\s+/gi, " TEXT ")
    .replace(/\s+longtext\s+/gi, " TEXT ")
    .replace(/\s+tinytext\s+/gi, " TEXT ")
    .replace(/\s+text\s+/gi, " TEXT ")
    .replace(/\s+varchar\(\d+\)\s*/gi, " TEXT ")
    .replace(/\s+enum\([^)]*\)\s*/gi, " TEXT ")
    .replace(/\s+date\s+/gi, " TEXT ")
    .replace(/\s+CHARACTER SET \w+ COLLATE \w+/gi, "")
    .replace(/\s+COMMENT\s+'[^']*'/gi, "")
    .replace(/,\s*$/, "");
}

function convertCreate(block: string): CreateInfo {
  const nameMatch = block.match(/CREATE TABLE `(\w+)`/);
  if (!nameMatch) throw new Error("CREATE TABLE sin nombre: " + block.slice(0, 80));
  const name = nameMatch[1];
  const indexes: string[] = [];

  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const body: string[] = [];

  for (const raw of lines) {
    if (/^(DROP TABLE|CREATE TABLE|\) ENGINE)/.test(raw)) continue;
    const line = raw.replace(/;$/, "").replace(/,\s*$/, "");

    const keyMatch = line.match(/^KEY `(\w+)` \(([^)]+)\)/);
    if (keyMatch) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS idx_${name}_${keyMatch[1]} ON \`${name}\` (${keyMatch[2].replace(/`/g, "")});`
      );
      continue;
    }

    const fkMatch = line.match(/^CONSTRAINT `\w+` (FOREIGN KEY.*)$/);
    if (fkMatch) {
      body.push(fkMatch[1]);
      continue;
    }

    if (/^PRIMARY KEY /.test(line)) {
      body.push(line);
      continue;
    }

    body.push(convertColumn(line));
  }

  const last = body.pop() ?? "";
  const sql =
    "CREATE TABLE `" + name + "` (\n  " + body.join(",\n  ") + (body.length ? ",\n  " : "") + last + "\n);";
  return { name, sql, indexes };
}

async function main() {
  const sql = await readFile(SRC, "utf8").then((s) =>
    s.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  );

  const createTables: CreateInfo[] = [];
  const seedInserts: string[] = [];
  const ddlBlocks: string[] = [];

  const re =
    /(DROP TABLE IF EXISTS `[\w]+`;[\s\S]*?(?:CREATE TABLE `[\w]+`\s*\([\s\S]*?\) ENGINE[^;]*;))|(LOCK TABLES[\s\S]*?UNLOCK TABLES;)|(INSERT INTO `[\w]+`[\s\S]*?;)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const [, createBlock, lockBlock, insertBlock] = m;
    if (createBlock) {
      const info = convertCreate(createBlock);
      createTables.push(info);
      ddlBlocks.push(info.sql, ...info.indexes);
    } else if (lockBlock) {
      const inner = lockBlock.match(/INSERT INTO `[\w]+`[\s\S]*?;/);
      if (inner) seedInserts.push(inner[0]);
    } else if (insertBlock) {
      seedInserts.push(insertBlock.replace(/;\s*$/, ";"));
    }
  }

  const header = `-- Schema SQLite generado 1:1 desde bolsetup.sql (BibleOL legacy)
-- Tablas: ${createTables.map((c) => c.name).join(", ")}
`;

  await mkdir(join(process.cwd(), "db"), { recursive: true });
  await writeFile(OUT, header + [...ddlBlocks, "", ...seedInserts, ""].join("\n"));

  const expected = [
    "bol_user","bol_grader","bol_bible_refs","bol_bible_urls","bol_class","bol_classexercise",
    "bol_exercisedir","bol_exerciseowner","bol_heb_urls","bol_language_en","bol_personal_font",
    "bol_sta_displayfeature","bol_sta_question","bol_sta_quiz","bol_sta_quiztemplate",
    "bol_sta_requestfeature","bol_sta_universe","bol_userclass","bol_userconfig","bol_alphabet",
    "bol_migrations","bol_db_localize","bol_lexicon_Aramaic","bol_lexicon_Hebrew",
    "bol_lexicon_greek","bol_lexicon_latin","bol_lexicon_latin2","bol_font",
    "bol_translation_languages","bol_exam","bol_exam_active","bol_exam_finished",
    "bol_exam_results","bol_exam_status",
  ];
  const missing = expected.filter((e) => !createTables.some((c) => c.name === e));
  if (missing.length) throw new Error("Faltan tablas: " + missing.join(", "));
  console.log(
    `OK: ${createTables.length}/34 tablas, ${seedInserts.length} bloques INSERT, ${ddlBlocks.length} bloques DDL`
  );
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
