/** Port del bloque de política (view_accept_policy new_privacy / view_new_oauth2_user).
 * El legacy extrae el idioma del prefijo "(xx)" de privacy_text y muestra el resto
 * como HTML (echo). Con `text` undefined se usa un resumen por defecto. */
export function PolicyText({ text, lang }: { text?: string; lang?: string }) {
  if (text !== undefined && lang !== undefined) {
    return <div className="mb-4 max-h-64 overflow-y-auto rounded border bg-muted/40 p-4 text-sm" dangerouslySetInnerHTML={{ __html: text }} />;
  }
  return (
    <div className="mb-4 max-h-64 overflow-y-auto whitespace-pre-line rounded border bg-muted/40 p-4 text-sm">
      {`Bible Online Learner is a free service for learning the original languages of the Bible.
By using this service you agree to use it for educational purposes only, and you
acknowledge that the texts and quizzes are provided "as is" without warranty.
(Privacy policy in effect since 2017-12-04.)`}
    </div>
  );
}

/** Extrae el idioma de la política del prefijo "(xx)" y devuelve el texto restante. */
export function parsePolicyText(raw: string): { text: string; lang: string } {
  const m = /^\(([^)]*)\)([\s\S]*)/.exec(raw);
  return m ? { text: raw.slice(m[0].length), lang: m[1] } : { text: raw, lang: "Unknown" };
}