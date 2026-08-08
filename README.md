# BibleOL Next

Migración 1:1 (fork) de [EzerIT/BibleOL](https://github.com/EzerIT/BibleOL) — Bible Online Learner — desde PHP/CodeIgniter 3 + MySQL + Emdros/MQL + jQuery hacia un monolito modular moderno.

**Stack:** Next.js 16 (App Router, RSC) · TypeScript strict · Tailwind v4 · shadcn · SQLite (`better-sqlite3`) · cookies firmadas (jose) · sax (XML)

## Comandos

```bash
bun install           # dependencias (better-sqlite3 binario prebuilt; ver ignoreScripts)
bun run dev           # servidor de desarrollo en http://localhost:3000
bun run typecheck     # tsc --noEmit (0 errores obligatorio tras cada módulo)
bun run lint          # eslint
bun run build         # build de producción
bun run test          # tests de integración (node --test)
bun run db:init       # crea la BD SQLite con el esquema bol_* 1:1 + seeds demo
bun run corpus:download  # descarga los corpus Emdros (ETCBC4, nestle1904, jvulgate)
```

## Arquitectura

Ver `TASK_LIST.md` (hoja de ruta por fases) y `BibleOL/` (repositorio legacy de referencia: `bolsetup.sql`, `myapp/`, `ts/`, `db/`, `quiz_templates/`).

**Regla de oro:** lógica de negocio, esquema `bol_*` y flujo de usuario 1:1. El cliente original de BibleOL ya está en TypeScript (`ts/*.ts`) y se porta casi literal a `src/legacy-ts/`.
