#!/usr/bin/env bash
# Descarga las libs de sistema que necesita chromium (headless shell) y las
# extrae sin root en .e2e/browser-libs. Escribe la ruta LD_LIBRARY_PATH en
# .e2e/ldpath. Usado por `npm run test:e2e`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIBDIR="$ROOT/.e2e/browser-libs/usr/lib/x86_64-linux-gnu"
mkdir -p "$LIBDIR"

if ldconfig -p 2>/dev/null | grep -q libnspr4 && ldconfig -p 2>/dev/null | grep -q libnss3; then
  # El sistema ya tiene las libs: no hace falta descomprimir nada.
  mkdir -p "$ROOT/.e2e"
  echo "$ROOT/.e2e" >/dev/null
  # Var vacía → LD_LIBRARY_PATH no se toca.
  : > "$ROOT/.e2e/ldpath"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"

apt-get download libnspr4 libnss3 libasound2t64 >/dev/null 2>&1 || {
  echo "apt-get download falló (¿hay red?). Prueba: npx playwright install-deps chromium" >&2
  exit 1
}
for d in libnspr4*.deb libnss3*.deb libasound2t64*.deb; do
  dpkg -x "$d" "$ROOT/.e2e/browser-libs"
done

echo "$LIBDIR" > "$ROOT/.e2e/ldpath"
echo "libs de chromium en $LIBDIR"