/**
 * quiz/universe-tree.ts — Réplica 1:1 de `libraries/Universe_tree.php`
 * (versión actual: modelo de árbol jstree con carga perezosa).
 *
 * UniverseTree: árbol del universo completo con los caminos `markedList`
 * expandidos. expandLevel(): expansión perezosa de un nivel para jstree.
 */

import type { CorpusHandle } from "../corpus/emdros.ts";
import type { Dbinfo } from "../corpus/db-config.ts";
import { getMonadsAtLevel } from "../corpus/emdros.ts";
import { OlMonadSet } from "../corpus/monads.ts";

/** sprintf() con un solo %s (PHP). */
function sprintfLabel(label: string, name: string | number): string {
  return label.replace(/%s/g, String(name));
}

/**
 * Models a Node as it is known in jstree.
 * $name puede ser string (nombre de libro) o entero (número de capítulo).
 */
export class TreeNode {
  data: string;
  state: string | undefined;
  attr: { "data-ref": string; "data-rangelow": number; "data-rangehigh": number; "data-lev": number };
  children: TreeNode[] | undefined;
  private ms: OlMonadSet;
  private ident: string;

  constructor(
    name: string | number,
    ms: OlMonadSet,
    hierLevel: number,
    isLeaf: boolean,
    ident: string,
    deps: { dbinfo: Dbinfo; l10nUniverse: Record<string, Record<string, string>> | undefined },
  ) {
    const hierarchy = deps.dbinfo.universeHierarchy;
    if (hierLevel < 1 || hierLevel > hierarchy.length) {
      this.data = String(name); // Must be string
    } else {
      const hierType = hierarchy[hierLevel - 1].type;
      const universe = deps.l10nUniverse?.[hierType];
      const label = universe?.["_label"] ?? "%s";
      let n: string | number = name;
      const localized = universe?.[String(name)];
      if (localized !== undefined) n = localized;
      this.data = sprintfLabel(label, n);
    }

    if (!isLeaf) {
      this.state = "closed";
      this.children = [];
    }
    this.attr = {
      "data-ref": ident,
      "data-rangelow": ms.low(),
      "data-rangehigh": ms.high1(),
      "data-lev": hierLevel,
    };
    this.ms = ms;
    this.ident = ident;
  }

  getLevel(): number {
    return this.attr["data-lev"];
  }

  get_monadset(): OlMonadSet {
    return this.ms;
  }

  add(child: TreeNode): void {
    this.children!.push(child);
  }

  getIdent(): string {
    if (this.ident === "") return "";
    return `${this.ident}:`;
  }

/** json_encode del PHP: solo las propiedades públicas. */
  toJSON(): TreeNodeJSON {
    return {
      data: this.data,
      ...(this.state !== undefined ? { state: this.state } : {}),
      attr: this.attr,
      ...(this.children !== undefined ? { children: this.children.map((c) => c.toJSON()) } : {}),
    };
  }
}

export interface TreeNodeJSON {
  data: string;
  state?: string;
  attr: { "data-ref": string; "data-rangelow": number; "data-rangehigh": number; "data-lev": number };
  children?: TreeNodeJSON[];
}

export interface UniverseTreeParams {
  markedList: string[] | null;
}

export class UniverseTree {
  top!: TreeNode;
  private markedList!: string[] | null;
  private deps: { handle: CorpusHandle; dbinfo: Dbinfo; everythingLabel: string; l10nUniverse: Record<string, Record<string, string>> | undefined };

  constructor(
    params: UniverseTreeParams | null,
    deps: { handle: CorpusHandle; dbinfo: Dbinfo; everythingLabel: string; l10nUniverse: Record<string, Record<string, string>> | undefined },
  ) {
    this.deps = deps;
    if (params !== null) {
      this.markedList = params.markedList;
      const fullUniverse = new OlMonadSet();
      // fullUniverse(): MIN_M..MAX_M (get_quiz_universe/Mod_askemdros)
      const rows = deps.handle.mql.exec("SELECT MIN_M GOqxqxqx\nSELECT MAX_M GOqxqxqx\n");
      fullUniverse.addOne(Number(rows[0].get_table()!.get_cell(0, 0)), Number(rows[1].get_table()!.get_cell(0, 0)));
      this.top = new TreeNode(deps.everythingLabel, fullUniverse, 0, false, "", {
        dbinfo: deps.dbinfo,
        l10nUniverse: deps.l10nUniverse,
      });
      this.addLevel(this.top);
      this.top.state = "open"; // Top level is open
    }
  }

  get_jstree(): string {
    return JSON.stringify(this.top.toJSON());
  }

  private static startswith(haystack: string, needle: string): boolean {
    return haystack.slice(0, needle.length) === needle;
  }

  /** searchMarked(): 0 = sin match, 1 = parcial, 2 = completo. */
  private searchMarked(marked: string): number {
    if (this.markedList === null) return 0;
    const markedC = `${marked}:`;
    for (const id of this.markedList) {
      if (id === marked) return 2;
      if (UniverseTree.startswith(id, markedC)) return 1;
    }
    return 0;
  }

  private addLevel(parent: TreeNode): void {
    const parentLevel = parent.getLevel();
    const hierarchy = this.deps.dbinfo.universeHierarchy;
    const childIsLeaf = parentLevel + 1 === hierarchy.length;
    const childMss = getMonadsAtLevel(this.deps.handle, parent.get_monadset(), parentLevel);

    for (const [feat, ms] of Object.entries(childMss)) {
      const childIdent = parent.getIdent() + feat;
      const child = new TreeNode(feat, ms, parentLevel + 1, childIsLeaf, childIdent, {
        dbinfo: this.deps.dbinfo,
        l10nUniverse: this.deps.l10nUniverse,
      });

      parent.add(child);

      switch (this.searchMarked(childIdent)) {
        case 1: // Partial match
          this.addLevel(child);
          break;
        case 2: // Full match
          // m_savedPaths.add(new TreePath(child.getPath()));
          break;
      }
    }
  }

  /** expand_level(): expansión perezosa de un nivel (GET /?rangelow=…). */
  expandLevel(rangelow: number, rangehigh: number, ref: string | number, lev: number): TreeNode[] {
    const res: TreeNode[] = [];
    const ms = new OlMonadSet();
    ms.addOne(rangelow, rangehigh);

    const hierarchy = this.deps.dbinfo.universeHierarchy;
    const childIsLeaf = lev === hierarchy.length;
    const childMss = getMonadsAtLevel(this.deps.handle, ms, lev - 1);

    for (const [feat, mset] of Object.entries(childMss)) {
      const childIdent = `${ref}:${feat}`;
      res.push(
        new TreeNode(feat, mset, lev, childIsLeaf, childIdent, {
          dbinfo: this.deps.dbinfo,
          l10nUniverse: this.deps.l10nUniverse,
        }),
      );
    }
    return res;
  }
}