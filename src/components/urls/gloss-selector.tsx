/**
 * gloss-selector.tsx — Port de view_select_gloss.php.
 * `editing='url'` enlaza a /urls/edit-url (Ctrl_urls); los parámetros
 * src_lang/buttonix viajan por query como en el legacy (build_url2).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import "./urls.css";

export interface GlossBlockProps {
  /** Título del bloque (hebrew_glosses / aramaic_glosses / …). */
  head: string;
  /** src_lang corto del bloque (heb/aram/greek/latin). */
  srcLang: string;
  /** Botones alfabéticos [label, from, to]. */
  buttons: [string, string, string][];
  /** Número de glosas del rango (para los botones de frecuencia). */
  numGlosses: number;
  glossCount: number;
  /** Botón activo (índice del botón alfabético o -ix-1 para frecuencia); null = ninguno. */
  buttonix: number | null;
  /** Clases de estilo por alfabeto (heb-default/greek-default/latin-default). */
  styleClass: string;
  /** Etiquetas i18n (legacy: translate_lang by_frequency / alphabetically). */
  byFrequency?: string;
  alphabetically?: string;
}

/** build_url2 del legacy: href del editor para (srcLang, buttonix). */
export function urlEditorHref(srcLang: string, buttonix: number): string {
  return `/urls/edit-url?src_lang=${srcLang}&buttonix=${buttonix}`;
}

function buttonType(index: number, buttonix: number | null): string {
  return index === buttonix ? "btn-gloss-selector-active" : "btn-gloss-selector";
}

function showButtons(p: GlossBlockProps): React.ReactNode {
  const { srcLang, buttons, numGlosses, glossCount, buttonix, styleClass } = p;
  const rightToLeft = srcLang === "heb" || srcLang === "aram";
  const numberFreqButtons = Math.ceil(numGlosses / glossCount);

  const freqButtons = [];
  for (let ix = 0; ix < numberFreqButtons; ++ix) {
    freqButtons.push(
      <div className="gloss-wrapitem" key={ix}>
        <a
          style={{ width: "100%" }}
          href={urlEditorHref(srcLang, -ix - 1)}
          className={`btn ${buttonType(-ix - 1, buttonix)}`}
        >
          {glossCount * ix + 1}-{Math.min(numGlosses, glossCount * (ix + 1))}
        </a>
      </div>,
    );
  }

  const alphaButtons = buttons.map((b, ix) => (
    <div className="gloss-wrapitem" key={ix}>
      <a
        style={{ width: "100%" }}
        href={urlEditorHref(srcLang, ix)}
        className={`btn ${buttonType(ix, buttonix)} ${styleClass}`}
        dangerouslySetInnerHTML={{ __html: b[0] }}
      />
    </div>
  ));

  return (
    <>
      <h2>{p.byFrequency ?? "By frequency"}</h2>
      <div className="gloss-wrapper ltr">{freqButtons}</div>
      <p>&nbsp;</p>
      <h2>{p.alphabetically ?? "Alphabetically"}</h2>
      <div className={`gloss-wrapper ${rightToLeft ? "rtl" : "ltr"}`}>{alphaButtons}</div>
    </>
  );
}

/** Un bloque de idioma (port del case 'heb'…'latin' de view_select_gloss). */
export function GlossBlock(p: GlossBlockProps): React.ReactNode {
  return (
    <Card className="mb-3">
      <CardHeader className="bg-info text-light">
        <CardTitle>{p.head}</CardTitle>
      </CardHeader>
      <CardContent>{showButtons(p)}</CardContent>
    </Card>
  );
}

/** Vista principal (select_lang): heb+aram con botones, greek/latin solo texto. */
export function GlossSelectorAll(p: {
  hebButtons: [string, string, string][];
  aramButtons: [string, string, string][];
  numGlosses: number;
  glossCount: number;
  byFrequency?: string;
  alphabetically?: string;
  greekHead?: string;
  latinHead?: string;
  noGreek?: string;
  noLatin?: string;
}): React.ReactNode {
  return (
    <>
      <GlossBlock
        head="Hebrew glosses"
        srcLang="heb"
        buttons={p.hebButtons}
        numGlosses={p.numGlosses}
        glossCount={p.glossCount}
        buttonix={null}
        styleClass="heb-default"
        byFrequency={p.byFrequency}
        alphabetically={p.alphabetically}
      />
      <GlossBlock
        head="Aramaic glosses"
        srcLang="aram"
        buttons={p.aramButtons}
        numGlosses={p.numGlosses}
        glossCount={p.glossCount}
        buttonix={null}
        styleClass="heb-default"
        byFrequency={p.byFrequency}
        alphabetically={p.alphabetically}
      />
      <Card className="mb-3">
        <CardHeader className="bg-info text-light">
          <CardTitle>{p.greekHead ?? "Greek glosses"}</CardTitle>
        </CardHeader>
        <CardContent>{p.noGreek ?? "Sorry, no Greek at present."}</CardContent>
      </Card>
      <Card className="mb-3">
        <CardHeader className="bg-info text-light">
          <CardTitle>{p.latinHead ?? "Latin glosses"}</CardTitle>
        </CardHeader>
        <CardContent>{p.noLatin ?? "Sorry, no Latin at present."}</CardContent>
      </Card>
    </>
  );
}