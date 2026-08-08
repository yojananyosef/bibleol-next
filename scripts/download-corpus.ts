import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";

const LEGACY_DB_DIR = "/home/j/dev/BibleOL/db";
const CORPUS_DIR = join(process.cwd(), "data", "corpus");

const CORPORA = ["ETCBC4", "nestle1904", "jvulgate"];

async function download(url: string, dest: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} para ${url}`);
  const tmp = `${dest}.tmp`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
  await rename(tmp, dest);
}

async function main() {
  await mkdir(CORPUS_DIR, { recursive: true });

  for (const name of CORPORA) {
    const locationFile = join(LEGACY_DB_DIR, `${name}.location`);
    const dest = join(CORPUS_DIR, name);

    const location = (await readFile(locationFile, "utf8")).trim().replace("dl=0", "dl=1");
    const basename = location.split("/").pop()?.split("?")[0] ?? `${name}.db`;

    try {
      const existing = await stat(dest);
      if (existing.size > 0) {
        console.log(`✓ ${name} ya existe (${(existing.size / 1e6).toFixed(1)} MB) — omitiendo`);
        continue;
      }
    } catch {
      // no existe: descargar
    }

    console.log(`Descargando ${name} (${basename})…`);
    await download(location, dest);
    const s = await stat(dest);
    console.log(`✓ ${name}: ${(s.size / 1e6).toFixed(1)} MB`);
  }
  console.log("Corpus listos en", CORPUS_DIR);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
