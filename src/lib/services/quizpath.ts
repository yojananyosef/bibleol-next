/**
 * services/quizpath.ts — Réplica 1:1 de `models/Mod_quizpath.php` (+ las
 * funciones de `Mod_classdir` que usa: get_classes_for_dir / may_access /
 * filter_directories) sobre el filesystem `data/quizzes/`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { QUIZZES_DIR, getAppDb } from "../db/sqlite.ts";
import { harvest } from "../quiz/template-parser.ts";

/** Error de quizpath (mensaje = clave de idioma). */
export class QuizPathError extends Error {}

/** `composedir` de varset_helper.php — compone dir + path (1:1). */
export function composedir(dir: string, path_: string): string {
  if (dir === "") return path_;
  if (path_ === "") return dir;
  return `${dir}/${path_}`;
}

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
