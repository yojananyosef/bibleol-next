import { openCorpusDb } from "../src/lib/db/sqlite.ts";
import { openEmdros } from "../src/lib/corpus/emdros-schema.ts";
import { createMql, MqlError } from "../src/lib/corpus/mql.ts";
import { TypeInfo } from "../src/lib/corpus/db-config.ts";

function main() {
  const dbname = process.argv[2];
  if (!dbname) {
    console.log("Usage: node scripts/maketypeinfo.ts <databasename>");
    process.exit(1);
  }
  const db = openCorpusDb(dbname);
  try {
    const mql = createMql(openEmdros(db, dbname));
    console.log(JSON.stringify(TypeInfo.fromMql(mql)));
  } catch (e) {
    if (e instanceof MqlError) {
      if (e.db_error) console.log(`MQL database error:\n${e.db_error}`);
      else console.log(`MQL compiler error:\n${e.compiler_error}`);
    } else {
      throw e;
    }
  } finally {
    db.close();
  }
}

main();