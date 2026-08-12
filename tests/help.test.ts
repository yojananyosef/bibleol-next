import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import {
  USERSGUIDE_DIR,
  evaluateArticle,
  helpMenu,
  helpNavigatorHtml,
  resolveHelpArticle,
} from "../src/lib/services/help.ts";

const opts = (subArticle: string | null = null) => ({ subArticle, dir: "usersguide/en", siteUrl: "/" });

test("resolveHelpArticle: intro y fallback a en", () => {
  const r1 = resolveHelpArticle("en", "intro");
  assert.equal(r1.article, "intro");
  assert.equal(r1.subArticle, null);
  assert.equal(r1.dir, "usersguide/en");
  const r2 = resolveHelpArticle("da", "viewing_text2/gr");
  assert.equal(r2.article, "viewing_text2");
  assert.equal(r2.subArticle, "gr");
  assert.equal(r2.dir, "usersguide/en");
  assert.throws(() => resolveHelpArticle("en", "no_such_article"), /no help article named 'no_such_article'/);
});

test("evaluateArticle: $hg, heb_gr, img, version marker", () => {
  const src =
    '<? version: 20250701 ?><p>To see <?= $hdir->heb_gr("Hebrew text","Greek text") ?>';
  assert.equal(
    evaluateArticle('<?php $hg = $hdir->heb_gr("Hebrew","Greek") ?>X<?= $hg ?><?= $hg ?>', opts("gr")),
    "XGreekGreek",
  );
  assert.ok(evaluateArticle(src, opts("heb")).includes("Hebrew text"));
  assert.ok(evaluateArticle(src, opts("gr")).includes("Greek text"));
  assert.ok(!evaluateArticle(src, opts(null)).includes("Hebrew text"));
});

test("evaluateArticle: img genera el enlace a usersguide/{lang}/images", () => {
  const out = evaluateArticle('<?= $hdir->img("pic.png") ?>', opts());
  assert.ok(out.includes('href="/usersguide/en/images/pic.png"'));
  assert.ok(out.includes('src="/usersguide/en/images/pic.png"'));
  assert.ok(out.includes('target="_blank"'));
});

test("evaluateArticle: if/else/endif sobre sub_article", () => {
  const src = "A<?php if ($sub_article=='heb'): ?>HEB<?php else: ?>GR<?php endif; ?>Z";
  assert.equal(evaluateArticle(src, opts("heb")), "AHEBZ");
  assert.equal(evaluateArticle(src, opts("gr")), "AGRZ");
  assert.equal(evaluateArticle(src, opts(null)), "AGRZ");
});

test("evaluateArticle: help_anchor y anchor con atributos", () => {
  const out = evaluateArticle(
    '<?= help_anchor("link_icons","&ldquo;Link icons&rdquo;.") ?><?= help_anchor("viewing_text2/" . $hdir->heb_gr("heb","gr"), "text") ?><?= anchor("https://emdros.org","Emdros",[\'target\'=>\'_blank\']) ?>',
    opts("gr"),
  );
  assert.ok(out.includes('href="/help/link_icons"'));
  assert.ok(out.includes('href="/help/viewing_text2/gr"'));
  assert.ok(out.includes('href="https://emdros.org"'));
  assert.ok(out.includes('target="_blank"'));
});

test("evaluateArticle: make_footnote y variable interpolada en comillas dobles", () => {
  const src =
    '<?php $hg = $hdir->heb_gr("Hebrew","Greek") ?><?= make_footnote("$hg","Nota") ?><?= $hdir->img("$sub_article-x.png") ?>';
  const out = evaluateArticle(src, opts("heb"));
  assert.ok(out.includes('<a href="#" data-toggle="tooltip" title="Nota">Hebrew</a>'));
  assert.ok(out.includes("/images/heb-x.png"));
});

test("evaluateArticle: bloque email ofuscado (AU_qualifier_hebrew)", () => {
  const src = `<?php
    $email = "otst@andrews.edu";
    $linkText = "(email)";
    $encodedEmail = '';
    for ($i = 0; $i < strlen($email); $i++) {
      $encodedEmail .= "&#" . ord($email[$i]) . ";";
    }
    echo '<a href="mailto:' . $encodedEmail . '">' . htmlspecialchars($linkText) . '</a>';
  ?>`;
  assert.equal(evaluateArticle(src, opts()), '<a href="mailto:otst@andrews.edu">(email)</a>');
});

test("evaluateArticle: get_dir() sin argumentos", () => {
  assert.equal(evaluateArticle('<?= $hdir->get_dir() ?>', opts()), "/usersguide/en");
});

test("todos los artículos del usersguide evaluan para heb/gr/if/null", () => {
  const dir = `${USERSGUIDE_DIR}/en`;
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith(".php"));
  assert.ok(files.length >= 50, `usersguide/en tiene ${files.length} artículos`);
  for (const f of files) {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    for (const sub of [null, "heb", "gr", "if"]) {
      assert.doesNotThrow(() => evaluateArticle(src, opts(sub)), `${f} sub=${sub}`);
    }
  }
});

test("helpNavigatorHtml: sección actual abierta y enlaces a /help", () => {
  const out = helpNavigatorHtml("tr_ifgr/gr");
  assert.ok(out.includes('href="/help/tr_ifgr/if"'));
  assert.ok(out.includes("Grammar translation"));
  assert.ok(out.includes("<details class=\"help-nav-group\" open>"));
  assert.ok(Object.keys(helpMenu).length >= 5);
});

test("evaluateArticle: constructor desconocido lanza", () => {
  assert.throws(() => evaluateArticle("<? $nonsense() ?>", opts()), /Unsupported/);
});