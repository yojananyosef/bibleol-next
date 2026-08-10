/**
 * template-writer.ts — Serializador XML de plantillas de quiz.
 * Port 1:1 de las interfaces XML writer de `helpers/quiztemplate_helper.php`
 * (Template::writeAsXml, MqlData, FeatureHandlerList + los 6 handlers,
 * ListValuesHandler y QuizFeatures) sobre el modelo de template-parser.ts.
 */

import { htmlSpecialChars } from "../corpus/sheaf.ts";
import {
  type FeatureHandler,
  type MqlData,
  type QuizFeaturesData,
  type QuizTemplate,
} from "./template-parser.ts";

/** Información del corpus (dbinfo) usada solo para el caso subset. */
export interface DbinfoForWriter {
  subsetOf?: { name?: string; properties?: string; provides?: string[] } | null;
}

const TEMPLATE_VERSION = 6; // Version 6: Accepts <fixedquestions> element
const MQLDATA_VERSION = 6;
const FEATUREHANDLERS_VERSION = 3; // Version 3: <qerefeature> added
const FEATUREHANDLER_VERSION = 1;
const LISTVALUES_VERSION = 1;
const QUIZFEATURES_VERSION = 6; // Version 6 added "glosslimit"

/** Escribe la plantilla completa (Template::writeAsXml). */
export function writeQuizTemplateXml(quizdata: QuizTemplate, dbInfo: DbinfoForWriter | null): string {
  let res = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  res += `<questiontemplate version="${TEMPLATE_VERSION}">\n`;

  res += `  <desc><![CDATA[${quizdata.desc}]]></desc>\n`;

  if (dbInfo && dbInfo.subsetOf) {
    // We found a subset; store information about superset database
    res += `  <database>${htmlSpecialChars(dbInfo.subsetOf.name ?? "")}</database>\n`;
    res += `  <properties>${htmlSpecialChars(dbInfo.subsetOf.properties ?? "")}</properties>\n`;

    // If the exercise has a complete universe, but the database is a subset,
    // reduce the universe to what the subset provides
    if (
      quizdata.selectedPaths.length === 0 ||
      (quizdata.selectedPaths.length === 1 && quizdata.selectedPaths[0] === "")
    ) {
      // Complete universe is used; print subset's universe
      for (const s of dbInfo.subsetOf.provides ?? [])
        res += `  <path>${htmlSpecialChars(s)}</path>\n`;
    } else {
      // Limited universe is used; print it
      for (const s of quizdata.selectedPaths) res += `  <path>${htmlSpecialChars(s)}</path>\n`;
    }
  } else {
    // Store information about this database
    res += `  <database>${htmlSpecialChars(quizdata.database)}</database>\n`;
    res += `  <properties>${htmlSpecialChars(quizdata.properties)}</properties>\n`;

    if (quizdata.selectedPaths.length === 0) res += `  <path></path>\n`;
    else for (const s of quizdata.selectedPaths) res += `  <path>${htmlSpecialChars(s)}</path>\n`;
  }

  res += mqlDataToXml(quizdata.sentenceSelection, "sentenceselection", true);
  if (!quizdata.sentenceSelection.useForQo)
    res += mqlDataToXml(quizdata.quizObjectSelection, "quizobjectselection", false);

  res += quizFeaturesToXml(quizdata.quizFeatures);

  res += `  <maylocate>${quizdata.maylocate ? "true" : "false"}</maylocate>\n`;
  res += `  <sentbefore>${quizdata.sentbefore}</sentbefore>\n`;
  res += `  <sentafter>${quizdata.sentafter}</sentafter>\n`;
  res += `  <fixedquestions>${quizdata.fixedquestions}</fixedquestions>\n`;
  res += `  <randomize>${quizdata.randomize ? "true" : "false"}</randomize>\n`;
  res += `</questiontemplate>\n`;

  return res;
}

/** MqlData::writeAsXml — selector de frases/objetos de quiz. */
function mqlDataToXml(selection: MqlData, element: string, isSentenceSelector: boolean): string {
  let res = `  <${element} version="${MQLDATA_VERSION}">\n`;

  res += `    <questionobject>${htmlSpecialChars(selection.object)}</questionobject>\n`;
  if (selection.mql !== null) res += `    <mql>${htmlSpecialChars(selection.mql)}</mql>\n`;
  else res += featureHandlersToXml(selection.featHand);

  if (isSentenceSelector)
    res += `    <useforquizobjects>${selection.useForQo ? "true" : "false"}</useforquizobjects>\n`;

  res += `  </${element}>\n`;

  return res;
}

/** FeatureHandlerList::writeAsXml — el <featurehandlers> con los handlers que tienen valores. */
function featureHandlersToXml(vhand: FeatureHandler[]): string {
  let res = `    <featurehandlers version="${FEATUREHANDLERS_VERSION}">\n`;

  for (const fh of vhand) res += featureHandlerToXml(fh);

  res += `    </featurehandlers>\n`;

  return res;
}

/** writeAsXml de los 6 FeatureHandler (vacío si no tiene valores). */
function featureHandlerToXml(fh: FeatureHandler): string {
  switch (fh.type) {
    case "stringfeature": {
      const values = fh.values.filter((v) => v !== "");
      if (values.length === 0) return "";
      let res = `      <stringfeature version="${FEATUREHANDLER_VERSION}">\n`;
      res += `        <name>${htmlSpecialChars(fh.name)}</name>\n`;
      res += `        <comparator>${fh.comparator}</comparator>\n`;
      for (const v of values) res += `        <value>${htmlSpecialChars(v)}</value>\n`;
      res += `      </stringfeature>\n`;
      return res;
    }

    case "integerfeature": {
      const values = fh.values.filter((v) => v !== 0);
      if (values.length === 0) return "";
      let res = `      <integerfeature version="${FEATUREHANDLER_VERSION}">\n`;
      res += `        <name>${htmlSpecialChars(fh.name)}</name>\n`;
      res += `        <comparator>${fh.comparator}</comparator>\n`;
      for (const v of values) res += `        <value>${htmlSpecialChars(v)}</value>\n`;
      res += `      </integerfeature>\n`;
      return res;
    }

    case "rangeintegerfeature": {
      // PHP empty(): 0 se considera "no establecido" (1:1 con el legacy)
      if (!fh.value_low && !fh.value_high) return "";
      let res = `      <rangeintegerfeature version="${FEATUREHANDLER_VERSION}">\n`;
      res += `        <name>${htmlSpecialChars(fh.name)}</name>\n`;
      if (fh.value_low) res += `        <valuelow>${fh.value_low}</valuelow>\n`;
      if (fh.value_high) res += `        <valuehigh>${fh.value_high}</valuehigh>\n`;
      res += `      </rangeintegerfeature>\n`;
      return res;
    }

    case "enumfeature": {
      if (fh.values.length === 0) return "";
      let res = `      <enumfeature version="${FEATUREHANDLER_VERSION}">\n`;
      res += `        <name>${htmlSpecialChars(fh.name)}</name>\n`;
      res += `        <comparator>${fh.comparator}</comparator>\n`;
      for (const s of fh.values) res += `        <value>${htmlSpecialChars(s)}</value>\n`;
      res += `      </enumfeature>\n`;
      return res;
    }

    case "enumlistfeature": {
      if (fh.listvalues.length === 0) return "";
      let res = `      <enumlistfeature version="${FEATUREHANDLER_VERSION}">\n`;
      res += `        <name>${htmlSpecialChars(fh.name)}</name>\n`;
      for (const lv of fh.listvalues) {
        if (lv.yes_values.length + lv.no_values.length === 0) continue;
        res += `        <listvalues version="${LISTVALUES_VERSION}">\n`;
        for (const s of lv.yes_values) res += `          <yes>${htmlSpecialChars(s)}</yes>\n`;
        for (const s of lv.no_values) res += `          <no>${htmlSpecialChars(s)}</no>\n`;
        res += `        </listvalues>\n`;
      }
      res += `      </enumlistfeature>\n`;
      return res;
    }

    case "qerefeature": {
      if (!fh.omit) return "";
      return (
        `      <qerefeature version="${FEATUREHANDLER_VERSION}">\n` +
        `        <name>${htmlSpecialChars(fh.name)}</name>\n` +
        `        <value>true</value>\n` +
        `      </qerefeature>\n`
      );
    }
  }
}

/** QuizFeatures::writeAsXml — show/request/requestdd/dontshow/dontshowobject/glosslimit. */
export function quizFeaturesToXml(quizFeatures: QuizFeaturesData): string {
  const default_order = 100;

  let res = `  <quizfeatures version="${QUIZFEATURES_VERSION}">\n`;

  for (const s of quizFeatures.showFeatures) res += `    <show>${htmlSpecialChars(s)}</show>\n`;

  // Normalize and sort requestFeatures by order_val
  const requestFeatures = [...quizFeatures.requestFeatures].map((feat) => ({
    ...feat,
    order_val: Number.isFinite(feat.order_val) ? feat.order_val : default_order,
  }));
  requestFeatures.sort((a, b) => a.order_val - b.order_val);

  for (const s of requestFeatures) {
    if (s.usedropdown) {
      res += `    <requestdd>${htmlSpecialChars(s.name)}</requestdd>\n`;
    } else if (s.hideFeatures !== null && s.hideFeatures.length > 0) {
      res += `    <request hidefeatures="${s.hideFeatures.join(",")}">${htmlSpecialChars(s.name)}</request>\n`;
    } else {
      res += `    <request>${htmlSpecialChars(s.name)}</request>\n`;
    }
  }

  for (const s of quizFeatures.dontShowFeatures) res += `    <dontshow>${htmlSpecialChars(s)}</dontshow>\n`;

  for (const s of quizFeatures.dontShowObjects) {
    if (s.show !== undefined)
      res += `    <dontshowobject show="${htmlSpecialChars(s.show)}">${htmlSpecialChars(s.content)}</dontshowobject>\n`;
    else res += `    <dontshowobject>${htmlSpecialChars(s.content)}</dontshowobject>\n`;
  }

  res += `    <glosslimit>${quizFeatures.glosslimit}</glosslimit>\n`;
  res += `  </quizfeatures>\n`;

  return res;
}
