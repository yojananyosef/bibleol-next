// -*- js -*-
// util.ts — port de BibleOL/ts/util.ts (sin las clases FollowerBox, que
// dependen del DOM y están cubiertas por los componentes React del lector).

/** String.format('alpha {0} beta {1}').format('AA','BB') → 'alpha AA beta BB'. */
export function format(str: string, ...args: unknown[]): string {
  return str.replace(/{(\d+)}/g, (match, num: string) =>
    typeof args[+num] !== "undefined" ? String(args[+num]) : match,
  );
}

/** str2str: mapa string => string. */
export interface str2str {
  [key: string]: string;
}

/** str2strArr: mapa string => string | string[]. */
export interface str2strArr {
  [key: string]: string | string[];
}

/** str2num: mapa string => number. */
export interface str2num {
  [key: string]: number;
}

/** Inserta un separador entre varios elementos (primera llamada → ''). */
export class AddBetween {
  private separator: string;
  private first = true;

  constructor(separator: string) {
    this.separator = separator;
  }

  getStr(): string {
    if (this.first) {
      this.first = false;
      return "";
    }
    return this.separator;
  }

  reset(): void {
    this.first = true;
  }
}

/** mydump(): formatea un objeto JS para depuración. */
export function mydump(arr: unknown, level = 0, maxlevel = 5): string {
  let dumpedText = "";
  const levelPadding = "    ".repeat(level + 1);

  if (typeof arr === "object" && arr !== null) {
    for (const item in arr as Record<string, unknown>) {
      const value = (arr as Record<string, unknown>)[item];
      if (typeof value === "object") {
        dumpedText += `${levelPadding}'${item}' ...\n`;
        if (level < maxlevel) dumpedText += mydump(value, level + 1, maxlevel);
        else dumpedText += `${levelPadding}MAX LEVEL\n`;
      } else {
        dumpedText += `${levelPadding}'${item}' => "${value}"\n`;
      }
    }
  } else {
    dumpedText = `===>${arr}<===(${typeof arr})`;
  }
  return dumpedText;
}
