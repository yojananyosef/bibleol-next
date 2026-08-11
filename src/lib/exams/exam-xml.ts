/**
 * exams/exam-xml.ts — Formato `examcode` de los exámenes (1:1 con el XML que
 * genera `Ctrl_exams::create_config_file()` y parsea `save_exam`/`take_exam`).
 *
 * ```xml
 * <exam>
 *   <examname>Nombre (espacios '+' → '%2B')</examname>
 *   <teacher_id>123</teacher_id>
 *   <description>Description</description>
 *   <exercise>
 *     <exercisename>dir/ejercicio</exercisename>
 *     <numq>10</numq>
 *     <weight>1</weight>
 *     <!-- cualquier otro hijo es un parámetro extra del ejercicio -->
 *   </exercise>
 * </exam>
 * ```
 *
 * `examcodehash` = md5 del texto XML (1:1 con `hash("md5", $xml)` del legacy).
 */

import { createHash } from "node:crypto";
import sax from "sax";

export interface ExamExercise {
  /** Ruta relativa del ejercicio bajo /quizzes (con "+" → "%2B"). */
  exercisename: string;
  /** Nº de preguntas del ejercicio (default 10; legacy: ≤0 → 10). */
  numq: number;
  /** Ponderación para las notas (default 1). */
  weight: number;
  /** Parámetros adicionales del ejercicio (todo hijo menos exercisename). */
  params: Record<string, string>;
}

export interface ExamCode {
  examname: string;
  teacher_id: number;
  description: string;
  exercises: ExamExercise[];
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** create_config_file: construye el XML examcode canónico (indentado, como DOMDocument formatOutput). */
export function buildExamCode(code: ExamCode): string {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', "<exam>", `  <examname>${escapeXml(code.examname.replace(/\+/g, "%2B"))}</examname>`, `  <teacher_id>${code.teacher_id}</teacher_id>`, `  <description>${escapeXml(code.description)}</description>`];
  for (const ex of code.exercises) {
    lines.push("  <exercise>", `    <exercisename>${escapeXml(ex.exercisename.replace(/"/g, ""))}</exercisename>`, `    <numq>${ex.numq}</numq>`, `    <weight>${ex.weight}</weight>`);
    for (const [key, value] of Object.entries(ex.params)) {
      lines.push(`    <${key}>${escapeXml(value)}</${key}>`);
    }
    lines.push("  </exercise>");
  }
  lines.push("</exam>");
  return lines.join("\n");
}

/** examcodehash — md5 del texto XML (1:1 con el legacy). */
export function examCodeHash(xml: string): string {
  return createHash("md5").update(xml).digest("hex");
}

/** Devuelve los ejercicios del examcode (1:1 con la iteración de `$xml->exercise`). */
export function parseExamCode(xml: string): ExamCode {
  const result: ExamCode = { examname: "", teacher_id: 0, description: "", exercises: [] };
  let current: ExamExercise | null = null;
  let currentTag = "";
  let currentText = "";
  const stack: string[] = [];

  const flush = (): void => {
    if (!current) return;
    switch (currentTag) {
      case "exercisename":
        current.exercisename = currentText.trim();
        break;
      case "numq":
        current.numq = Number(currentText.trim()) || 10;
        break;
      case "weight":
        current.weight = Number(currentText.trim()) || 1;
        break;
      default:
        if (currentText.trim() !== "") current.params[currentTag] = currentText.trim();
    }
  };

  const parser = sax.parser(true);
  parser.onopentag = (node: sax.Tag) => {
    stack.push(node.name);
    currentTag = node.name;
    currentText = "";
    if (node.name === "exercise") current = { exercisename: "", numq: 10, weight: 1, params: {} };
  };
  parser.ontext = (text: string) => {
    currentText += text;
  };
  parser.onclosetag = (name: string) => {
    if (name === "exercise" && current) {
      if (current.exercisename) result.exercises.push(current);
      current = null;
    } else if (name === "examname") {
      result.examname = currentText.trim();
    } else if (name === "teacher_id") {
      result.teacher_id = Number(currentText.trim()) || 0;
    } else if (name === "description") {
      result.description = currentText.trim();
    } else if (current && currentTag === name) {
      flush();
    }
    stack.pop();
  };
  parser.write(xml).close();
  return result;
}

/** Nombre para mostrar/edit (el legacy guarda '+' como %2B y lo deshace en la vista). */
export function displayExamName(name: string): string {
  return name.replace(/%2B/g, "+");
}

/** Nº de preguntas efectivo de un ejercicio (legacy: ≤0 → 10). */
export function exerciseNumq(ex: ExamExercise): number {
  return ex.numq > 0 ? ex.numq : 10;
}