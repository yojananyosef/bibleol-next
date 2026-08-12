# BibleOL Next

Migración 1:1 del **Bible Online Learner** ([EzerIT/BibleOL](https://github.com/EzerIT/BibleOL)) — PHP/CodeIgniter 3 + MySQL + Emdros/MQL + jQuery — a un monolito moderno.

**Regla de oro:** lógica de negocio, esquema `bol_*` y flujo de usuario 1:1 con el legacy. Sin funcionalidades nuevas. Verificación: `bun run typecheck` (0 errores) + tests por módulo.

**Stack:** Next.js 16 (App Router, RSC) · TypeScript strict · Tailwind v4 · shadcn/ui · SQLite (`better-sqlite3`) · cookies firmadas (jose) · sax (XML) · recharts (gráficas) · TipTap (edición de descripciones)

## Comandos

| Comando | Descripción |
|---|---|
| `bun install` | Dependencias (better-sqlite3 binario prebuilt; ver ignoreScripts) |
| `bun run dev` | Servidor de desarrollo en http://localhost:3000 |
| `bun run typecheck` | `tsc --noEmit` (0 errores obligatorio tras cada módulo) |
| `bun run lint` | eslint |
| `bun run build` | Build de producción |
| `bun run test` | Tests de integración (node --test, ~282) |
| `bun run test:e2e` | E2E Playwright (requiere `bash scripts/browser-libs.sh`; concurrency=1) |
| `bun run db:init` | Crea la BD SQLite con el esquema `bol_*` + seeds demo (`scripts/migrate-schema.ts`) |
| `bun run migrate` | CI Migration 1:1: aplica las migraciones pendientes de `bol_migrations` |
| `bun run i18n:import` | Importa los diccionarios `language/langsrc/*` a `bol_language_comment` |
| `bun run corpus:download` | Descarga los corpus Emdros (ETCBC4, nestle1904, jvulgate) a `data/corpus/` |
| `bun run lexicons:build` | Regenera `data/lexicons.db` desde `data/lexicons/*.csv` + meta legacy |
| `bun run pic2db` | Rebuild de `bol_bible_refs`/`bol_bible_urls` desde resources.learner.bible |
| `bun run maketypeinfo <db>` | Regenera `data/meta/*.typeinfo.json` vía MQL |

> `bun run` puede crashear en WSL con better-sqlite3 (panic NAPI, bug de Bun). Fallback: `pnpm run <script>` (los scripts usan `node`).

## Arquitectura

```
src/
  app/               Rutas App Router; server actions en src/app/actions/
  components/        UI shadcn + componentes de dominio (lector, quiz, clases, stats…)
  legacy-ts/         Port 1:1 del cliente quiz legacy (BibleOL/ts/*.ts) — NO es código
                     muerto: lo usa QuizRunner y el editor
  lib/
    auth/            md5(salt+pw) 1:1 + scrypt lazy-rehash, sesión firmada (jose),
                     guards de rol
    corpus/          Emdros: esquema interno SQLite, traductor MQL→SQL,
                     db-config/typeinfo, diccionario (glosas/hints), lexicon
    db/              sqlite.ts (gestor WAL), schema.sqlite.sql (34 tablas bol_*),
                     migrations/ (runner + 20 migraciones 001-020)
    quiz/            Quiz_data, Suggest_answers, Universe_tree, parser .3et (sax),
                     template-writer (round-trip XML)
    services/        Ports 1:1 de los Mod_* y Ctrl_* del legacy (users, classes,
                     userclass, quizpath, exams, statistics, urls, translate…)
    i18n/            parser $lang de langsrc + overrides bol_language_*, translate
    exams/           XML examcode + deadlines
    grades/          calc_grades_helper (percent/decimal/usletter/german)
    statistics/      Statistics_timeperiod
db/                  schema.sqlite.sql (esquema final, v19)
data/
  meta/              db.json, typeinfo, bookorder, prop.pretty.json (glosas)
  hints/             Bases SQLite de hints (resueltas por nombre en db.json)
  quizzes/           Plantillas .3et (demo + las creadas por profesores)
  lexicons/          CSV → build-lexicons.ts → data/lexicons.db
  corpus/            Corpus Emdros (gitignored, 239 MB)
  usersguide/        Artículos de ayuda PHP → HTML (Ctrl_help)
language/langsrc/    Fuente de verdad de i18n: {abb}/{group}_lang.php (se leen como datos)
tests/               Unit/integración (node --test) + e2e/ (Playwright)
```

**Decisiones de port (fijadas en TASK_LIST):**

- **Contraseñas:** `md5(pw_salt + pw)` idéntico al PHP (compatibilidad BD) + lazy rehash a `scrypt$…` autodescriptivo sin tocar el resto de `bol_user`.
- **Sesiones:** cookie httpOnly firmada con jose (reemplaza la sesión CI).
- **Corpus:** port MQL→SQL directo sobre las bases Emdros SQLite (sin binarios nativos de Emdros).
- **Base de datos:** esquema `bol_*` 1:1 en SQLite; las 20 migraciones del legacy (CI Migration) portadas en `src/lib/db/migrations/` con versión en `bol_migrations`; `bun run migrate` = `Migration::current()`.
- **i18n:** cargador propio sobre `language/langsrc` + `bol_language_{abb}` + property files.
- **XML (.3et, examcode):** sax.
- **Gráficas:** recharts (sustituye RGraph).
- **Editor de descripciones:** TipTap (sustituye CKEditor); el `desc` se guarda como HTML igual que en el legacy.
- **Ejercicios:** filesystem `data/quizzes/` replicando Mod_quizpath (paths y owners en BD).

## Paridad contra el PHP original

La paridad se valida por módulo con tests de integración que ejercitan los mismos inputs que el legacy y verifican los mismos datos:

- **Esquema/datos:** `tests/db.test.ts` (tablas, seeds, hash md5 real, FKs, idempotencia), `tests/migrations.test.ts` (las 20 migraciones, re-aplicación sobre el esquema final).
- **Corpus:** `tests/corpus/` — pasajes fijos (Gn 1:1-3, Jn 1:1, Jn 3:16) en los 3 corpora vs salida esperada; MQL, db-config, diccionario.
- **Quiz:** `tests/quiz/` — payload `show_quiz` 1:1, round-trip XML de los .3et demo, evaluación de respuestas vs el `exercise_model` original (`src/legacy-ts/`).
- **Lector/gramática:** `tests/reader/` (displaymonadobject, sentencegrammar, tooltips), `tests/config.test.ts` (fuentes).
- **Servicios:** auth, users, classes, quizpath, exams, statistics, urls, translate, i18n, file-manager, pic2db, shebanq (ver TASK_LIST por módulo).
- **Flujos de usuario:** e2e Playwright (`tests/e2e/`) — login/política, editor (guardado, timer, modo examen), clases, exámenes, estadísticas, translate, urls, file manager.

## Entorno

| Variable | Uso |
|---|---|
| `BIBLEOL_PW_SALT` | Salt de contraseñas (ol.php) |
| `BIBLEOL_MAIL_FROM` | Remitente de correo (noreply por defecto) |
| `BIBLEOL_SMTP_HOST/PORT/SECURE/USER/PASS` | SMTP; sin configurar → log `[mail demo]` |
| `BIBLEOL_GOOGLE_LOGIN_ENABLED`/`FACEBOOK_LOGIN_ENABLED` | OAuth2 (client id/secret) |
| `BIBLEOL_DATA_DIR` | Directorio de datos (default `./data`) |

## Licencias de datos

- **ETCBC4** (hebreo/arameo, AT): del *Eep Talstra Center for Bible and Computer* (VU Amsterdam), **CC BY-NC 4.0** (https://creativecommons.org/licenses/by-nc/4.0). Identificador persistente: `urn:nbn:nl:ui:13-048i-71` (https://www.persistent-identifier.nl/?identifier=urn:nbn:nl:ui:13-048i-71). Bible OL añade features propias sobre los datos originales (ver techdoc, apéndice ETCBC4).
- **nestle1904** (griego, NT): **dominio público** (texto de Nestle 1904; ver techdoc, apéndice Nestle1904).
- **jvulgate** (latín): Vulgata Clementina (1592) — **dominio público**.

Descarga: `bun run corpus:download` (lee `BibleOL/db/*.location`, gitignore en `data/corpus/`).

El código del proyecto legacy es MIT (© Ezer IT Consulting / Claus Tøndering); las fuentes SIL y CLM (hebreo/griego) se redistribuyen según sus licencias en `public/fonts/` (ver `TASK_LIST.md` y el techdoc del legacy).

## Referencias

- Hoja de ruta por fases: `TASK_LIST.md`
- Repo legacy de referencia: `/home/j/dev/BibleOL/` (bolsetup.sql, myapp/controllers+models+views, ts/, db/, quiz_templates/)
- Instrucciones del agente: `AGENTS.md`
