/**
 * services/quizpath.ts — Réplica 1:1 de `models/Mod_quizpath.php` (+ las
 * funciones de `Mod_classdir` que usa: get_classes_for_dir / may_access /
 * filter_directories) sobre el filesystem `data/quizzes/`.
 */

import { mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, copyFileSync } from "node:fs";
import path from "node:path";
import { QUIZZES_DIR, getAppDb } from "../db/sqlite.ts";
import { harvest } from "../quiz/template-parser.ts";
import { decodeQuiz, resolveQuizFile, writeQuizAsXml } from "./text-quiz.ts";
import type { QuizTemplate } from "../quiz/template-parser.ts";

/** Error de quizpath (mensaje = clave de idioma). */
export class QuizPathError extends Error {}

import { composedir } from "../varset.ts";
export { composedir } from "../varset.ts";

/** Mod_userclass::get_classes_for_user — clases en las que está el usuario. */
export function getClassesForUser(userid: number): number[] {
  const db = getAppDb();
  const rows = db.prepare("SELECT classid FROM bol_userclass WHERE userid = ?").all(userid) as {
    classid: number;
  }[];
  return rows.map((r) => r.classid);
}

/** Mod_classdir::get_classes_for_dir — clases habilitadas para un directorio. */
export function getClassesForDir(dir: string): number[] {
  const db = getAppDb();
  const row = db.prepare("SELECT id FROM bol_exercisedir WHERE pathname = ?").get(dir) as
    | { id: number }
    | undefined;
  if (!row) return [];
  const rows = db.prepare("SELECT classid FROM bol_classexercise WHERE pathid = ?").all(row.id) as {
    classid: number;
  }[];
  return rows.map((r) => r.classid);
}

/** Mod_classdir::may_access — acceso (por clases) a un path relativo. */
export function mayAccess(root: string, relativePath: string, classes: number[]): boolean {
  if (relativePath === "") return true;
  const myClasses = [...classes, 0]; // Everybody is in this class

  let checking = "";
  for (const comp of relativePath.split("/")) {
    checking = composedir(checking, comp);
    if (isDirectory(path.join(root, checking))) {
      const classesForDir = getClassesForDir(checking);
      const maySee = classesForDir.some((c) => myClasses.includes(c));
      if (!maySee) return false;
    }
  }
  return true;
}

/** Mod_classdir::filter_directories — [dir, may_see] por directorio. */
export function filterDirectories(
  root: string,
  directories: string[],
  relativeDir: string,
  classes: number[],
): Array<[string, boolean]> {
  const myClasses = [...classes, 0]; // Everybody is in this class
  const good: Array<[string, boolean]> = [];
  for (const dir of directories) {
    const classesForDir = getClassesForDir(composedir(relativeDir, dir));
    const maySee = classesForDir.some((c) => myClasses.includes(c));
    good.push([dir, maySee]);
  }
  return good;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function pathExists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Mod_classdir::rmdir — elimina exercisedir/classexercise del directorio. */
export function removeClassesForDir(dir: string): void {
  const d = dir.replace(/\/+$/, "");
  const db = getAppDb();
  const row = db.prepare("SELECT id FROM bol_exercisedir WHERE pathname = ?").get(d) as { id: number } | undefined;
  if (!row) return;
  db.prepare("DELETE FROM bol_classexercise WHERE pathid = ?").run(row.id);
  db.prepare("DELETE FROM bol_exercisedir WHERE id = ?").run(row.id);
}

/** Mod_classdir::update_classes_for_dir — clases visibles para un directorio. */
export function updateClassesForDir(dir: string, oldClasses: number[], newClasses: number[]): void {
  const d = dir.replace(/\/+$/, "");
  const db = getAppDb();
  const row = db.prepare("SELECT id FROM bol_exercisedir WHERE pathname = ?").get(d) as { id: number } | undefined;
  let pathid: number;
  if (!row) {
    pathid = Number(db.prepare("INSERT INTO bol_exercisedir (pathname) VALUES (?)").run(d).lastInsertRowid);
  } else {
    pathid = row.id;
  }

  for (const newid of newClasses) {
    if (oldClasses.includes(newid)) continue;
    db.prepare("INSERT INTO bol_classexercise (pathid, classid) VALUES (?, ?)").run(pathid, newid);
  }
  for (const oldid of oldClasses) {
    if (newClasses.includes(oldid)) continue;
    db.prepare("DELETE FROM bol_classexercise WHERE pathid = ? AND classid = ?").run(pathid, oldid);
  }
}

/**
 * Mod_quizpath::fix_exerciseowner — sincroniza bol_exerciseowner con el
 * filesystem: añade ownerid=0 para los .3et sin registro y borra los
 * registros de ficheros que ya no existen.
 */
export function fixExerciseowner(): { added: string[]; deleted: string[] } {
  const added: string[] = [];
  const db = getAppDb();

  const walk = (relDir: string): void => {
    for (const nam of readdirSync(path.join(QUIZZES_DIR, relDir))) {
      const full = path.join(QUIZZES_DIR, relDir, nam);
      if (isDirectory(full)) {
        walk(relDir === "" ? nam : `${relDir}/${nam}`);
      } else if (endswithNocase(nam, ".3et")) {
        const rel = relDir === "" ? nam : `${relDir}/${nam}`;
        const exists = db
          .prepare("SELECT COUNT(*) AS n FROM bol_exerciseowner WHERE pathname = ?")
          .get(rel) as { n: number };
        if (exists.n === 0) {
          db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES (?, 0)").run(rel);
          added.push(rel);
        }
      }
    }
  };
  walk("");

  const deleted: string[] = [];
  const rows = db.prepare("SELECT id, pathname FROM bol_exerciseowner").all() as {
    id: number;
    pathname: string;
  }[];
  for (const row of rows) {
    if (!pathExists(path.join(QUIZZES_DIR, row.pathname))) {
      db.prepare("DELETE FROM bol_exerciseowner WHERE id = ?").run(row.id);
      deleted.push(row.pathname);
    }
  }
  return { added, deleted };
}

function endswithNocase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().endsWith(needle.toLowerCase());
}

/** Resultado de dirlist() (1:1 con Mod_quizpath::dirlist). */
export interface DirList {
  directories: Array<[string, boolean]>;
  is_empty: Record<string, boolean>;
  files: Array<{ filename: string; userid: number | null; fixedquestions?: number; randomize?: boolean }>;
  parentdir: string | null;
  relativedir: string;
}

/**
 * Ctrl_file_manager::insert_files (núcleo 1:1) — completa la copia/movimiento
 * pendiente: valida destinos y owners, copia, fija el owner y borra el
 * origen si es move. La sesión files/operation/from_dir la gestiona la action.
 */
export function insertFiles(
  qp: QuizPath,
  src: QuizPath,
  files: string[],
  operation: "copy" | "move",
  myid: number,
  isadmin: boolean,
): void {
  const fileowner: Record<string, number> = {};
  for (const f of files) {
    if (qp.fileExistsAt(f))
      throw new QuizPathError(
        `Destination file '${f}' already exists. Delete or rename it. ` +
          (operation === "copy"
            ? "Then try to insert the copied files again."
            : "Then try to insert the moved files again."),
      );
    if (operation === "move") {
      const owner = src.getExerciseOwner(f);
      fileowner[f] = owner;
      if (owner !== myid && !isadmin)
        throw new QuizPathError(
          files.length === 1 ? "You do not own this file" : "You do not own all of the selected files",
        );
    }
  }

  for (const f of files) {
    try {
      copyFileSync(src.getAbsoluteFor(f), qp.getAbsoluteFor(f));
    } catch {
      throw new QuizPathError(`Cannot copy file '${f}'`);
    }
    qp.setOwner(operation === "move" ? fileowner[f] : myid, NaN, f);
  }

  if (operation === "move") src.deleteFiles(files, myid, isadmin);
}

/**
 * Ctrl_file_manager::passage_insert (núcleo 1:1) — copia la selección de
 * pasajes del origen a los ficheros marcados (misma BD y owner obligatorios).
 */
export function insertPassages(dir: string, files: string[], passageSource: string, myid: number): void {
  let decodedSrc: QuizTemplate;
  try {
    decodedSrc = decodeQuiz(passageSource);
  } catch {
    throw new QuizPathError(`Cannot open file: ${passageSource}`);
  }
  const database = decodedSrc.database;
  const selectedPaths = decodedSrc.selectedPaths;

  for (const f of files) {
    const dest = decodeQuiz(`${dir}/${f}`);
    if (dest.database !== database)
      throw new QuizPathError(
        `The file '${f}' does not use the database '${database}'.\n` + "None of the files have been modified.",
      );
    const qp = createQuizPath(false);
    qp.init(`${dir}/${f}`, false, false, []);
    if (qp.getExerciseOwner() !== myid)
      throw new QuizPathError("You do not own all of the selected files\nNone of the files have been modified.");
  }

  for (const f of files) {
    const dest = decodeQuiz(`${dir}/${f}`);
    dest.selectedPaths = selectedPaths;
    try {
      writeQuizAsXml(dest, resolveQuizFile(`${dir}/${f}`));
    } catch {
      throw new QuizPathError("Cannot write to quiz file");
    }
  }
}


export class QuizPath {
  private root: string;
  private checkAccess: boolean;
  private usersClasses: number[] = [];
  canonicalAbsolute = "";
  canonicalRelative = "";
  canonicalRelativeSlash = "";

  constructor(root: string, checkAccess: boolean) {
    this.root = root;
    this.checkAccess = checkAccess;
  }

  /** init(path, must_be_dir, check_access, must_exist=true) de Mod_quizpath. */
  init(qpath: string, mustBeDir: boolean, checkAccess: boolean, userClasses: number[], mustExist = true): void {
    qpath = qpath.replace(/\/+$/, "");

    this.canonicalAbsolute = this.rel2abs(qpath, mustExist);

    // Verify that we are below the quizzes directory
    if (!this.canonicalAbsolute.startsWith(this.root))
      throw new QuizPathError("illegal_folder");

    // Make canonical_relative the relative directory name with . and .. removed
    this.canonicalRelative = this.abs2rel(this.canonicalAbsolute, mustExist);
    this.canonicalRelativeSlash = this.canonicalRelative === "" ? "" : this.canonicalRelative + "/";

    // Verify that this is a directory, if required
    if (mustBeDir && !isDirectory(this.canonicalAbsolute)) throw new QuizPathError("not_a_folder");

    // Verify that we have access to this directory
    if (checkAccess && this.checkAccess) {
      this.usersClasses = userClasses;
      if (!mayAccess(this.root, this.canonicalRelative, this.usersClasses))
        throw new QuizPathError("access_denied_to");
    }
  }

  fileExists(): boolean {
    try {
      return statSync(this.canonicalAbsolute).isFile();
    } catch {
      return false;
    }
  }

  /** ¿Existe un fichero con el nombre relativo en el directorio actual? */
  fileExistsAt(name: string): boolean {
    return pathExists(path.join(this.canonicalAbsolute, name));
  }

  /** Path absoluto de un fichero relativo al directorio actual. */
  getAbsoluteFor(name: string): string {
    return path.join(this.canonicalAbsolute, name);
  }

  getAbsolute(): string {
    return this.canonicalAbsolute;
  }

  getRelative(): string {
    return this.canonicalRelative;
  }

  /** dirlist(doing_test) — mapa del directorio (profundidad 2, dirs vacíos reconocibles). */
  dirlist(doingTest: boolean): DirList {
    let entries: string[];
    try {
      entries = readdirSync(this.canonicalAbsolute);
    } catch {
      throw new QuizPathError("illegal_folder");
    }

    const files: DirList["files"] = [];
    const directories: string[] = [];
    const dirIsEmpty: Record<string, boolean> = {};

    for (const nam of entries) {
      const full = path.join(this.canonicalAbsolute, nam);
      if (isDirectory(full)) {
        directories.push(nam);
        try {
          dirIsEmpty[nam] = readdirSync(full).length === 0;
        } catch {
          dirIsEmpty[nam] = true;
        }
      } else if (endswithNocase(nam, ".3et")) {
        const f: DirList["files"][number] = {
          filename: doingTest ? nam.replace(/\.3et$/, "") : nam,
          userid: null,
        };
        files.push(f);

        if (doingTest) {
          const contents = readQuizFileSafe(path.join(this.canonicalAbsolute, nam));
          if (contents === null) throw new QuizPathError("cannot_open_file");
          const decoded = harvest(contents);
          f.fixedquestions = decoded.fixedquestions ?? 0;
          f.randomize = decoded.randomize ?? true;
        }
      }
    }

    files.sort((a, b) => a.filename.localeCompare(b.filename));
    directories.sort();

    // Add owner information
    if (!doingTest) this.getExerciseOwners(files);

    const parentdir = this.isTop() ? null : this.abs2rel(path.join(this.canonicalAbsolute, ".."), true);

    const goodDirectories = this.checkAccess
      ? filterDirectories(this.root, directories, this.canonicalRelative, this.usersClasses)
      : directories.map((d) => [d, true] as [string, boolean]);

    return {
      directories: goodDirectories,
      is_empty: dirIsEmpty,
      files,
      parentdir,
      relativedir: this.canonicalRelative,
    };
  }

  /** Mod_quizpath::is_top — estamos en el directorio raíz. */
  isTop(): boolean {
    return this.canonicalRelative === "";
  }

  /** Mod_quizpath::get_excercise_owner — owner del fichero actual o de un nombre. */
  getExerciseOwner(filename: string | null = null): number {
    const pathname = filename === null ? this.canonicalRelative : this.canonicalRelativeSlash + filename;
    const db = getAppDb();
    const row = db.prepare("SELECT ownerid FROM bol_exerciseowner WHERE pathname = ?").get(pathname) as
      | { ownerid: number }
      | undefined;
    return row ? Number(row.ownerid) : 0;
  }

  /** get_excercise_owners — rellena userid de cada fichero desde bol_exerciseowner. */
  private getExerciseOwners(files: DirList["files"]): void {
    const db = getAppDb();
    for (const f of files) {
      const pathname = this.canonicalRelativeSlash + f.filename;
      const row = db.prepare("SELECT ownerid FROM bol_exerciseowner WHERE pathname = ?").get(pathname) as
        | { ownerid: number }
        | undefined;
      f.userid = row ? row.ownerid : null;
    }
  }

  /** Mod_quizpath::set_owner — inserta/actualiza owner y límite de tiempo (1:1). */
  setOwner(owner: number, timeLimit: string | number, filename: string | null = null): void {
    let tl = Number(timeLimit);
    if (tl === -1) tl = NaN; // null en BD
    const pathname = filename === null ? this.canonicalRelative : this.canonicalRelativeSlash + filename;

    const db = getAppDb();
    const exists = db
      .prepare("SELECT COUNT(*) AS n FROM bol_exerciseowner WHERE pathname = ?")
      .get(pathname) as { n: number };
    if (exists.n === 0) {
      db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid, time_seconds) VALUES (?, ?, ?)").run(
        pathname,
        owner,
        Number.isNaN(tl) ? null : tl,
      );
    } else {
      db.prepare("UPDATE bol_exerciseowner SET time_seconds = ? WHERE pathname = ?").run(
        Number.isNaN(tl) ? null : tl,
        pathname,
      );
    }
  }

  /** Mod_quizpath::mkdir — crea el directorio bajo el path actual. */
  mkdir(dir: string): void {
    try {
      mkdirSync(path.join(this.canonicalAbsolute, dir));
    } catch {
      throw new QuizPathError(`Cannot create folder '${dir}'`);
    }
  }

  /** Mod_quizpath::rename — renombra (añade .3et) y actualiza exerciseowner. */
  rename(oldname: string, newname: string): void {
    const oldfull = `${oldname}.3et`;
    const newfull = `${newname}.3et`;
    if (this.pathExists(path.join(this.canonicalAbsolute, newfull)))
      throw new QuizPathError(`'${newfull}' already exists`);
    try {
      renameSync(path.join(this.canonicalAbsolute, oldfull), path.join(this.canonicalAbsolute, newfull));
    } catch {
      throw new QuizPathError(`Cannot rename '${oldfull}' to '${newfull}'`);
    }
    getAppDb()
      .prepare("UPDATE bol_exerciseowner SET pathname = ? WHERE pathname = ?")
      .run(this.canonicalRelativeSlash + newfull, this.canonicalRelativeSlash + oldfull);
  }

  /** Mod_quizpath::rmdir — borra el directorio (solo vacío) y sus registros. */
  rmdir(dir: string): void {
    const relativedir = this.abs2rel(path.join(this.canonicalAbsolute, dir), true);
    try {
      rmdirSync(path.join(this.canonicalAbsolute, dir));
    } catch {
      throw new QuizPathError(`Cannot delete folder '${dir}'`);
    }
    removeClassesForDir(relativedir);
  }

  /** Mod_quizpath::check_delete_files — owner del usuario (o admin) en todos. */
  checkDeleteFiles(files: string[], myId: number, isAdmin: boolean): void {
    for (const f of files) {
      const owner = this.getExerciseOwner(f);
      if (owner !== myId && !isAdmin)
        throw new QuizPathError(
          files.length === 1 ? "You do not own this file" : "You do not own all of the selected files",
        );
    }
  }

  /** Mod_quizpath::delete_files — check_delete_files + borrado (fs y owner). */
  deleteFiles(files: string[], myId: number, isAdmin: boolean): void {
    this.checkDeleteFiles(files, myId, isAdmin);
    const db = getAppDb();
    for (const f of files) {
      try {
        unlinkSync(path.join(this.canonicalAbsolute, f));
      } catch {
        throw new QuizPathError(`Cannot delete file '${f}'`);
      }
      db.prepare("DELETE FROM bol_exerciseowner WHERE pathname = ?").run(this.canonicalRelativeSlash + f);
    }
  }

  /** Mod_quizpath::chown_files — cambia el owner si el destino es teacher/admin. */
  chownFiles(files: string[], userid: number): void {
    const db = getAppDb();
    const user = db
      .prepare("SELECT id FROM bol_user WHERE id = ? AND (isteacher = 1 OR isadmin = 1)")
      .get(userid);
    if (!user) throw new QuizPathError("The new owner is not a facilitator");
    for (const f of files) {
      const pathname = this.canonicalRelativeSlash + f;
      const exists = db
        .prepare("SELECT COUNT(*) AS n FROM bol_exerciseowner WHERE pathname = ?")
        .get(pathname) as { n: number };
      if (exists.n === 0)
        db.prepare("INSERT INTO bol_exerciseowner (pathname, ownerid) VALUES (?, ?)").run(pathname, userid);
      else db.prepare("UPDATE bol_exerciseowner SET ownerid = ? WHERE pathname = ?").run(userid, pathname);
    }
  }

  /** rel2abs(path, must_exist) — resuelve el path absoluto bajo el root. */
  private rel2abs(qpath: string, mustExist: boolean): string {
    const abs = path.resolve(this.root, qpath);
    if (mustExist && !this.pathExists(abs)) throw new QuizPathError("not_a_folder");
    return abs;
  }

  /** abs2rel(path, must_exist) — relativo al root con . y .. eliminados. */
  private abs2rel(abs: string, mustExist: boolean): string {
    if (!abs.startsWith(this.root)) throw new QuizPathError("illegal_folder");
    const rel = path.relative(this.root, abs).replace(/^\.\.(\/|$)/, "");
    if (mustExist && !this.pathExists(abs)) throw new QuizPathError("not_a_folder");
    return rel === "." ? "" : rel.replace(/\\/g, "/");
  }

  private pathExists(p: string): boolean {
    try {
      statSync(p);
      return true;
    } catch {
      return false;
    }
  }
}

function readQuizFileSafe(filename: string): string | null {
  try {
    return readFileSync(filename, "utf8");
  } catch {
    return null;
  }
}

/** Crea el QuizPath con el root por defecto (data/quizzes). */
export function createQuizPath(checkAccess: boolean): QuizPath {
  return new QuizPath(QUIZZES_DIR, checkAccess);
}
