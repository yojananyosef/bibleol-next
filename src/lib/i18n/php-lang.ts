/**
 * Parser de los archivos `language/langsrc/{abb}/*_lang.php` del legacy.
 *
 * Cada archivo es PHP de la forma:
 *   <?php
 *   $lang['key'] = "text";
 *   $lang['multi'] = "parte1\n"
 *         . "parte\n";
 *   $comment['key'] = "...";
 *   $use_textarea['key'] = true;
 *
 * Solo trabajamos con strings de comillas dobles concatenados con `.`.
 */

/** Deshace los escapes PHP de un literal de comillas dobles. */
function unquotePhpString(raw: string): string {
  return raw.replace(/\\(["\\nrt\$])/g, (m, ch) => {
    switch (ch) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return ch;
    }
  });
}

/**
 * Extrae las asignaciones `$var['key'] = <string>. <string>;` donde var es
 * uno de los nombres pasados (p.ej. ['lang','comment']) y devuelve un mapa
 * key → texto concatenado.
 */
export function parsePhpAssignments(php: string, vars: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const varList = vars.join("|");
  const re = new RegExp(
    `\\$${varList}\\['([^']+)'\\]\\s*=\\s*("(?:\\\\.|[^"\\\\])*"(?:\\s*\\.\\s*"(?:\\\\.|[^"\\\\])*")*)\\s*;`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(php)) !== null) {
    const key = m[1];
    const value = m[2];
    const parts = value.match(/"(?:\\.|[^"\\])*"/g) ?? [];
    out[key] = parts.map((p) => unquotePhpString(p.slice(1, -1))).join("");
  }
  return out;
}

/** Lee las claves de tipo lang (textos de interfaz). */
export function parseLangFile(php: string): Record<string, string> {
  return parsePhpAssignments(php, ["lang"]);
}

/** Extrae asignaciones cuyo valor es true/false (p.ej. use_textarea). */
function parsePhpBooleans(php: string, vars: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const varList = vars.join("|");
  const re = new RegExp(`\\$${varList}\\['([^']+)'\\]\\s*=\\s*(true|false)\\s*;`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(php)) !== null) out[m[1]] = m[2] === "true";
  return out;
}

/** Lee las claves del archivo de comentarios (comment/format/use_textarea). */
export function parseCommentFile(php: string): {
  comment: Record<string, string>;
  format: Record<string, string>;
  use_textarea: Record<string, boolean>;
} {
  const comment = parsePhpAssignments(php, ["comment"]);
  const format = parsePhpAssignments(php, ["format"]);
  const use_textarea = parsePhpBooleans(php, ["use_textarea"]);
  return { comment, format, use_textarea };
}
