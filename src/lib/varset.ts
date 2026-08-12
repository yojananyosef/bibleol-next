/**
 * varset.ts — port de `helpers/varset_helper.php` (compone rutas de quiz).
 * Módulo pequeño sin dependencias para poder importarse desde el cliente.
 */

/** `composedir` de varset_helper.php — compone dir + path (1:1). */
export function composedir(dir: string, path_: string): string {
  if (dir === "") return path_;
  if (path_ === "") return dir;
  return `${dir}/${path_}`;
}