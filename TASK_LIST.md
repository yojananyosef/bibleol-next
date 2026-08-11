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

## FASE 3 — Capa de corpus (port MQL→SQL) ✅
- [x] `src/lib/corpus/emdros-schema.ts`: reverse-engineering esquema SQLite interno Emdros (objetos, features, monads) de ETCBC4 / nestle1904 / jvulgate — `openEmdros`, `objectMonadSet`, `resolveFeatureValue` (enums/strings via tablas set), `getMonadRange`
- [x] `src/lib/corpus/mql.ts`: traductor del subconjunto MQL usado por BibleOL (~30 patrones de Mod_askemdros/Dictionary) → SQL directo parametrizado — `createMql` (exec/execCommand, fast-path first/last + fallback monads con object_type_id), matchBlock/selectObjectsInMonadSet, features→enums, tipo OlSheaf/OlTable
- [x] `src/lib/corpus/db-config.ts` (← Db_config + `*.db.json`): typeinfo parser (objectSettings, featuresetting, indirdb/sql_command para gloss/hint/glossurl), sentencegrammar, universeHierarchy, charSet, surfaceFeature; TypeInfo (JSON o desde MQL); addgloss_* (dbinfo/typeinfo/l10n por idioma de léxico); bol_db_localize con fallback a `<pr>.<lang>.prop.pretty.json`
- [x] Property files: parser `property_files/*.lang.prop.pretty.json` (glosas 12 idiomas, emdrostype/grammargroup/grammarsubfeature/emdrosobject) + `ETCBC4_hints.db` / `ETCBC4_words.db` reutilizados tal cual (indirdb → `data/hints/`, `data/lexicons.db` espejo bol_lexicon)
- [x] `find_monads`, `getMonadsAtLevel`, fullUniverse (← Mod_askemdros + Mql) — `src/lib/corpus/emdros.ts` (getEmdros, findMonads, dbAndBooks, shebanqLink)
- [x] Tests de paridad: pasajes fijos (Gn 1:1-3, Jn 1:1, Jn 3:16) en los 3 corpora vs salida esperada — `tests/corpus/` (emdros/db-config/dictionary/mql + reader)

## FASE 4 — Lector de texto (Ctrl_text, Dictionary) ✅ (completada; validada con 38 tests en tests/reader + tests/config + tests/corpus)
- [x] `src/lib/corpus/dictionary.ts` (← Dictionary.php server-side): monset sets, constructHierarchy, addMonadObject, getVisual, indirectLookup (gloss/hint/glossurl), bcv/Patriarch, toJSON para el cliente
- [x] Rutas: `/text` (select_text: selección de texto/idioma) y `/text/[db]/[book]/[chapter]/[vfrom]/[vto]` (show_text) — RSC — `src/app/text/`, `src/lib/services/corpus.ts` (showText/dbAndBooks)
- [x] Render por monadas con jerarquía oracional (frase→sentence), numerado de versículos, glosas en tooltip, RTL/LTR (`<bdi>`) — `src/components/text/text-display.tsx`
- [x] Clic en palabra → diálogo de información gramatical (port `toolTipFunc`/`clickForGrammar`) — `src/lib/reader/sentencegrammar.ts` (walkers + localización l10n/typeinfo), `src/lib/reader/grammar-info.ts`, `src/components/text/grammar-dialog.tsx`
- [x] SHEBANQ link (← Mod_askemdros::shebanq_link)
- [x] Hints: infraestructura indirdb portada (→ `src/lib/corpus/lexicon.ts`, `ETCBC4_hints.db` vía `data/hints/`); la feature `hint` solo se usa en el quiz (featType 'hint' de panelquestion.ts) → se completa en Fase 5 (el diálogo de gramática legacy NO muestra hints)
- [x] GrammarBox (← GrammarSelectionBox TS + displaymonadobject): vista de gramática con cajas por frase/cláusula — `src/lib/reader/display.ts` (árbol DisplayMonadObject 1:1: segmentos hasp/hass, dummy, Patriarch, wordgrammar, clause_atom:tab, indentationIndicator), `src/components/text/grammar-box.tsx` (FollowerBox border/seplin/wordspace implícitos, adjustDivLevWidth, sangría ETCBC4, sessionStorage por db), `src/components/text/grammar-panel.tsx` (checkboxes por nivel con grupos, color-limit, clear), `src/components/text/grammar-display.css` (port ol.css); toggle Text/Grammar en text-display; tests `tests/reader/display.test.ts` (7)
- [x] Fonts: SIL/CLM webfonts → `public/fonts/` (woff/ttf, titillium con woff2) + `src/app/fonts.css` (port styles/fonts.css, @font-face modernos) + `src/lib/reader/font-css.ts` (port view_font_css.php: clases `.hebrew/.greek/…` con font-family/direction y estilos textdisplay/wordgrammar/tooltip/input) + `src/lib/services/config.ts` (← Mod_config: alphabets, font_setting con fallback user_id=0, avail_fonts, personal_font, set_font, font_selection) + `/settings/fonts` (← Ctrl_config::fonts + view_font_settings: tabs por alfabeto, radio de fuentes + personal, bold/italic/size por estilo, server action save) + clases foreign/transliterated reales en palabras (`textdisplay ${charset.foreignClass}`) y font CSS por usuario inyectado en `/text/[...parts]`; tests `tests/config.test.ts` (8)

## FASE 5 — Motor de quiz (Mod_askemdros + ts/ port) [~90% — quedan: /quiz/test + VirtualKeyboard + selectors del editor]
- [x] `src/legacy-ts/`: port de `BibleOL/ts/*.ts` **según necesidad** — 14 módulos puros sin DOM (util, configuration, dictionary, monadobject, displaymonadobject, localization, stringwithsort, quizdata, panelquestion, quiz, statistics, answer, componentwithyesno + tests `tests/quiz/legacy-ts.test.ts`); charset/sentencegrammar/grammarselectionbox/resizer viven portados en `reader/*` y `components/quiz/editor/*`
- [x] `src/lib/quiz/` (← Quiz_data.php, Suggest_answers, Universe_tree, ExtendedQuizFeatures): `quiz-data.ts` (Quiz_data/getNextCandidate/fetchBookLimit, ExtendedQuizFeatures), `suggest.ts` (Suggest_answers), `universe-tree.ts` (Universe_tree + TreeNode jstree: get_jstree/expandLevel/searchMarked)
- [x] `src/lib/quiz/template-parser.ts`: parser `.3et` XML con sax (questiontemplate v1/v3, sentenceselection, featurehandlers, quizfeatures, paths)
- [x] `src/lib/services/text-quiz.ts` (← Mod_askemdros): **hecho** — show_quiz (payload 1:1 view_text_display: quizData_json/dictionaries_json/dbinfo/l10n/l10n_js/typeinfo, useTooltip←bol_userconfig, time_seconds←bol_exerciseowner), get_quiz_universe, add_universe_level, parseQuiz/parseQuizBasic/decodeQuiz/parsePath/strip_monads, new_quiz (JSON por defecto), edit_quiz, show_test_quiz, package_test_quiz/save_quiz (vía `src/lib/quiz/template-writer.ts`, port de Template::writeAsXml + MqlData + FeatureHandlerList + 6 handlers + QuizFeatures; round-trip de los .3et demo verificado)
- [x] Rutas: `/quiz` (select_quiz), `/quiz/run` (show_quiz), `/quiz/editor` (edit_quiz/new_quiz), `/quiz/universe` + `/quiz/universe-level` (show_quiz_univ, add_universe_level), `/quiz/test` (Ctrl_text::test_quiz — check_teacher + showTestQuiz con count=5; el editor navega ahí tras testQuizAction)
- [x] `src/components/quiz/PassageTree.tsx` (← view_passage_tree_script + `Universe_tree` expand_level + `*.bookorder` + jstree): árbol de pasajes para selección de quiz y editor
- [x] `src/components/quiz/QuizRunner.tsx`: envoltura React del port `Quiz`/`PanelQuestion` — flujo next/prev/finish, progress bar, timer (auto-submit con envío de estadísticas), exam_mode (exercise_lst encadenado + /exams/done); fix de raíz: `sendStatistics` serializa `JSON.parse(JSON.stringify(statistics))` antes de la server action (las instancias de clases legacy no cruzan el flight boundary)
- [x] `src/components/quiz/editor/` (← paneltemplmql/quizfeatures/quizobjectselector/sentenceselector): quiz-editor.tsx + tabs features/mql-panel/universe/timer — el selector friendly→MQL (makeMql) y el selector de objeto cubren sentenceSelection/quizObjectSelection
- [x] Server Action `update_stat` (← Ctrl_statistics::update_stat + Mod_statistics endQuiz): `src/app/actions/statistics.ts` — updateStatAction/updateExamQuizStatAction escribe bol_sta_quiz/bol_sta_question/bol_sta_requestfeature/bol_sta_displayfeature + grading flag
- [x] `src/components/quiz/VirtualKeyboard.tsx` (layouts `IL Biblical Hebrew (SIL)` + `GR Greek Polytonic` del widget legacy VirtualKeyboard.full.3.7.2): teclado flotante que inserta en el input con foco (setter nativo + evento input, inputs controlados); toggle en QuizRunner cuando `quizFeatures.useVirtualKeyboard` (p. ej. foreignText) y charSet hebrew/greek
- [x] Editor de ejercicios (← editquiz.ts port + view_edit_quiz): `src/lib/services/quizeditor.ts` (calcTimeLimit con buffer +3s, checkQuizName, submitQuiz, testQuiz) + acciones en `src/app/actions/quizeditor.ts` — validado con **5 e2e** en `tests/e2e/editor.e2e.test.ts` (SAVE sin grading, timer auto-submit, modo examen con bol_exam_results/bol_exam_finished)

## FASE 5 ✅ — quedan solo periféricos opcionales (port del widget vk completo 5.9MB, selectors visuales del editor)
- [x] Tests: paridad de evaluación de respuestas vs exercise_model original (`tests/quiz/text-quiz.test.ts` 5/5: payload showQuiz sin login, QuizError, árbol universo, expandLevel, getTimeSeconds) + `tests/quiz/template-writer.test.ts` (6: round-trip XML de todos los .3et demo, MQL directo, orden de requestFeatures, package/save a fichero, error de escritura, newQuiz)

## FASE 6 — Clases y ejercicios (Ctrl_classes, Ctrl_userclass, Mod_quizpath) [completada ✅ — rutas + UI + e2e]
- [x] `src/lib/services/quizpath.ts` (← Mod_quizpath): init paths, dirlist (árbol de ejercicios), owners (bol_exerciseowner), time_seconds, mkdir/rename/rmdir/delete, fix_exerciseowner, chown_files + `QuizPathBrowser.tsx`
- [x] `src/lib/services/classes.ts` (← Mod_classes, 151 líneas 1:1): get_all_classes (join owner, sin colisión de columnas), get_class_by_id (-1 = nueva), get_classes_by_ids, get_classes_owned, get_named_classes_owned (owner + grader sin duplicados), get_named_classes_enrolled, set_class (insert/update, password/enrol_before vacíos → NULL), delete_class (limpia userclass/classexercise), chown_class (solo profesor/admin)
- [x] `src/lib/services/userclass.ts` (← Mod_userclass 1:1 + lógica de Ctrl_userclass): get_users_in_class, get_named_users_in_class (family_name_first), update_users_in_class, get_classes_for_user, get_classes_and_access, update_classes_for_user, enroll_user/unenroll_user/change_access/gave_access + before_date (Europe/Copenhagen), enrollAvailability (prioridad + enrol_before), enrollIn (password de clase), manageAccess, unenrollFrom, usersInClass/classesForUser (guardas owner/admin)
- [x] Tests de integración `tests/classes.test.ts` (10): CRUD, join/alias, ownership+grader, chown, enroll con password y caducidad, sync bidireccional, acceso, beforeDate
- [x] `Mod_classdir` — portado completo dentro de `quizpath.ts` (getClassesForDir/mayAccess/filterDirectories con bol_exercisedir + bol_classexercise); no hace falta un `exercise-dir.ts` separado
- [x] Rutas y UI de clases (guardas checkTeacher/checkLoggedIn, 1:1 con view_class_list / view_edit_class / view_edit_users_in_class / view_enroll_in_class):
  - [x] `/classes` — lista para profesores (tabla con password/enrol_before/owner), "Add class" → `/classes/-1`, y por clase: Assign users / Edit / Delete (dialogo) / Change owner (admin) / Add grader (admin) — `src/app/classes/page.tsx` + `class-ops.tsx`
  - [x] `/classes/[id]` — editar nombre/password/enrol_before; `-1` inserta (`saveClassAction` → set_class)
  - [x] `/classes/[id]/users` — checkboxes en dos columnas (family_name_first), Save reemplaza membresía (`updateUsersInClassAction`)
  - [x] `/enroll` — disponible/prioridad + enrol_before, enroll con diálogo de password, grant/revoke access, unenroll (`src/components/classes/enroll-panel.tsx`)
- [x] E2E `tests/e2e/classes.e2e.test.ts` (6): crear clase con password visible, 500 para alumno en /classes, enroll con password erróneo/correcto, asignar usuario, grant access + unenroll (recarga de datos tras cada acción en enroll-panel), borrado

## FASE 7 — Exámenes (Ctrl_exams, Mod_exams) [completada ✅ — rutas + servicios + UI + e2e]
- [x] Corazón del flujo ya vivo: `updateExamQuizStatAction` (escribe bol_exam_finished + bol_exam_results), `/exams/done`, modo examen en QuizRunner (searchParams examid + exercise_lst encadenado) — **verificado en e2e con bol_exam + bol_exam_active sembrados** (`tests/e2e/editor.e2e.test.ts` test 4)
- [x] `src/lib/exams/exam-xml.ts`: build + parser XML `examcode` con sax (exercises/exercisename/numq/description + parámetros) + hash md5 (round-trip verificado en `tests/exams.test.ts`)
- [x] `src/lib/services/exams.ts` (← Mod_exams + Ctrl_exams): create_exam, create_exam_instance, edit_exam, delete_exam(_instance), get_active_exam, get_completed_exam_exercises, getDirContents/children, takeExamData (exercises + status)
- [x] `src/lib/exams/instance.ts`: deadlines (bol_exam_status: start_time/deadline = min(end, now+duration)) + examStage; el profesor ve end_time
- [x] Rutas: `/exams` (manage + create/edit/delete), `/exams/active` (instancias Active/Future), `/exams/take` (redirect a `/quiz/run` con `exercise_lst` + `deadline`), `/exams/done`
- [x] Server Actions: save_exam, delete_exam(_instance), create_exam_instance (datetimes → unix), get_take_exam, getDirContents
- [x] Timer de examen en cliente: QuizRunner prop `examDeadline` → countdown min(quiz, examen) y auto-finish
- [x] Fix de raíz en el encadenado: `sendStatistics` del runner devuelve `false` en modo examen (el `.then` del engine legacy ya no pisa la navegación) + `key` en `/quiz/run` para remontar el motor por ejercicio (soft navigation ya no reutiliza el quiz anterior)
- [x] e2e completos en `tests/e2e/exams.e2e.test.ts` (2 tests: profesor crea/edita/programa + alumno toma el examen completo con encadenado, selects y teclado virtual)

## FASE 8 — Notas y estadísticas (Mod_grades, Mod_statistics, Ctrl_grades, Ctrl_statistics) [completada ✅ — rutas + servicios + gráficas + export + e2e]
- [x] `src/lib/services/statistics.ts` (← Mod_statistics, núcleo): newQuizTemplate, startQuiz, endQuiz (grading flag + tiempos + features), quizRequestedFeatures, hashCode, allTemplates/allQuizzes, getScoreByDateUserTemplGrades (con featpermin real), getFeaturesByDateUserTempl (req + features por fecha), getClassesForPathname, maySeeNongraded, getScoreByUserActiveExam, getQuizDetail (hint de disp_type/disp_value) + tests `tests/quiz/statistics.test.ts` + `tests/statistics/report.test.ts` (15) — fix división entera SQLite (`* 1.0`), `getExamsForClass` con `exam_name`, `getPathnamesForClass(classid, studentIds?)` sin `.3et`
- [x] `src/lib/grades/scales.ts` (← calc_grades_helper.php): esquemas percent/decimal/usletter/german + cálculo porcentaje→nota (+ tests `tests/statistics/scales.test.ts`, 6)
- [x] `src/lib/statistics/period.ts` (← Statistics_timeperiod.php): StatisticsPeriod "short"/"long", MAX_PERIOD 26 semanas, utilidades de cadena/fecha (+ tests `tests/statistics/period.test.ts`, 9)
- [x] Rutas alumno: `/stats` (show_stat: quizzes + req features con l10n), `/stats/time` (horas/semana + horas/ejercicio), `/stats/exercises` (scatter % + HBar features, toggle nongraded)
- [x] Rutas profesor: `/grades` (clases propias/matriculadas con links Exercises+Exams), `/grades/class/[classid]/exercises` (notas + gráficas por fecha + % por feature), `/grades/class/[classid]/exams` (notas ponderadas por examen), `/grades/class/[classid]/quiz/[quizzid]` (detalle por pregunta)
- [x] Gráficas con recharts (`src/components/stats/charts.tsx`): WeeklyBar, ExerciseHours, DailyScatter, DailyLines, FeatureBars, FeatureGroupedBars (sustituye RGraph)
- [x] Export CSV/Excel client-side (`src/components/stats/export-buttons.tsx`) + GradeTable colapsable (header "hgst grade" + detalle)
- [x] L10n de features (`src/lib/statistics/feature-l10n.ts`): loadFeatureL10n desde bol_db_localize / prop.pretty.json con stripSortIndex
- [x] E2E `tests/e2e/stats.e2e.test.ts` (4): estudiante /stats, /stats/exercises, /stats/time; profesor /grades + tabla de notas 50% + CSV — datos de quiz sembrados (prepareQuiz/cleanup)

## FASE 9 — Periferia (post-hito core)
- [x] i18n: tramo interfaz + traductor — `language/langsrc/` copiado (11 idiomas); `src/lib/i18n/php-lang.ts` (parser `$lang`, comment/format/use_textarea, validado 1:1: en 944, da 759, nl 723, pt 897, zh 552×2…) + `loader.ts` (cache + overrides BD `bol_language_{abb}` + dbOverrides) + `translate.ts` (rol traductor: ensureLangTable con backticks para `-`, import, list, counts, getIfLinesPart/Untranslated, updateIfLines con variantes; gramática getGrammargroupList/count/getGrammarLinesPart/Untranslated/updateGrammarLines con bol_db_localize fallback a `data/meta/*.prop.pretty.json`; modifyLocalization, addLanguage) + `bol_language_comment` en schema+migración + `scripts/import-lang.mjs` (importa los 11 idiomas)
- [x] Rutas traductor: `/translate` (→ if), `/translate/if` (paginación, sorting, selects grupo/lang, editor con revert/modif-indicator), `/translate/grammar` (db + name_prefix), `/translate/list` (progreso, enable/disable, add language) + server actions `src/app/actions/translate.ts` (guards translator) + tests `tests/i18n/*` (12)
- [x] `src/lib/i18n/` diccionario de UI + l10n para clientes: `l10n.ts` (t/getL10nJson/getL10nObject); idioma de sesión vía `sessionLanguage()` + selector `LangSelect` (Ctrl_lang: `/lang?lang=xx` y `/lang/variant?variant=xx` como route handlers por cookies) — hito parcial (léxico en fase posterior)
- [x] l10n aplicada a páginas principales: `src/app/page.tsx` (header con menu_lang + welcome/welcome2/intro_center, enlace traductor) + `src/app/login` + `src/app/sign-up` + `src/app/profile` (server wrapper pasa claves traducidas a los client components con `langLine(lang, group, key)`) — e2e `tests/e2e/translate.e2e.test.ts` (3: l10n home+login, editar cadena en /translate/if, grammar ETCBC4)
- [ ] i18n léxico (translate_lex / edit_lex / update_lex + bol_lexicon_* + view_translate case 'lexicon') — diferido
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
