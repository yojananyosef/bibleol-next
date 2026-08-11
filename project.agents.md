# bibleol-next

Port 1:1 del **Bible Online Learner** (PHP/CodeIgniter legacy) a Next.js 16 App Router + TypeScript strict + Tailwind v4 + shadcn/ui.

## Regla de oro

Lógica de negocio, esquema `bol_*` y flujo de usuario 1:1 con el legacy. Sin funcionalidades nuevas. `bun run typecheck` (tsc --noEmit, 0 errores) después de cada módulo.

## Comandos

| Comando | Descripción |
|---|---|
| `bun install` | Dependencias (better-sqlite3 binario prebuilt; ver ignoreScripts) |
| `bun run dev` | Servidor de desarrollo en http://localhost:3000 |
| `bun run typecheck` | tsc --noEmit (0 errores obligatorio tras cada módulo) |
| `bun run lint` | eslint |
| `bun run build` | Build de producción |
| `bun run test` | Tests de integración (node --test, globs por módulo en package.json) |
| `bun run test:e2e` | E2E Playwright (requiere `bash scripts/browser-libs.sh`; concurrency=1) |
| `bun run db:init` | Crea la BD SQLite con el esquema `bol_*` + seeds demo (`scripts/migrate-schema.ts`) |
| `bun run i18n:import` | Importa los diccionarios `language/langsrc/*` a `bol_language_comment` |
| `bun run corpus:download` | Descarga los corpus Emdros (ETCBC4, nestle1904, jvulgate) a `data/corpus/` (gitignored) |
| `bun run lexicons:build` | Regenera `data/lexicons.db` desde `data/lexicons/*.csv` + meta legacy (`scripts/build-lexicons.ts`) |

> `bun run` puede crashear en WSL con better-sqlite3 (panic NAPI, bug de Bun). Fallback: `pnpm run <script>` (pnpm instalado globalmente; config en `pnpm-workspace.yaml`). Los scripts usan `node`, no el runtime de bun.

## Estructura

- `src/app/` — rutas App Router; acciones de servidor en `src/app/actions/`
- `src/lib/` — lógica: `db/` (sqlite + schema `bol_*`), `corpus/` (emdros, db-config, lexicon), `i18n/`, `quiz/`, `services/`, `auth/`
- `src/components/` — componentes UI (shadcn/ui) y componentes de dominio
- `src/legacy-ts/` — port 1:1 del cliente quiz legacy (NO es código muerto; lo usa QuizRunner y el editor)
- `data/` — datos: `meta/` (db.json, typeinfo, bookorder, prop.pretty.json), `hints/` (bases SQLite de hints, resueltas por nombre desde db.json), `quizzes/` (.3et), `lexicons/` (CSV → `scripts/build-lexicons.ts`)
- `language/langsrc/` — fuente de verdad de i18n: diccionarios `{abb}/{group}_lang.php` (formato `$lang['key'] = "text";`), leídos como datos por `src/lib/i18n/php-lang.ts`, no ejecutados
- `tests/` — unit/integración (node --test) y `tests/e2e/` (Playwright)

## Convenciones

- Sin comentarios en el código salvo que se pidan explícitamente
- Encriptación de contraseñas del legacy: `md5(salt + password)` — no cambiar
- Las bases de hints (`data/hints/*.db`) se resuelven por el nombre en `db.json` (`indirdb`/`alternateshowrequestDb`); nunca por ruta fija a `data/meta/`
- Archivos `*.agents.md` y `agents-md/**/*.md` son fragmentos de AGENTS.md — editar los fragmentos y ejecutar `npx agents-md compose`, nunca AGENTS.md directamente
