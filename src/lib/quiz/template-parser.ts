/**
 * quiz/template-parser.ts — Parser de plantillas de quiz `.3et`
 * (port 1:1 de `helpers/xmlhandler_helper.php` + `helpers/quiztemplate_helper.php`,
 * con `sax` en lugar del XML parser de PHP).
 *
 * harvest() → QuizTemplate con elementos MqlData (sentenceSelection /
 * quizObjectSelection), FeatureHandlerList (vhand) y QuizFeatures.
 */

import sax from "sax";

// ---------------------------------------------------------------------------
// Modelo del template
// ---------------------------------------------------------------------------

export interface RequestFeature {
  name: string;
  usedropdown: boolean;
  hideFeatures: string[] | null;
  order_val: number;
}

export interface DontShowObject {
  content: string;
  show?: string;
}

export interface QuizFeaturesData {
  showFeatures: string[];
  requestFeatures: RequestFeature[];
  dontShowFeatures: string[];
  dontShowObjects: DontShowObject[];
  glosslimit: number;
}

export type FeatureHandler =
  | { type: "stringfeature"; name: string; comparator: string; values: string[] }
  | { type: "integerfeature"; name: string; comparator: string; values: number[] }
  | {
      type: "rangeintegerfeature";
      name: string;
      comparator: string;
      value_low: number | undefined;
      value_high: number | undefined;
      isSet_low: boolean;
      isSet_high: boolean;
    }
  | { type: "enumfeature"; name: string; comparator: string; values: string[] }
  | { type: "enumlistfeature"; name: string; listvalues: { yes_values: string[]; no_values: string[] }[] }
  | { type: "qerefeature"; name: string; omit: boolean };

export interface MqlData {
  object: string;
  mql: string | null;
  featHand: FeatureHandler[];
  useForQo?: boolean;
}

export interface QuizTemplate {
  desc: string;
  database: string;
  properties: string;
  selectedPaths: string[];
  sentenceSelection: MqlData;
  quizObjectSelection: MqlData;
  quizFeatures: QuizFeaturesData;
  maylocate: boolean;
  sentbefore: number;
  sentafter: number;
  fixedquestions: number;
  randomize: boolean;
}

// ---------------------------------------------------------------------------
// FeatureHandler → MQL (__toString de los handlers PHP)
// ---------------------------------------------------------------------------

export function hasValues(fh: FeatureHandler): boolean {
  switch (fh.type) {
    case "rangeintegerfeature":
      return fh.isSet_low || fh.isSet_high;
    case "enumlistfeature":
      return fh.listvalues.some((lv) => lv.yes_values.length + lv.no_values.length > 0);
    case "qerefeature":
      return fh.omit;
    default:
      return fh.values.length > 0;
  }
}

function getComparator(c: string): string {
  switch (c) {
    case "equals":
      return "=";
    case "differs":
      return "<>";
    case "matches":
      return "~";
  }
  return "";
}

function getJoiner(c: string): string {
  switch (c) {
    case "equals":
      return " OR ";
    case "differs":
      return " AND ";
    case "matches":
      return " OR ";
  }
  return "";
}

/** FeatureHandlerList::__toString → AND entre handlers con valores. */
export function featHandToMql(vhand: FeatureHandler[]): string {
  const parts: string[] = [];
  for (const fh of vhand) if (hasValues(fh)) parts.push(handlerToMql(fh));
  return parts.join(" AND ");
}

function handlerToMql(fh: FeatureHandler): string {
  switch (fh.type) {
    case "stringfeature": {
      const comp = getComparator(fh.comparator);
      const parts = fh.values.map((v) => `${fh.name} ${comp} "${v}"`);
      return parts.length === 1 ? parts[0] : `(${parts.join(getJoiner(fh.comparator))})`;
    }
    case "integerfeature": {
      if (fh.values.length === 1) return `${fh.name}${getComparator(fh.comparator)}${fh.values[0]}`;
      return `${fh.comparator === "differs" ? "NOT " : ""}${fh.name} IN (${fh.values.join(",")})`;
    }
    case "rangeintegerfeature":
      if (fh.isSet_low)
        return fh.isSet_high
          ? `(${fh.name}>=${fh.value_low} AND ${fh.name}<=${fh.value_high})`
          : `${fh.name}>=${fh.value_low}`;
      if (fh.isSet_high) return `${fh.name}<=${fh.value_high}`;
      return "";
    case "enumfeature":
      return `${fh.comparator === "differs" ? "NOT " : ""}${fh.name} IN (${fh.values.join(",")})`;
    case "enumlistfeature": {
      const parts: string[] = [];
      for (const lv of fh.listvalues) {
        if (lv.yes_values.length + lv.no_values.length === 0) continue;
        const lvParts: string[] = [];
        for (const v of lv.yes_values) lvParts.push(`${fh.name} HAS ${v}`);
        for (const v of lv.no_values) lvParts.push(`NOT ${fh.name} HAS ${v}`);
        parts.push(lvParts.length === 1 ? lvParts[0] : `(${lvParts.join(" AND ")})`);
      }
      return parts.length === 0 ? "" : `(${parts.join(" OR ")})`;
    }
    case "qerefeature":
      return fh.omit ? `(${fh.name}='' AND g_word_translit<>'HÎʔ')` : "";
  }
}

// ---------------------------------------------------------------------------
// Mecánica SAX (1:1 con XmlHandler + $accept de PHP)
// ---------------------------------------------------------------------------

type SetThis =
  | { t: "SET"; dest: (s: string) => void } // acumula chunks
  | { t: "SET_BOOL"; dest: (b: boolean) => void }
  | { t: "SET_NUM"; dest: (n: number) => void }
  | { t: "PUSH"; dest: (s: string) => void } // primer chunk, luego DONT_SET
  | { t: "PUSH_APPEND"; dest: (s: string) => void } // acumula chunk(s) → un solo push
  | { t: "PUSH_NUM"; dest: (n: number) => void }
  | { t: "PUSH_ATTRIBS"; dest: (obj: Record<string, string>) => void; attribs: Record<string, string> }
  | { t: "PUSH_REQUEST"; dest: (rf: RequestFeature) => void; hideFeatures: string[] | null }
  | { t: "PUSH_REQUESTDD"; dest: (rf: RequestFeature) => void };

/**
 * Equivale al XmlHandler base de PHP. Un handler se consume él mismo
 * (handlers.pop()) cuando cierra su elemento raíz (rootTag).
 */
abstract class ParserHandler {
  protected setthis: SetThis | null = null;
  protected pendingText = "";
  protected gotText = false;
  rootTags: string[] = [];

  /** open_handler base: engancha $this->setthis según el elemento. */
  abstract open(handlers: ParserHandler[], tagname: string, attributes: Record<string, string>): void;

  /** content_handler base (SetThisType): muta el destino. */
  content(text: string): void {
    const st = this.setthis;
    if (!st) return;
    switch (st.t) {
      case "SET":
        this.pendingText += text;
        break;
      case "SET_BOOL":
        this.pendingText += text;
        break;
      case "SET_NUM":
        this.pendingText += text;
        break;
      case "PUSH":
        if (!this.gotText) st.dest(text);
        this.gotText = true;
        break;
      case "PUSH_APPEND":
        this.pendingText += text;
        this.gotText = true;
        break;
      case "PUSH_NUM":
        if (!this.gotText) st.dest(parseInt(text, 10));
        this.gotText = true;
        break;
      case "PUSH_ATTRIBS":
        if (!this.gotText) {
          const obj: Record<string, string> = { ...st.attribs, content: text };
          st.dest(obj);
        }
        this.gotText = true;
        break;
      case "PUSH_REQUEST":
        if (!this.gotText) {
          st.dest({
            name: text,
            usedropdown: false,
            hideFeatures: st.hideFeatures !== null && st.hideFeatures.length > 0 ? st.hideFeatures : null,
            order_val: 100,
          });
        }
        this.gotText = true;
        break;
      case "PUSH_REQUESTDD":
        if (!this.gotText) st.dest({ name: text, usedropdown: true, hideFeatures: null, order_val: 100 });
        this.gotText = true;
        break;
    }
  }

  /** close_handler base de los subhandlers: llama parent::close_handler (pop) solo en la raíz. */
  close(handlers: ParserHandler[], tagname: string): void {
    if (this.rootTags.includes(tagname)) {
      handlers.pop();
      return;
    }
    // Inner tags: aplicar el setthis pendiente y resetear (como panic-guard PHP en algunos casos)
    switch (this.setthis?.t) {
      case "SET":
        this.setthis.dest(this.pendingText);
        break;
      case "SET_BOOL":
        this.setthis.dest(this.pendingText === "true");
        break;
      case "SET_NUM":
        this.setthis.dest(parseInt(this.pendingText, 10));
        break;
      case "PUSH_APPEND":
        if (this.gotText) this.setthis.dest(this.pendingText);
        break;
    }
    this.setthis = null;
    this.pendingText = "";
    this.gotText = false;
  }
}

function panic(tagname: string): never {
  throw new Error(`PANIC: unknown tag ${tagname}`);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

class TopHandler extends ParserHandler {
  rootTags = [];
  top: QuizTemplate | null = null;

  open(handlers: ParserHandler[], tagname: string): void {
    switch (tagname) {
      case "questiontemplate": {
        const t = new TemplateHandler();
        handlers.push(t);
        this.top = t.template;
        break;
      }
      default:
        panic(tagname);
    }
  }
}

class TemplateHandler extends ParserHandler {
  rootTags = ["questiontemplate"];
  template: QuizTemplate = {
    desc: "",
    database: "",
    properties: "",
    selectedPaths: [],
    sentenceSelection: { object: "", mql: null, featHand: [] },
    quizObjectSelection: null as unknown as MqlData,
    quizFeatures: {
      showFeatures: [],
      requestFeatures: [],
      dontShowFeatures: [],
      dontShowObjects: [],
      glosslimit: 0,
    },
    maylocate: true,
    sentbefore: 0,
    sentafter: 0,
    fixedquestions: 0,
    randomize: true,
  };

  open(handlers: ParserHandler[], tagname: string): void {
    switch (tagname) {
      case "path":
        this.setthis = { t: "PUSH_APPEND", dest: (s) => { this.template.selectedPaths.push(s); } };
        break;
      case "desc":
        this.setthis = { t: "SET", dest: (s) => { this.template.desc = s; } };
        break;
      case "database":
        this.setthis = { t: "SET", dest: (s) => { this.template.database = s; } };
        break;
      case "properties":
        this.setthis = { t: "SET", dest: (s) => { this.template.properties = s; } };
        break;
      case "maylocate":
        this.setthis = { t: "SET_BOOL", dest: (b) => { this.template.maylocate = b; } };
        break;
      case "sentbefore":
        this.setthis = { t: "SET_NUM", dest: (n) => { this.template.sentbefore = n; } };
        break;
      case "sentafter":
        this.setthis = { t: "SET_NUM", dest: (n) => { this.template.sentafter = n; } };
        break;
      case "fixedquestions":
        this.setthis = { t: "SET_NUM", dest: (n) => { this.template.fixedquestions = n; } };
        break;
      case "randomize":
        this.setthis = { t: "SET_BOOL", dest: (b) => { this.template.randomize = b; } };
        break;
      case "sentenceselection": {
        const md = new MqlDataHandler();
        handlers.push(md);
        this.template.sentenceSelection = md.data;
        break;
      }
      case "quizobjectselection": {
        const md = new MqlDataHandler();
        handlers.push(md);
        this.template.quizObjectSelection = md.data;
        break;
      }
      case "quizfeatures": {
        const qf = new QuizFeaturesHandler();
        handlers.push(qf);
        this.template.quizFeatures = qf.data;
        break;
      }
      default:
        panic(tagname);
    }
  }

  close(handlers: ParserHandler[], tagname: string): void {
    if (tagname === "questiontemplate") {
      // PHP: if (sentenceSelection->useForQo && !isset(quizObjectSelection))
      if (this.template.sentenceSelection.useForQo && this.template.quizObjectSelection === null) {
        this.template.quizObjectSelection = JSON.parse(JSON.stringify(this.template.sentenceSelection));
        this.template.quizObjectSelection.useForQo = undefined;
      }
      if (!this.template.properties) this.template.properties = this.template.database;
      handlers.pop();
      return;
    }
    super.close(handlers, tagname);
  }
}

class MqlDataHandler extends ParserHandler {
  rootTags = ["sentenceselection", "quizobjectselection"];
  data: MqlData = { object: "", mql: null, featHand: [] };

  open(handlers: ParserHandler[], tagname: string): void {
    switch (tagname) {
      case "featurehandlers": {
        const fh = new FeatureHandlerListHandler();
        handlers.push(fh);
        this.data.featHand = fh.vhand;
        break;
      }
      case "questionobject":
        this.setthis = { t: "SET", dest: (s) => { this.data.object = s; } };
        break;
      case "mql":
        this.setthis = { t: "SET", dest: (s) => { this.data.mql = s; } };
        break;
      case "useforquizobjects":
        this.setthis = { t: "SET_BOOL", dest: (b) => { this.data.useForQo = b; } };
        break;
      default:
        panic(tagname);
    }
  }
}

class FeatureHandlerListHandler extends ParserHandler {
  rootTags = ["featurehandlers"];
  vhand: FeatureHandler[] = [];

  open(handlers: ParserHandler[], tagname: string): void {
    switch (tagname) {
      case "stringfeature":
      case "integerfeature":
      case "rangeintegerfeature":
      case "enumfeature":
      case "enumlistfeature":
      case "qerefeature": {
        const s = new FeatureHandlerBase();
        s.data.type = tagname as FeatureHandler["type"];
        s.rootTags = [tagname];
        handlers.push(s);
        this.vhand.push(s.data as unknown as FeatureHandler);
        break;
      }
      default:
        panic(tagname);
    }
  }
}

/** Forma mutable interna durante el parseo (PHP: propiedades públicas del handler). */
interface MutableFeatureHandler {
  type: FeatureHandler["type"];
  name: string;
  comparator: string;
  values: string[] | number[];
  value_low?: number;
  value_high?: number;
  isSet_low?: boolean;
  isSet_high?: boolean;
  listvalues?: { yes_values: string[]; no_values: string[] }[];
  omit?: boolean;
}

class FeatureHandlerBase extends ParserHandler {
  data: MutableFeatureHandler = {
    type: "stringfeature",
    name: "",
    comparator: "",
    values: [],
  };

  open(handlers: ParserHandler[], tagname: string): void {
    switch (tagname) {
      case "name":
        this.setthis = { t: "SET", dest: (s) => { this.data.name = s; } };
        break;
      case "comparator":
        this.setthis = { t: "SET", dest: (s) => { this.data.comparator = s; } };
        break;
      case "value":
        switch (this.data.type) {
          case "integerfeature":
            this.setthis = {
              t: "PUSH_NUM",
              dest: (n) => { (this.data.values as number[]).push(n); },
            };
            break;
          case "enumfeature":
            this.setthis = { t: "PUSH", dest: (s) => { (this.data.values as string[]).push(s); } };
            break;
          case "stringfeature":
            this.setthis = {
              t: "PUSH_APPEND",
              dest: (s) => { (this.data.values as string[]).push(s); },
            };
            break;
          case "qerefeature":
            this.setthis = { t: "SET_BOOL", dest: (b) => { this.data.omit = b; } };
            break;
          default:
            panic(tagname);
        }
        break;
      case "valuelow": {
        this.setthis = { t: "SET_NUM", dest: (n) => { this.data.value_low = n; this.data.isSet_low = true; } };
        break;
      }
      case "valuehigh": {
        this.setthis = { t: "SET_NUM", dest: (n) => { this.data.value_high = n; this.data.isSet_high = true; } };
        break;
      }
      case "listvalues": {
        if (!this.data.listvalues) this.data.listvalues = [];
        const lv = new ListValuesHandler();
        handlers.push(lv);
        this.data.listvalues.push(lv.data);
        break;
      }
      default:
        panic(tagname);
    }
  }
}

class ListValuesHandler extends ParserHandler {
  rootTags = ["listvalues"];
  data: { yes_values: string[]; no_values: string[] } = { yes_values: [], no_values: [] };

  open(handlers: ParserHandler[], tagname: string): void {
    switch (tagname) {
      case "yes":
        this.setthis = { t: "PUSH", dest: (s) => { this.data.yes_values.push(s); } };
        break;
      case "no":
        this.setthis = { t: "PUSH", dest: (s) => { this.data.no_values.push(s); } };
        break;
      default:
        panic(tagname);
    }
  }
}

class QuizFeaturesHandler extends ParserHandler {
  rootTags = ["quizfeatures"];
  data: QuizFeaturesData = {
    showFeatures: [],
    requestFeatures: [],
    dontShowFeatures: [],
    dontShowObjects: [],
    glosslimit: 0,
  };

  open(handlers: ParserHandler[], tagname: string, attributes: Record<string, string>): void {
    switch (tagname) {
      case "show":
        this.setthis = { t: "PUSH", dest: (s) => { this.data.showFeatures.push(s); } };
        break;
      case "request":
        this.setthis = {
          t: "PUSH_REQUEST",
          dest: (rf) => { this.data.requestFeatures.push(rf); },
          hideFeatures: attributes.hidefeatures ? attributes.hidefeatures.split(",") : null,
        };
        break;
      case "requestdd":
        this.setthis = { t: "PUSH_REQUESTDD", dest: (rf) => { this.data.requestFeatures.push(rf); } };
        break;
      case "dontshow":
        this.setthis = { t: "PUSH", dest: (s) => { this.data.dontShowFeatures.push(s); } };
        break;
      case "dontshowobject":
        this.setthis = {
          t: "PUSH_ATTRIBS",
          dest: (obj) => {
            const dso: DontShowObject = { content: obj.content ?? "" };
            if (obj.show !== undefined) dso.show = obj.show;
            this.data.dontShowObjects.push(dso);
          },
          attribs: attributes,
        };
        break;
      case "glosslimit":
        this.setthis = { t: "SET_NUM", dest: (n) => { this.data.glosslimit = n; } };
        break;
      default:
        panic(tagname);
    }
  }
}

// ---------------------------------------------------------------------------
// harvest() + helpers
// ---------------------------------------------------------------------------

/**
 * harvest(): parsea el XML de un template de quiz y devuelve el QuizTemplate.
 * Equivale a harvest() de quiztemplate_helper.php.
 */
export function harvest(xml: string): QuizTemplate {
  const parser = sax.parser(false, { trim: false, normalize: false, lowercase: true, xmlns: false });
  const handlers: ParserHandler[] = [];
  handlers.push(new TopHandler());
  let accept = false;

  const topHandler = handlers[0] as TopHandler;

  parser.onopentag = (node) => {
    accept = true;
    handlers[handlers.length - 1].open(handlers, node.name, node.attributes as unknown as Record<string, string>);
  };
  parser.onclosetag = (name) => {
    handlers[handlers.length - 1].close(handlers, name);
    accept = false;
  };
  parser.ontext = (text: string) => {
    if (!accept) return;
    handlers[handlers.length - 1].content(text);
  };
  parser.oncdata = (text: string) => {
    if (!accept) return;
    handlers[handlers.length - 1].content(text);
  };
  parser.write(xml).close();

  const top = topHandler.top;
  if (!top) throw new Error("harvest(): no <questiontemplate> found");
  return top;
}

/** Comando MQL de la sentenceSelection (sentenceSelectorMql de Mod_askemdros). */
export function sentenceSelectorMql(sel: MqlData): string {
  return sel.mql !== null
    ? sel.mql
    : `[${sel.object} NORETRIEVE ${featHandToMql(sel.featHand)}]`;
}