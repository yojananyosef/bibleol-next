import { getAppDb } from "../src/lib/db/sqlite.ts";
import { buildRefsBatch, buildUrlsBatch, rebuildPicTables } from "../src/lib/services/pic2db.ts";

type JsonRefs = Record<string, number[]>;
type JsonUrls = Record<string, [string, string][]>;

async function main() {
  const refsUrl = "https://resources.learner.bible/jsonrefs.php";
  const urlsUrl = "https://resources.learner.bible/jsonurls.php";

  const refsRes = await fetch(refsUrl);
  if (!refsRes.ok) throw new Error(`HTTP ${refsRes.status} para ${refsUrl}`);
  const biblerefs = (await refsRes.json()) as JsonRefs;

  const urlsRes = await fetch(urlsUrl);
  if (!urlsRes.ok) throw new Error(`HTTP ${urlsRes.status} para ${urlsUrl}`);
  const bibleurls = (await urlsRes.json()) as JsonUrls;

  const refs = buildRefsBatch(biblerefs);
  const urls = buildUrlsBatch(bibleurls);
  console.log(`bible_refs: ${refs.length} filas, bible_urls: ${urls.length} filas`);

  rebuildPicTables(getAppDb(), biblerefs, bibleurls);
  console.log("Done");
}

main().catch((e: unknown) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});