import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const USERSGUIDE_DIR = join(process.cwd(), "data", "usersguide");

export interface HelpMenuItem {
  level: number;
  text: string;
}

export type HelpMenu = Record<string, Record<string, HelpMenuItem>>;

export const helpMenu: HelpMenu = {
  "User&rsquo;s Guide": {
    intro: { level: 0, text: "Introduction" },
    user_interface: { level: 0, text: "User interface" },
    viewing_text: { level: 0, text: "Viewing text" },
    "viewing_text2/heb": { level: 1, text: "Viewing Hebrew text" },
    "viewing_text2/gr": { level: 1, text: "Viewing Greek text" },
    logging_in: { level: 0, text: "Logging in" },
    terminology: { level: 0, text: "Terminology" },
    fontpref: { level: 0, text: "Font preferences" },
    uprof: { level: 0, text: "User profile" },
    variant: { level: 0, text: "Translation variants" },
    link_icons: { level: 0, text: "Link icons" },
  },
  "Student&rsquo;s Guide": {
    running_exercises: { level: 0, text: "Running exercises" },
    "firstex/heb": { level: 1, text: "Example: First Hebrew exercise" },
    "secondex/heb": { level: 1, text: "Example: Second Hebrew exercise" },
    "thirdex/heb": { level: 1, text: "Example: Third Hebrew exercise" },
    "firstex/gr": { level: 1, text: "Example: First Greek exercise" },
    "secondex/gr": { level: 1, text: "Example: Second Greek exercise" },
    "thirdex/gr": { level: 1, text: "Example: Third Greek exercise" },
    variations: { level: 0, text: "Variations to exercises" },
    answer_types: { level: 0, text: "Answering various types of questions" },
    shortcuts: { level: 0, text: "How to use shortcuts" },
    mystat: { level: 0, text: "How am I doing?" },
    enroll: { level: 0, text: "Class membership" },
  },
  "Teacher&rsquo;s Guide": {
    teacher: { level: 0, text: "Features for teachers" },
    usermgmt: { level: 0, text: "User management" },
    classes: { level: 0, text: "Class management" },
    folders: { level: 0, text: "Folder management" },
    exercise_mgmt: { level: 0, text: "Exercise management" },
    "create_firstex/heb": { level: 1, text: "Example: Create a simple Hebrew exercise" },
    "create_secondex/heb": { level: 1, text: "Example: Create an advanced Hebrew exercise" },
    "create_firstex/gr": { level: 1, text: "Example: Create a simple Greek exercise" },
    "create_secondex/gr": { level: 1, text: "Example: Create an advanced Greek exercise" },
    tabs: { level: 0, text: "Tabs" },
    description: { level: 1, text: "The \u201cDescription\u201d tab" },
    passages: { level: 1, text: "The \u201cPassages\u201d tab" },
    sentences: { level: 1, text: "The \u201cSentences\u201d tab" },
    mql: { level: 2, text: "MQL" },
    sentence_units: { level: 1, text: "The \u201cSentence Units\u201d tab" },
    features: { level: 1, text: "The \u201cFeatures\u201d tab" },
    studentstat: { level: 0, text: "How are my students doing?" },
    gloss_links: { level: 0, text: "Gloss links" },
  },
  "Translator&rsquo;s Guide": {
    translator: { level: 0, text: "Introduction for translators" },
    avail_trans: { level: 0, text: "Available translations" },
    "tr_ifgr/if": { level: 0, text: "Interface translation" },
    "tr_ifgr/gr": { level: 0, text: "Grammar translation" },
    tr_lex: { level: 0, text: "Lexicon translation" },
    down_lex: { level: 0, text: "Download lexicon" },
  },
  "AU Exams": {
    exam_introduction: { level: 0, text: "Introduction to Exams" },
    AU_exam_hebrewI: { level: 1, text: "Andrews University Final Exam: Hebrew I (OTST551)" },
    AU_exam_hebrewII: { level: 1, text: "Andrews University Final Exam: Hebrew II (OTST552)" },
    AU_exam_hebrewIII: { level: 1, text: "Andrews University Final Exam: Advanced Hebrew (OTST625)" },
    AU_qualifier_hebrew: { level: 1, text: "Andrews University Hebrew Placement Exam" },
    AU_exam_OTST_exegesis: { level: 1, text: "Hebrew Proficiency Exam for OTST Exegesis classes" },
    AU_exam_greek: { level: 1, text: "Andrews University Final Exam: Intermediate Greek (NTST552)" },
    AU_qualifier_greek: { level: 1, text: "Andrews University Greek Placement Exam" },
    UBS_exam_hebrew: { level: 1, text: "United Bible Society Hebrew Exam" },
    exam_location: { level: 0, text: "Where are the Exams?" },
    exam_creation: { level: 0, text: "Creating Exams" },
  },
  "TOHFL/Hebrew course": {
    tohfl_course_introduction: { level: 0, text: "Introduction to the TOHFL/Hebrew course" },
    tohfl_course_FirstStepsForStudents: { level: 1, text: "First Steps for Students" },
    tohfl_course_PerformanceAndGrades: {
      level: 1,
      text: "Taking Exercises, Exams and Looking up Grades/Performance Data",
    },
    tohfl_course_part1: { level: 0, text: "TOHFL-I course" },
    "tohfl_course_part1_final-exam": { level: 1, text: "Final Exam" },
    "tohfl_course_part2": { level: 0, text: "TOHFL-II course" },
    "tohfl_course_part2_final-exam": { level: 1, text: "Final Exam" },
    "tohfl_course_exercise-index": { level: 0, text: "TOHFL course Exercise Index" },
  },
};

export interface HelpRequest {
  article: string;
  subArticle: string | null;
  dir: string;
  filename: string;
}

export function resolveHelpArticle(lang: string, article: string): HelpRequest {
  const base = article.split("/")[0];
  const subArticle = article.includes("/") ? article.slice(base.length + 1) : null;
  let dir = `usersguide/${lang}`;
  let filename = join(USERSGUIDE_DIR, lang, `${base}.php`);
  if (!existsSync(filename)) {
    dir = "usersguide/en";
    filename = join(USERSGUIDE_DIR, "en", `${base}.php`);
    if (!existsSync(filename)) throw new Error(`There is no help article named '${base}'`);
  }
  return { article: base, subArticle, dir, filename };
}

export function helpNavigatorHtml(current: string): string {
  let out = '<nav class="help-nav">';
  for (const heading of Object.keys(helpMenu)) {
    const submenu = helpMenu[heading];
    const open = Object.prototype.hasOwnProperty.call(submenu, current);
    out += `<details class="help-nav-group"${open ? " open" : ""}><summary class="help-nav-heading">${heading}</summary><div class="help-nav-items">`;
    for (const article of Object.keys(submenu)) {
      const { level, text } = submenu[article];
      const inside = article !== current ? `<a href="/help/${article}">${text}</a>` : text;
      out += `<p class="mb-0 level${level}">${inside}</p>`;
    }
    out += "</div></details>";
  }
  return out + "</nav>";
}

export function evaluateArticle(
  src: string,
  opts: { subArticle: string | null; dir: string; siteUrl: string },
): string {
  const ctx: HelpEvalCtx = {
    vars: new Map<string, string>([["sub_article", opts.subArticle ?? ""]]),
    subArticle: opts.subArticle,
    dir: opts.dir,
    siteUrl: opts.siteUrl,
    stack: [],
  };
  const parts = src.split(/<\?([\s\S]*?)\?>/);
  let out = "";
  for (let i = 0; i < parts.length; ++i) {
    const part = parts[i];
    if (i % 2 === 0) {
      if (ctx.stack.every((s) => s)) out += part;
      continue;
    }
    const trimmed = part.trim();
    if (trimmed.startsWith("php")) {
      const code = trimmed.slice(3).replace(/\s*:\s*$/, "").trim();
      const emailBlock =
        /^\$email\s*=\s*"([^"]*)";\s*\$linkText\s*=\s*"([^"]*)";(?:\s*\/\/.*\s*)?\s*\$encodedEmail\s*=\s*'';\s*for\s*\(.*\)\s*\{\s*\$encodedEmail\s*\.=\s*"&#"\s*\.\s*ord\(\$email\[\$i\]\)\s*\.\s*";";\s*\}\s*echo\s*'<a href="mailto:'\s*\.\s*\$encodedEmail\s*\.\s*'">'\s*\.\s*htmlspecialchars\(\$linkText\)\s*\.\s*'<\/a>';$/.exec(code);
      if (emailBlock) {
        out += `<a href="mailto:${emailBlock[1]}">${emailBlock[2]}</a>`;
        continue;
      }
      if (code === "else") {
        if (ctx.stack.length === 0) throw new Error("Unexpected else in help article");
        ctx.stack[ctx.stack.length - 1] = !ctx.stack[ctx.stack.length - 1];
      } else if (code.startsWith("endif")) {
        if (ctx.stack.length === 0) throw new Error("Unexpected endif in help article");
        ctx.stack.pop();
      } else if (code.startsWith("if ($sub_article")) {
        const cond = /^if \(\$sub_article\s*(?:==|===)\s*'([^']*)'\)$/.exec(code);
        if (!cond) throw new Error(`Unsupported PHP condition in help article: ${code}`);
        if (ctx.stack.every((s) => s)) ctx.stack.push(ctx.subArticle === cond[1]);
        else ctx.stack.push(false);
      } else if (ctx.stack.every((s) => s)) {
        const assign = /^\$(\w+)\s*=\s*(.+)$/.exec(code);
        if (assign) {
          ctx.vars.set(assign[1], evalExpr(assign[2], ctx));
        } else {
          throw new Error(`Unsupported PHP statement in help article: <?php ${code} ?>`);
        }
      }
    } else if (trimmed.startsWith("=")) {
      if (ctx.stack.every((s) => s)) out += evalExpr(trimmed.slice(1).trim(), ctx);
    } else if (/^version:\s*\d+$/.test(trimmed)) {
      // versión del artículo (<? version: YYYYMMDD ?>)
    } else {
      throw new Error(`Unsupported PHP construct in help article: <?${part}?>`);
    }
  }
  return out;
}

interface HelpEvalCtx {
  vars: Map<string, string>;
  subArticle: string | null;
  dir: string;
  siteUrl: string;
  stack: boolean[];
}

class ParseError extends Error {}

function evalExpr(expr: string, ctx: HelpEvalCtx): string {
  const buffer: string[] = [];
  let rest = expr.trim();
  while (rest.length > 0) {
    const term = eatTerm(rest, ctx);
    buffer.push(term.value);
    rest = term.rest.trim();
    if (rest.startsWith(".")) rest = rest.slice(1).trim();
    else if (rest.length > 0)
      throw new ParseError(`Unsupported PHP expression in help article: ${expr}`);
  }
  return buffer.join("");
}

function eatTerm(src: string, ctx: HelpEvalCtx): { value: string; rest: string } {
  if (src.startsWith("'") || src.startsWith('"')) return eatString(src, ctx.vars);
  const mth = /^\$hdir->([a-z_]\w*)\s*\(/.exec(src);
  if (mth) return callFunction(mth[1], src.slice(mth[0].length), ctx);
  if (src.startsWith("$")) {
    const m = /^\$(\w+)/.exec(src)!;
    const v = ctx.vars.get(m[1]);
    if (v === undefined) throw new ParseError(`Undefined variable $${m[1]} in help article`);
    return { value: v, rest: src.slice(m[0].length) };
  }
  const fps = /^([a-z_]\w*)\s*\(/.exec(src);
  if (fps) return callFunction(fps[1], src.slice(fps[0].length), ctx);
  if (src.startsWith("[")) return eatAttrArray(src, ctx);
  throw new ParseError(`Unsupported PHP expression in help article: ${src.slice(0, 40)}`);
}

function callFunction(name: string, argStart: string, ctx: HelpEvalCtx): { value: string; rest: string } {
  const args: string[] = [];
  let arg = "";
  let rest = argStart.trim();
  if (rest.startsWith(")")) return { value: applyFunction(name, [], ctx), rest: rest.slice(1) };
  while (true) {
    const v = eatTerm(rest, ctx);
    arg += v.value;
    rest = v.rest.trim();
    if (rest.startsWith(".")) {
      rest = rest.slice(1).trim();
    } else if (rest.startsWith(",")) {
      args.push(arg);
      arg = "";
      rest = rest.slice(1).trim();
    } else if (rest.startsWith(")")) {
      args.push(arg);
      return { value: applyFunction(name, args, ctx), rest: rest.slice(1) };
    } else {
      throw new ParseError(`Unsupported PHP call in help article: ${name}`);
    }
  }
}

function eatAttrArray(src: string, ctx: HelpEvalCtx): { value: string; rest: string } {
  let rest = src.slice(1).trim();
  const attrs: string[] = [];
  while (true) {
    const key = /^'([^']*)'|^([a-z_]\w*)/.exec(rest);
    if (!key) throw new ParseError("Bad attribute array in help article");
    const keyName = key[1] ?? key[2];
    rest = rest.slice(key[0].length).trim();
    if (!rest.startsWith("=>")) throw new ParseError("Bad attribute array in help article");
    rest = rest.slice(2).trim();
    const v = eatTerm(rest, ctx);
    attrs.push(`${keyName}="${v.value}"`);
    rest = v.rest.trim();
    if (rest.startsWith(",")) rest = rest.slice(1).trim();
    else if (rest.startsWith("]")) return { value: attrs.join(" "), rest: rest.slice(1) };
    else throw new ParseError("Bad attribute array in help article");
  }
}

function applyFunction(name: string, args: string[], ctx: HelpEvalCtx): string {
  switch (name) {
    case "img":
      return (
        `<p><a href="${ctx.siteUrl}${ctx.dir}/images/${args[0]}" target="_blank">` +
        `<img class="mx-auto img-fluid d-block border border-info" alt="Bible OL" src="${ctx.siteUrl}${ctx.dir}/images/${args[0]}"></a></p>\n`
      );
    case "get_dir":
      return `${ctx.siteUrl}${ctx.dir}`;
    case "heb_gr":
      if (ctx.subArticle === "heb") return args[0];
      if (ctx.subArticle === "gr") return args[1];
      return "<strong>Error in help file</strong>\n";
    case "heb":
      if (ctx.subArticle === "heb") return args[0];
      if (ctx.subArticle === "gr") return "";
      return "<strong>Error in help file</strong>\n";
    case "gr":
      if (ctx.subArticle === "gr") return args[0];
      if (ctx.subArticle === "heb") return "";
      return "<strong>Error in help file</strong>\n";
    case "if_gr":
      if (ctx.subArticle === "if") return args[0];
      if (ctx.subArticle === "gr") return args[1];
      return "<strong>Error in help file</strong>\n";
    case "help_anchor":
      return anchorHtml(`help/show_help/${args[0]}`, args[1], args[2]);
    case "anchor":
      return anchorHtml(args[0], args[1], args[2]);
    case "make_footnote":
      return `<a href="#" data-toggle="tooltip" title="${args[1]}">${args[0]}</a>`;
    default:
      throw new ParseError(`Unsupported PHP function in help article: ${name}`);
  }
}

function anchorHtml(uri: string, title: string, attrs: string | undefined): string {
  const attrStr = attrs !== undefined ? ` ${attrs}` : "";
  if (/^https?:\/\//.test(uri)) return `<a target="_blank" href="${uri}"${attrStr}>${title}</a>`;
  const href = uri.replace(/^help\/show_help\//, "/help/");
  return `<a href="${href}"${attrStr}>${title}</a>`;
}

function eatString(src: string, vars: Map<string, string>): { value: string; rest: string } {
  const quote = src[0];
  let i = 1;
  let out = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      const next = src[i + 1] ?? "";
      if (quote === "'" && next !== "'" && next !== "\\")
        throw new ParseError("Bad escape in help article");
      out += next === "n" ? "\n" : next;
      i += 2;
    } else if (ch === quote) {
      return { value: out, rest: src.slice(i + 1) };
    } else if (quote === '"' && ch === "$") {
      const m = /^\$(\w+)/.exec(src.slice(i))!;
      const v = vars.get(m[1]);
      if (v === undefined) throw new ParseError(`Undefined variable $${m[1]} in help article`);
      out += v;
      i += m[0].length;
    } else {
      out += ch;
      ++i;
    }
  }
  throw new ParseError("Unterminated string in help article");
}

export function readHelpArticle(req: HelpRequest): string {
  return readFileSync(req.filename, "utf8");
}