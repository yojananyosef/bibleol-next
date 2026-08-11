/** Iconos de lexema — constantes compartidas entre server y cliente (L_icon legacy). */

/** Nombres de iconos disponibles (radio buttons del editor). */
export const ICON_NAMES = [
  "l-icon-link", "l-icon-file", "l-icon-logos",
  "l-icon-music", "l-icon-picture", "l-icon-film",
  "l-icon-speaker", "l-icon-book", "l-icon-globe",
];

/** L_icon::css_class — clase CSS del icono (con fallback a link). */
const ICON_CLASSES: Record<string, string> = {
  "l-icon-link": "fas fa-link",
  "l-icon-file": "fas fa-file",
  "l-icon-music": "fas fa-music",
  "l-icon-picture": "fas fa-file-image",
  "l-icon-film": "fas fa-film",
  "l-icon-speaker": "fas fa-volume-down",
  "l-icon-book": "fas fa-book",
  "l-icon-globe": "fas fa-globe-africa",
  "l-icon-logos": "bolicon bolicon-logos",
  "l-icon-default": "fas fa-link",
};

/** L_icon::css_class — clase CSS del icono (con fallback a link). */
export function iconCssClass(icon: string): string {
  return ICON_CLASSES[icon] ?? ICON_CLASSES["l-icon-default"];
}