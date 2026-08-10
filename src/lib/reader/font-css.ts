/**
 * reader/font-css.ts — Port de `myapp/views/view_font_css.php`.
 *
 * Genera el <style> con las clases por alfabeto (hebrew/greek/…):
 * font-family + direction, y tamaños/negrita/cursiva por estilo
 * (textdisplay, features, tooltip, input) desde bol_font.
 */

export interface FontCssRow {
  name: string;
  font_family: string;
  direction: string;
  text_size: number;
  text_bold: number;
  text_italic: number;
  feature_size: number;
  feature_bold: number;
  feature_italic: number;
  tooltip_size: number;
  tooltip_bold: number;
  tooltip_italic: number;
  input_size: number;
  input_bold: number;
  input_italic: number;
}

function fontsize(fs: number): string {
  return fs > 0 ? `font-size: ${fs}pt;\n` : "";
}

function heightsize(fs: number): string {
  return fs > 0 ? `height: ${fs}pt;\n` : "";
}

const WEIGHT = (bold: number) => (bold ? "bold" : "normal");
const STYLE = (italic: number) => (italic ? "italic" : "normal");

/** view_font_css.php → CSS por alfabeto (los selectores #virtualKeyboard se usan en el quiz). */
export function buildFontCss(fonts: FontCssRow[]): string {
  const out: string[] = [];
  for (const f of fonts) {
    out.push(`.${f.name} {
  font-family: ${f.font_family} !important;
  direction: ${f.direction};
  text-align: ${f.direction === "rtl" ? "right" : "left"};
}`);

    if (f.name === "hebrew") {
      out.push(`#virtualKeyboard.HE div.kbButton span {
  font-family: ${f.font_family};
  font-size: 13pt;
}
#virtualKeyboard.HE div#kbDesk.modeNormal div.kbButton span.hiddenShiftCaps {
  font-size: 9pt;
}
#virtualKeyboard.HE div#kbDesk.modeCaps div.kbButton span.hiddenShiftCaps {
  font-size: 9pt;
}`);
    }

    if (f.name === "greek") {
      out.push(`#virtualKeyboard.EL div.kbButton span {
  font-family: ${f.font_family};
  font-size: 13pt;
}
#virtualKeyboard.EL div#kbDesk.modeNormal div.kbButton span.hiddenShiftCaps {
  font-size: 9pt;
}
#virtualKeyboard.EL div#kbDesk.modeCaps div.kbButton span.hiddenShiftCaps {
  font-size: 9pt;
}
#virtualKeyboard.EL div#kbDesk.modeNormal div.kbButton span.charAlt {
  font-size: 9pt;
}`);
    }

    out.push(`.textdisplay.${f.name} {
  ${fontsize(f.text_size)}
  font-weight: ${WEIGHT(f.text_bold)};
  font-style: ${STYLE(f.text_italic)};
}

select.${f.name},
.wordgrammar.${f.name}, #quiztab td.${f.name}{
  ${fontsize(f.feature_size)}
  font-weight: ${WEIGHT(f.feature_bold)};
  font-style: ${STYLE(f.feature_italic)};
}

.bol-tooltip.${f.name} {
  ${fontsize(f.tooltip_size)}
  font-weight: ${WEIGHT(f.tooltip_bold)};
  font-style: ${STYLE(f.tooltip_italic)};
}

input.${f.name} {
  ${fontsize(f.input_size)}
  font-weight: ${WEIGHT(f.input_bold)};
  font-style: ${STYLE(f.input_italic)};
}

div.styled-select,
div.styled-select select {
  ${heightsize(f.feature_size * 1.5)}
}`);
  }
  return out.join("\n\n");
}
