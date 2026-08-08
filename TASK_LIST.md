# BIBLEOL-NEXT — Hoja de Ruta de Migración (Fork 1:1 de EzerIT/BibleOL)

Monolito modular: Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + shadcn + SQLite (`better-sqlite3`) + Emdros corpus vía port MQL→SQL.

**Fuente legacy:** `/home/j/dev/BibleOL` (PHP/CodeIgniter 3 + MySQL + Emdros/MQL + jQuery). Cliente TS original en `BibleOL/ts/` (17.7k líneas) portado casi literal a `src/legacy-ts/`.
**Regla de oro:** lógica de negocio, esquema `bol_*` y flujo de usuario 1:1. Sin funcionalidades nuevas. `bun run typecheck` (tsc --noEmit, 0 errores) después de cada módulo.

---

## FASE 0 — Fork y esqueleto ✅
- [x] Crear `/home/j/dev/bibleol-next` con `create-next-app` (Next 16.3.0, React 19.2.8, TS, Tailwind v4, App Router, src dir, bun)
- [x] Instalar dependencias core: `better-sqlite3` (13.0.3, trustedDependencies + ignoreScripts), `jose`, `sax`, `clsx`, `tailwind-merge`, `cva`, `lucide-react`, `@types/better-sqlite3`, `@types/sax`
- [x] `next.config.ts` con `serverExternalPackages: ["better-sqlite3"]`
- [x] shadcn init (preset nova/base, igual que alethia-bridge) + 23 componentes UI base
- [x] Scripts npm: `typecheck`, `test`, `db:init`, `corpus:download`
- [x] Validación: typecheck 0 errores, lint limpio, `bun run build` OK
- [x] Descargar corpus Emdros (ETCBC4 204 MB, nestle1904 22 MB, jvulgate 13 MB) desde `BibleOL/db/*.location` (dropbox `dl=1`) → `data/corpus/` (gitignored)
- [x] Técnica spike: esquema SQLite interno Emdros descifrado (viable, port directo). Hallazgos:
  - `<otype>_objects`: `object_id_d` PK, `first_monad`/`last_monad` INT, `monads` TEXT (compresión Emdros; decodificador en Fase 3, para words = monad único), columnas `mdf_<feature>`
  - Enums (sp, gn, nu, vs, vt, st…): INT → `enumeration_constants` (enum_id, value, name) — JOIN para resolver valores
  - Strings (`g_word_utf8`, `lex`…): INT → `<otype>_mdf_<feat>_set` (id_d ↔ string_value); textos libres inline TEXT (`mdf_g_lex_translit`, `mdf_verb_class`, `mdf_domain`)
  - Jerarquía: `mdf_mother`, `mdf_functional_parent`, `mdf_distributional_parent`, `mdf_mother_object_type` (apuntan a `object_id_d`)
  - Monad sets nombrados: `monad_sets`/`monad_sets_monads`; bounds globales `min_m`/`max_m` (ETCBC4: 1..426583); índices `*_fm_i` en first_monad → `find_monads` vía `first_monad BETWEEN`
  - Verificado Gn 1:1: book=1 (monads 1-28762), verse " GEN 01,01" (1-11), words con `g_word_utf8` (בְּ…), `lex` (B, R>CJT/, BR>[…), sp enums — igual que el typeinfo del repo

## FASE 1 — Capa de datos (esquema bol_* 1:1) ✅
- [x] `src/lib/db/sqlite.ts`: gestor WAL (patrón alethia-bridge) + 34 tablas `bol_*` (bolsetup.sql 1:1 + bol_class/bol_userclass/bol_migrations) en `db/schema.sqlite.sql` (mysql→sqlite: tinyint→INTEGER, tinytext/text→TEXT, timestamps INT, ENGINE/COLLATE eliminados, FKs cascade sobre bol_user/bol_exam)
- [x] `scripts/migrate-schema.ts` (`bun run db:init`): idempotente — esquema + `src/lib/db/seed.ts` (usuarios demo admin/teacher/student con `md5(salt+pw)` real, clase "Demo Class", enrollments, userconfig) + copia de `quiz_templates/` → `data/quizzes/`
- [x] `src/lib/config.ts`: config del monólito (← ol.php-dist): pw_salt, paginación, mql_driver, oauth2 flags (env), mail
- [x] Tests de integración (`tests/db.test.ts`, 6/6): esquema completo, seeds bolsetup (lexicons 10085/5433/4581/800/76, alfabetos, fuentes, idiomas, migrations v19), hash md5 PHP, FKs cascade, idempotencia

## FASE 2 — Auth y usuarios (Ctrl_login, Ctrl_users, Mod_users) ✅
- [x] `src/lib/auth/password.ts`: `md5(pw_salt + pw)` idéntico al PHP + `generate_pw` (juego de caracteres sin I/l/1/O/0) + claves hex 32
- [x] `src/lib/auth/session.ts`: cookie httpOnly firmada con jose (HS256) con userId/language/variant — reemplaza sesión CI (`ol_user`, `language`, `variant`)
- [x] `src/lib/services/users.ts` (← Mod_users, 550 líneas 1:1): verify_login, roles (admin/teacher/translator), is_logged_in(_noaccept), CRUD set_user/delete_user (font + exerciseowner→0), reset keys (48h), acceptance code (15 min), política (CURRENT_POLICY_DATE 1512390210), OAuth2 (ggl_/fcb_), expiración (48h/9m/17m/18m), generate_administrator/student
- [x] `src/lib/auth/guards.ts`: check_logged_in / check_teacher / check_admin / check_translator / check_logged_in_local (DataException + redirect /login)
- [x] Rutas: `/login`, `/sign-up`, `/forgot-pw`, `/reset/[key]` (one-click, genera pw y envía mail), `/profile` (+ delete_me), `/admin/users` (paginación/orden/filtros/borrar con confirm), `/admin/users/edit` (userid=-1 = nuevo), gating de política en `/`
- [x] Server Actions (patrón useActionState): login/logout/sign_up/forgot_pw/reset/accept_policy_yes/no/edit_profile/delete_me/admin_save_user/admin_delete_user
- [x] `src/lib/mail.ts`: nodemailer (SMTP env) con fallback log `[mail demo]` — valida contraseña generada en sign_up/reset
- [x] E2E curl contra dev server: login→política→home logueado→admin users→crear usuario con roles (verificado en BD)

## FASE 3 — Capa de corpus (port MQL→SQL) [MAYOR RIESGO]
- [ ] `src/lib/corpus/emdros-schema.ts`: reverse-engineering esquema SQLite interno Emdros (objetos, features, monads) de ETCBC4 / nestle1904 / jvulgate
- [ ] `src/lib/corpus/mql.ts`: traductor del subconjunto MQL usado por BibleOL (~30 patrones de Mod_askemdros/Dictionary) → SQL directo parametrizado
- [ ] `src/lib/corpus/db-config.ts` (← Db_config + `*.db.json`): typeinfo parser (objectSettings, featuresetting, indirdb/sql_command para gloss/hint/glossurl), sentencegrammar, universeHierarchy, charSet, surfaceFeature
- [ ] Property files: parser `property_files/*.lang.prop.pretty.json` (glosas 12 idiomas) + `ETCBC4_hints.db` / `ETCBC4_words.db` reutilizados tal cual
- [ ] `find_monads`, `getMonadsAtLevel`, fullUniverse (← Mod_askemdros + Mql)
- [ ] Tests de paridad: pasajes fijos (Gn 1:1-3, Jn 1:1, Jn 3:16) en los 3 corpora vs salida esperada

## FASE 4 — Lector de texto (Ctrl_text, Dictionary)
- [ ] `src/lib/reader/dictionary.ts` (← Dictionary.php server-side): monset sets, constructHierarchy, addMonadObject, getVisual, indirectLookup (gloss/hint/glossurl)
- [ ] Rutas: `/text` (select_text: selección de texto/idioma), `/text/show` (show_text) — RSC
- [ ] Componentes `src/components/reader/`: render por monadas con jerarquía oracional (frase/cláusula/subfrase), selección de palabra, glosas, hints, fonts SIL, transliteración, RTL/LTR, variantes
- [ ] `src/components/reader/PassageTree.tsx` (← view_passage_tree_script + `*.bookorder` + jstree)
- [ ] `src/components/reader/GrammarBox.tsx` (← GrammarSelectionBox TS + sentencegrammar)
- [ ] Fonts: copiar SIL fonts → `public/fonts` + `view_font_css` + Ctrl_config::fonts
- [ ] SHEBANQ link (← Mod_askemdros::shebanq_link)

## FASE 5 — Motor de quiz (Mod_askemdros + ts/ port)
- [ ] `src/legacy-ts/`: port literal de `BibleOL/ts/*.ts` (util, configuration, charset, monadobject, displaymonadobject, sentencegrammar, dictionary, quizdata, panelquestion, quiz, grammarselectionbox, localization, stringwithsort, resizer, statistics) como módulos TS puros sin DOM
- [ ] `src/lib/quiz/` (← Quiz_data.php, Suggest_answers, Universe_tree, ExtendedQuizFeatures): features show/request, pseudofeatures, glosslimit, virtualkeyboard, dropdown
- [ ] `src/lib/quiz/template-parser.ts`: parser `.3et` XML con sax (questiontemplate v1/v3, sentenceselection, featurehandlers, quizfeatures, paths)
- [ ] `src/lib/services/text-quiz.ts` (← Mod_askemdros): show_quiz/new_quiz/edit_quiz, parseQuiz/decodeQuiz, show_test_quiz, package/save_quiz, get_quiz_universe, db_and_books
- [ ] Rutas: `/quiz` (select_quiz), `/quiz/run` (show_quiz), `/quiz/test`, `/quiz/editor` (edit_quiz/new_quiz), `/quiz/universe` (show_quiz_univ, add_universe_level)
- [ ] `src/components/quiz/QuizRunner.tsx`: envoltura React del port `Quiz`/`PanelQuestion` (flujo next/prev/finish, progress, timer, exam_mode)
- [ ] `src/components/quiz/PanelTemplate*.tsx` (← paneltemplmql/quizfeatures/quizobjectselector/sentenceselector)
- [ ] Server Action `update_stat` (← Ctrl_statistics::update_stat + Mod_statistics endQuiz): escribe bol_sta_quiz/bol_sta_question/bol_sta_requestfeature/bol_sta_displayfeature + grading flag
- [ ] `src/components/quiz/VirtualKeyboard.tsx` (hebreo IL Biblical Hebrew SIL / griego polytonic)
- [ ] Editor de ejercicios (← editquiz.ts port + view_edit_quiz)
- [ ] Tests: paridad de evaluación de respuestas vs exercise_model original

## FASE 6 — Clases y ejercicios (Ctrl_classes, Ctrl_userclass, Mod_quizpath)
- [ ] `src/lib/services/classes.ts` (← Mod_classes + Ctrl_classes): CRUD, change_owner, delete_class, add_one_grader, edit_one_class, enrol_before
- [ ] `src/lib/services/userclass.ts` (← Mod_userclass + Ctrl_userclass): users_in_class, classes_for_user, enroll (con password de clase), enroll_by_folder, unenroll, manage_access
- [ ] `src/lib/services/quizpath.ts` (← Mod_quizpath): init paths, dirlist (árbol de ejercicios), owners (bol_exerciseowner), time_seconds, mkdir/rename/rmdir/delete, fix_exerciseowner, chown_files
- [ ] `src/lib/services/exercise-dir.ts` (← Mod_classdir + bol_exercisedir/bol_classexercise)
- [ ] Rutas: `/classes`, `/classes/:id`, `/enroll`, `/exercises` (dirbrowser tipo jstree → componente React tree)
- [ ] Tests de integración de árbol de ejercicios

## FASE 7 — Exámenes (Ctrl_exams, Mod_exams)
- [ ] `src/lib/exams/exam-xml.ts`: parser XML `examcode` con sax (exercises/exercisename/numq/description + parámetros)
- [ ] `src/lib/services/exams.ts` (← Mod_exams + Ctrl_exams): create_exam, create_exam_instance, edit_exam, delete_exam(_instance), get_active_exam, get_completed_exam_exercises, getDirContents/children
- [ ] `src/lib/exams/instance.ts`: deadlines (bol_exam_status: start_time/deadline = min(end, start+duration)), teacher override
- [ ] Rutas: `/exams` (manage/new), `/exams/active`, `/exams/take` (take_exam con encadenado `exercise_lst`), `/exams/done`, `/exams/quiz` (show_quiz en exam_mode)
- [ ] Server Actions: save_exam, submit_exam_quiz (bol_exam_finished + bol_exam_results), update_exam_quiz_stat
- [ ] Timer de examen en cliente (deadline → auto-finish)

## FASE 8 — Notas y estadísticas (Mod_grades, Mod_statistics, Ctrl_grades, Ctrl_statistics)
- [ ] `src/lib/grades/scales.ts` (← calc_grades_helper.php): esquemas percent/decimal/usletter/german + cálculo porcentaje→nota
- [ ] `src/lib/services/grades.ts` (← Mod_grades, 1026 líneas): get_exercise_scores, class/teacher/student views, add_grader, edit_visibility, ownership
- [ ] `src/lib/services/statistics.ts` (← Mod_statistics, 536 líneas): newQuizTemplate, startQuiz, endQuiz, quizRequestedFeatures, allTemplates/Quizzes, get_score_by_date_user_templ, get_features_by_date_user_templ, get_quizzes_duration, purge
- [ ] `src/lib/statistics/period.ts` (← Statistics_timeperiod.php)
- [ ] Rutas: `/stats` (show_stat student), `/stats/time`, `/stats/exercises`, `/grades` (teacher: classes/exams/exercises; progress charts)
- [ ] Gráficas con recharts (sustituye RGraph: graphing.js + handle_legend.js → componentes React)
- [ ] Export CSV/Excel (← table2csv/table2excel → lib client-side)

## FASE 9 — Periferia (post-hito core)
- [ ] i18n completo: cargador langsrc (12 idiomas) + rol traductor (Ctrl_translate + Mod_translate + bol_language_en + bol_translation_languages)
- [ ] `src/lib/i18n/`: diccionario de UI + `l10n_json` para cliente (← localization.ts/localization_general.ts)
- [ ] URLs y refs bíblicas (Ctrl_urls + bol_bible_refs/bol_bible_urls/bol_heb_urls + view_select_gloss)
- [ ] OAuth2 Google/Facebook (Ctrl_oauth2, bol_user.oauth2_login) — Auth.js
- [ ] File manager + upload (Ctrl_file_manager, Ctrl_upload, valums) — route handlers multipart
- [ ] pics (Ctrl_pic2db + bol_bible_refs.picture + resources.3bmoodle.dk)
- [ ] SHEBANQ (Ctrl_shebanq), privacy, help, migrate (bol_migrations), maketypeinfo
- [ ] CKEditor → TipTap (edición de descripciones/notas)

## FASE 10 — Cierre y validación E2E
- [ ] `bun run typecheck` 0 errores, lint, build, suite de tests completa
- [ ] Paridad por módulo contra PHP original (mismos inputs → mismos datos en SQLite)
- [ ] README.md de arquitectura + actualizar TASK_LIST con estado final
- [ ] Paquete de corpus: documentar licencias (ETCBC4, Nestle 1904, JVulgate) y `bun run corpus:download`

---

## Decisiones técnicas fijadas (aprobadas)
| Decisión | Resolución |
|---|---|
| Contraseñas | `md5(pw_salt + pw)` idéntico al PHP (compatibilidad BD) |
| Sesiones | Cookies firmadas jose/httpOnly (reemplaza sesión CI) |
| Corpus | Port MQL→SQL directo sobre bases Emdros SQLite (sin binarios nativos) |
| i18n | Cargador propio sobre langsrc + bol_language_en + property_files |
| XML (.3et, examcode) | `sax` |
| Charts | recharts (reemplaza RGraph) |
| UI | shadcn + Tailwind v4, RTL/UI bidi, fuentes SIL en public/fonts |
| Ejercicios | Filesystem `data/exercises/` replicando Mod_quizpath (paths + owners en BD) |
| Semilla | Esquema + usuarios demo + 1 examen XML de ejemplo + quizzes `.3et` demo (ETCBC4 + Nestle 1904) |

## Referencias del repo legacy (BibleOL/)
- Esquema MySQL: `bolsetup.sql` (28 tablas bol_*)
- Controladores: `myapp/controllers/Ctrl_*.php` (22)
- Modelos: `myapp/models/Mod_*.php` (14)
- Vistas: `myapp/views/view_*.php` (~75)
- Cliente TS: `ts/*.ts` (26 módulos, 17.7k líneas → `src/legacy-ts/`)
- Corpus: `db/*.location` (Dropbox), `db/*.db.json` (typeinfo), `db/property_files/*` (glosas 12 idiomas), `db/*_hints.db`/`db/*_words.db` (SQLite reutilizables)
- Plantillas quiz: `quiz_templates/{ETCBC4,Nestle 1904}/demo/*.3et`
- Config: `myapp/config/ol.php-dist`, `myapp/config/database.php-dist`
